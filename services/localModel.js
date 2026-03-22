/**
 * Local on-device AI inference using llama.rn (llama.cpp React Native bindings).
 *
 * Runs a quantized GGUF model locally on the device. All inference
 * happens on-device for privacy and offline capability.
 *
 * The model is downloaded on first launch (~1.3GB for Qwen 3.5 2B Q4_K_M)
 * and cached in the app's document directory.
 */

import RNFS from 'react-native-fs';
import { initLlama } from 'llama.rn';
import { isRunningOnly, getDisciplinesForProfile } from './raceConfig';

const MODEL_FILENAME = 'Qwen3.5-2B-Q4_K_M.gguf';
const MODEL_URL =
  'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf';
const STOP_WORDS = ['<|im_end|>', '<|endoftext|>', '<|end|>'];

let llamaContext = null;
let modelLoaded = false;
let loadingProgress = 0;
let onProgressCallback = null;

/**
 * Get the local file path for the model.
 */
function getModelPath() {
  return `${RNFS.DocumentDirectoryPath}/${MODEL_FILENAME}`;
}

/**
 * Register a callback to receive model download/load progress (0-100).
 */
export function onModelProgress(callback) {
  onProgressCallback = callback;
}

/**
 * Check if the model file exists on device.
 */
export async function isModelDownloaded() {
  const exists = await RNFS.exists(getModelPath());
  if (!exists) return false;
  const stat = await RNFS.stat(getModelPath());
  return stat.size > 0;
}

/**
 * Download the model file to device storage.
 */
export async function downloadModel() {
  const modelPath = getModelPath();
  const downloaded = await isModelDownloaded();
  if (downloaded) return true;

  // eslint-disable-next-line no-console
  console.log('Model not found on device, downloading...');
  try {
    const result = await RNFS.downloadFile({
      fromUrl: MODEL_URL,
      toFile: modelPath,
      background: true,
      discretionary: false,
      progress: (res) => {
        const pct = Math.round((res.bytesWritten / res.contentLength) * 100);
        loadingProgress = pct;
        if (onProgressCallback) onProgressCallback(pct);
      },
      progressDivider: 5,
    }).promise;
    return result.statusCode === 200;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('Model download error:', e.message || e);
    await RNFS.unlink(modelPath).catch(() => {});
    return false;
  }
}

/**
 * Initialize the local model. Downloads if needed, then loads into memory.
 * Returns true if model is ready for inference.
 */
export async function initLocalModel() {
  if (modelLoaded && llamaContext) return true;

  try {
    const downloaded = await isModelDownloaded();
    if (!downloaded) {
      // eslint-disable-next-line no-console
      console.log('Model not found on device, downloading...');
      const ok = await downloadModel();
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log('Model download failed, falling back to rule-based responses');
        return false;
      }
    }

    const modelPath = getModelPath();
    llamaContext = await initLlama(
      {
        model: modelPath,
        n_ctx: 4096,
        n_gpu_layers: 99,
        n_threads: 4,
        use_mlock: true,
      },
      (progress) => {
        const pct = Math.round(progress * 100);
        loadingProgress = pct;
        if (onProgressCallback) onProgressCallback(pct);
      }
    );

    modelLoaded = true;
    // eslint-disable-next-line no-console
    console.log('Local LLM loaded successfully');
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('Failed to initialize local model:', e.message || e);
    modelLoaded = false;
    llamaContext = null;
    return false;
  }
}

/**
 * Get the current model loading progress (0-100).
 */
export function getModelLoadingProgress() {
  return loadingProgress;
}

/**
 * Check if the model is ready for inference.
 */
export function isModelReady() {
  return modelLoaded && llamaContext !== null;
}

const HARD_TITLE_KEYWORDS = ['tempo', 'threshold', 'interval', 'vo2', 'sprint', 'fartlek', 'speed'];
const EASY_TITLE_KEYWORDS = ['easy', 'recovery', 'base', 'aerobic', 'zone 2', 'z2'];

function classifyIntensity(workout) {
  if (workout.intensity === 'hard') return 'hard';
  if (workout.intensity === 'easy' || workout.intensity === 'recovery') return 'easy';
  const title = (workout.title || '').toLowerCase();
  if (HARD_TITLE_KEYWORDS.some((kw) => title.includes(kw))) return 'hard';
  if (EASY_TITLE_KEYWORDS.some((kw) => title.includes(kw))) return 'easy';
  return 'moderate';
}

const WARMUP_COOLDOWN_NAMES = ['warm', 'cool', 'recovery', 'flush', 'stretch'];

/**
 * Return true if this section is a warmup or cooldown by name.
 * Warmup/cooldown zones are intentionally low (Z1-Z2) — do not correct them.
 */
function isWarmupOrCooldown(section) {
  const name = (section.name || '').toLowerCase();
  return WARMUP_COOLDOWN_NAMES.some((kw) => name.includes(kw));
}

/**
 * Fix zone numbers in AI-generated sections to match workout intensity.
 *
 * Prior bug: used index-based "middle section" detection which broke for workouts
 * with 2 sections (warmup + main) — the main set IS the last section, so it was
 * silently skipped. Now uses section name to identify warmup/cooldown instead.
 *
 * Hard/tempo workouts: non-warmup-cooldown zones must be >= 3.
 * Easy/recovery workouts: non-warmup-cooldown zones must be <= 2.
 */
function enforceZoneConsistency(workout) {
  if (!workout.sections?.length) return workout;
  const classification = classifyIntensity(workout);
  if (classification === 'moderate') return workout;

  const sections = workout.sections.map((section) => {
    // Leave warmup and cooldown zones as-is — they should stay Z1-Z2
    if (isWarmupOrCooldown(section) || !section.sets) return section;

    const sets = section.sets.map((set) => {
      if (set.zone === null || set.zone === undefined) return set;
      if (classification === 'hard' && set.zone < 3) return { ...set, zone: 3 };
      if (classification === 'easy' && set.zone > 2) return { ...set, zone: 2 };
      return set;
    });
    return { ...section, sets };
  });
  return { ...workout, sections };
}

/**
 * Sanitize a parsed AI workout:
 * - Rest days get duration 0
 * - Main set zones are corrected to match intensity / title keywords
 *   (AI sometimes writes Zone 2 in Tempo workouts — this catches the mismatch)
 *
 * Exported so AppContext can run it on cached workouts loaded from AsyncStorage,
 * fixing any stale entries that were generated before this sanitizer existed.
 */
export function sanitizeWorkout(workout) {
  if (!workout) return workout;
  if (workout.discipline === 'rest') {
    return { ...workout, duration: 0 };
  }
  return enforceZoneConsistency(workout);
}

/**
 * Thrown by runInference when the local model is not yet loaded.
 * Callers should surface this to the user rather than falling back silently.
 */
export class ModelNotReadyError extends Error {
  constructor() {
    super('Local AI model is not ready. Please wait for it to finish loading.');
    this.name = 'ModelNotReadyError';
  }
}

/**
 * Thrown by runInference when the prompt exceeds the model's context window.
 */
export class ContextFullError extends Error {
  constructor() {
    super('Prompt is too long for the AI model context window.');
    this.name = 'ContextFullError';
  }
}

/**
 * Run inference using the local llama.rn model.
 * Throws ModelNotReadyError if the model is not loaded.
 * Throws ContextFullError if the prompt exceeds the context window.
 */
export async function runInference(systemPrompt, userPrompt) {
  if (!modelLoaded || !llamaContext) {
    throw new ModelNotReadyError();
  }

  try {
    const result = await llamaContext.completion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      n_predict: 512,
      stop: STOP_WORDS,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
    });
    return result.text || null;
  } catch (e) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('context') || msg.includes('kv cache') || msg.includes('too long')) {
      throw new ContextFullError();
    }
    throw e;
  }
}

/**
 * Return a HR range hint string for a given zone number.
 * Returns empty string if hrZones is unavailable.
 *
 * @param {number} zoneNum - Zone number (1-5)
 * @param {Object|null} hrZones - HR zones object from buildKarvonenZones or deriveHRZonesFromWorkouts
 * @returns {string}
 */
function zoneHRHint(zoneNum, hrZones) {
  if (!hrZones?.zones?.[zoneNum - 1]) return '';
  const z = hrZones.zones[zoneNum - 1];
  return ` (${z.min}-${z.max} bpm)`;
}

/**
 * Inject HR range hints into workout set descriptions that include a zone.
 *
 * @param {Object} workout - Parsed workout object with sections/sets
 * @param {Object|null} hrZones - HR zones object
 * @returns {Object} Workout with enriched set descriptions
 */
function injectHRHintsIntoWorkout(workout, hrZones) {
  if (!hrZones || !workout?.sections) return workout;
  return {
    ...workout,
    sections: workout.sections.map((section) => ({
      ...section,
      sets: section.sets.map((set) => {
        if (set.zone == null) return set;
        return {
          ...set,
          description: set.description + zoneHRHint(set.zone, hrZones),
        };
      }),
    })),
  };
}

/**
 * Generate a daily workout using local model or rule-based fallback.
 */
export async function generateWorkoutLocally({
  profile,
  healthData,
  readinessScore,
  phase,
  daysToRace,
  completedWorkouts,
  targetDate,
  targetDiscipline,
  trends,
  hrZones,
}) {
  const raceType = profile.raceType || 'triathlon';
  const coachType = isRunningOnly(profile) ? 'running' : 'endurance triathlon';
  const disciplines = getDisciplinesForProfile(profile).filter(
    (d) => d !== 'rest' && d !== 'strength'
  );
  const recentActivity = formatRecentWorkouts(completedWorkouts);

  const systemPrompt = `You are an elite ${coachType} coach. Generate a JSON workout.
Respond ONLY with valid JSON matching this structure:
{"title":"string","discipline":"${disciplines.join('|')}|strength|rest","duration":number,"summary":"string","intensity":"easy|moderate|hard|recovery","sections":[{"name":"string","notes":"string","sets":[{"description":"string","zone":number|null}]}]}${targetDiscipline ? `\nThe discipline MUST be exactly: "${targetDiscipline}". Do not change it.` : ''}`;

  const insights = profile.athleteInsights;
  const activeAdjustment =
    insights?.loadAdjustmentExpiry && new Date(insights.loadAdjustmentExpiry) > new Date();
  const restRequestedToday =
    insights?.requestedRestDay &&
    new Date(insights.requestedRestDay).toDateString() ===
      (targetDate || new Date()).toDateString();
  const insightsContext = insights
    ? `\nAthlete mood: ${insights.recentMood}.` +
      (insights.painPoints?.length ? ` Pain: ${insights.painPoints.join(', ')}.` : '') +
      (insights.preferredIntensity ? ` Prefers ${insights.preferredIntensity} workouts.` : '') +
      (activeAdjustment
        ? ` Load adjustment active: ${insights.loadAdjustment} intensity/volume (expires ${new Date(insights.loadAdjustmentExpiry).toLocaleDateString()}).`
        : '') +
      (restRequestedToday ? ' Athlete requested rest today — prescribe rest.' : '')
    : '';

  const trendsContext = trends?.health?.overallTrend
    ? `\nTrend: ${trends.health.overallTrend}.${trends.health.overallTrend === 'fatiguing' ? ' Reduce intensity and duration.' : ''}${trends.workout?.volumeTrend === 'increasing' ? ' Volume increasing — monitor load.' : ''}`
    : '';

  const userPrompt = `Athlete: ${profile.level || 'Intermediate'}, ${raceType} - ${profile.distance}, weekly hrs: ${profile.weeklyHours}, strongest: ${profile.strongestDiscipline}, weakest: ${profile.weakestDiscipline}, injuries: ${profile.injuries}, goal: ${profile.goalTime}.
Status: phase=${phase}, days to race=${daysToRace}, readiness=${readinessScore}/100, RHR=${healthData?.restingHR || 'N/A'}bpm, HRV=${healthData?.hrv || 'N/A'}ms, sleep=${healthData?.sleepHours?.toFixed(1) || 'N/A'}h.
Day: ${(targetDate || new Date()).toLocaleDateString('en-US', { weekday: 'long' })}.${targetDiscipline ? `\nTarget discipline: ${targetDiscipline}.` : ''}${insightsContext}${trendsContext}${recentActivity ? `\nRecent Apple Health activity:\n${recentActivity}` : ''}`;

  // Try local model first; fall back to rule-based if model not ready
  try {
    const modelResponse = await runInference(systemPrompt, userPrompt);
    if (modelResponse) {
      const jsonStr = modelResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(jsonStr);
      if (targetDiscipline && parsed.discipline !== targetDiscipline) {
        parsed.discipline = targetDiscipline;
      }
      return sanitizeWorkout(injectHRHintsIntoWorkout(parsed, hrZones));
    }
  } catch (e) {
    if (!(e instanceof ModelNotReadyError) && !(e instanceof ContextFullError)) throw e;
    // Model not ready — fall through to rule-based
  }

  // Rule-based fallback (works without model)
  return generateRuleBasedWorkout({
    profile,
    healthData,
    readinessScore,
    phase,
    daysToRace,
    completedWorkouts,
    targetDate,
    targetDiscipline,
    trends,
  });
}

/**
 * Generate a weekly summary using local model or simple aggregation.
 */
export async function generateWeeklySummaryLocally({ profile, weekHistory, phase }) {
  const coachType = isRunningOnly(profile) ? 'running' : 'endurance triathlon';
  const workoutList = weekHistory
    .map((w) => `${w.discipline}: ${w.title} (${w.duration || w.durationMinutes || 0}min)`)
    .join(', ');

  const systemPrompt = `You are an ${coachType} coach. Give a 2-3 paragraph weekly debrief. Plain text only.`;
  const userPrompt = `Athlete: ${profile.level || 'Intermediate'}, phase: ${phase}. Workouts: ${workoutList || 'none'}, total sessions: ${weekHistory.length}.`;

  let modelResponse = null;
  try {
    modelResponse = await runInference(systemPrompt, userPrompt);
  } catch (e) {
    if (!(e instanceof ModelNotReadyError) && !(e instanceof ContextFullError)) throw e;
  }
  if (modelResponse) return modelResponse;

  // Rule-based summary
  const totalMin = weekHistory.reduce((sum, w) => sum + (w.duration || 0), 0);
  const disciplines = {};
  weekHistory.forEach((w) => {
    const d = w.discipline?.toLowerCase() || 'other';
    disciplines[d] = (disciplines[d] || 0) + 1;
  });

  const parts = [
    `This week you completed ${weekHistory.length} sessions totaling ${Math.round(totalMin / 60)} hours and ${totalMin % 60} minutes of training.`,
  ];

  if (Object.keys(disciplines).length > 0) {
    const breakdown = Object.entries(disciplines)
      .map(([d, count]) => `${count} ${d}`)
      .join(', ');
    parts.push(`Breakdown: ${breakdown}.`);
  }

  parts.push(
    `You're in the ${phase.toLowerCase().replace('_', ' ')} phase. ${readinessMessage(phase)}`
  );

  return parts.join(' ');
}

function readinessMessage(phase) {
  const messages = {
    BASE: 'Focus on building consistent volume. Keep most sessions in Zone 2 and prioritize sleep.',
    BUILD: 'Time to add some intensity. Include one quality session per discipline each week.',
    PEAK: 'Your biggest training weeks are here. Balance hard sessions with adequate recovery.',
    TAPER: 'Volume is dropping but keep intensity up. Trust the process and prioritize rest.',
    RACE_WEEK: "Stay calm and stick to easy movement. You've done the work. Time to race.",
  };
  return messages[phase] || messages.BASE;
}

/**
 * Generate an alternative workout with a different discipline.
 * Priority: weakest discipline (if different), then cycle swim/bike/run.
 * If readiness < 55 and primary is hard, offer easier version of same sport.
 */
export async function generateAlternativeWorkout({
  profile,
  healthData,
  readinessScore,
  phase,
  daysToRace,
  excludeDiscipline,
}) {
  if (excludeDiscipline === 'rest' && (readinessScore || 65) < 55) {
    return null;
  }

  const altDiscipline = pickAlternativeDiscipline(excludeDiscipline, profile);
  const coachType = isRunningOnly(profile) ? 'running' : 'endurance triathlon';
  const systemPrompt = `You are an elite ${coachType} coach. Generate a JSON workout.
This is an ALTERNATIVE workout — the athlete chose not to do ${excludeDiscipline} today.
Generate a ${altDiscipline} workout instead.
Respond ONLY with valid JSON matching this structure:
{"title":"string","discipline":"swim|bike|run|strength|rest","duration":number,"summary":"string","intensity":"easy|moderate|hard|recovery","sections":[{"name":"string","notes":"string","sets":[{"description":"string","zone":number|null}]}]}`;

  const userPrompt = buildWorkoutUserPrompt(profile, healthData, readinessScore, phase, daysToRace);

  try {
    const modelResponse = await runInference(systemPrompt, userPrompt);
    if (modelResponse) {
      const jsonStr = modelResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return sanitizeWorkout(JSON.parse(jsonStr));
    }
  } catch (e) {
    if (!(e instanceof ModelNotReadyError) && !(e instanceof ContextFullError)) throw e;
  }

  const baseDuration = getBaseDuration(phase, profile.weeklyHours);
  const score = readinessScore || 65;
  const adjustedDuration =
    score >= 75 ? Math.round(baseDuration * 1.1) : Math.round(baseDuration * 0.9);
  return buildWorkout(altDiscipline, adjustedDuration, score, phase, profile);
}

/**
 * Pick the best alternative discipline, avoiding the excluded one.
 */
function pickAlternativeDiscipline(excludeDiscipline, profile) {
  const weak = profile.weakestDiscipline?.toLowerCase() || 'swim';
  const activeDisciplines = getDisciplinesForProfile(profile).filter(
    (d) => d !== 'rest' && d !== 'strength'
  );
  if (weak !== excludeDiscipline && activeDisciplines.includes(weak)) {
    return weak;
  }
  const remaining = activeDisciplines.filter((d) => d !== excludeDiscipline);
  return remaining[0] || 'run';
}

/**
 * Generate a replacement workout based on the athlete's reason for swapping.
 * Parses the reason to determine constraints (injury, fatigue, time).
 */
export async function generateReplacementWorkout({
  profile,
  healthData,
  readinessScore,
  phase,
  daysToRace,
  reason,
}) {
  const constraints = inferReplacementParams(reason);
  const coachType = isRunningOnly(profile) ? 'running' : 'endurance triathlon';

  const systemPrompt = `You are an elite ${coachType} coach. Generate a JSON workout.
The athlete requested a workout change because: "${reason}"
${constraints.excludeDisciplines.length > 0 ? `AVOID these disciplines: ${constraints.excludeDisciplines.join(', ')}` : ''}
${constraints.maxIntensity ? `Maximum intensity: ${constraints.maxIntensity}` : ''}
${constraints.maxDuration ? `Maximum duration: ${constraints.maxDuration} minutes` : ''}
Respond ONLY with valid JSON matching this structure:
{"title":"string","discipline":"swim|bike|run|strength|rest","duration":number,"summary":"string","intensity":"easy|moderate|hard|recovery","sections":[{"name":"string","notes":"string","sets":[{"description":"string","zone":number|null}]}]}`;

  const userPrompt = buildWorkoutUserPrompt(profile, healthData, readinessScore, phase, daysToRace);

  try {
    const modelResponse = await runInference(systemPrompt, userPrompt);
    if (modelResponse) {
      const jsonStr = modelResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return sanitizeWorkout(JSON.parse(jsonStr));
    }
  } catch (e) {
    if (!(e instanceof ModelNotReadyError) && !(e instanceof ContextFullError)) throw e;
  }

  return generateRuleBasedReplacement({ profile, readinessScore, phase, constraints });
}

/**
 * Parse reason text to determine workout constraints.
 */
function inferReplacementParams(reason) {
  const lower = (reason || '').toLowerCase();
  const excludeDisciplines = [];
  let maxIntensity = null;
  let maxDuration = null;

  if (
    lower.includes('knee') ||
    lower.includes('ankle') ||
    lower.includes('shin') ||
    lower.includes('foot')
  ) {
    excludeDisciplines.push('run');
  }
  if (lower.includes('shoulder') || lower.includes('arm')) {
    excludeDisciplines.push('swim');
  }
  if (lower.includes('back') || lower.includes('saddle') || lower.includes('seat')) {
    excludeDisciplines.push('bike');
  }

  if (
    lower.includes('tired') ||
    lower.includes('exhaust') ||
    lower.includes('fatigue') ||
    lower.includes('sore') ||
    lower.includes('sick') ||
    lower.includes('ill') ||
    lower.includes('unwell') ||
    lower.includes('not rested') ||
    lower.includes('not feeling')
  ) {
    maxIntensity = 'easy';
  }
  if (
    lower.includes('short') ||
    lower.includes('time') ||
    lower.includes('busy') ||
    lower.includes('quick')
  ) {
    maxDuration = 30;
  }

  return { excludeDisciplines, maxIntensity, maxDuration };
}

function generateRuleBasedReplacement({ profile, readinessScore, phase, constraints }) {
  const score = readinessScore || 65;
  const activeDisciplines = getDisciplinesForProfile(profile).filter((d) => d !== 'rest');
  const available = activeDisciplines.filter((d) => !constraints.excludeDisciplines.includes(d));
  const discipline = available[0] || 'rest';

  if (score < 55 || constraints.maxIntensity === 'easy') {
    const duration = constraints.maxDuration || 30;
    return buildWorkout('rest', duration, score, phase, profile);
  }

  const baseDuration = getBaseDuration(phase, profile.weeklyHours);
  const duration = constraints.maxDuration
    ? Math.min(baseDuration, constraints.maxDuration)
    : baseDuration;
  return buildWorkout(discipline, duration, score, phase, profile);
}

/**
 * Generate a weekly plan adjustment evaluating the past week.
 * Returns text advice about what to focus on next week.
 */
export async function generateWeeklyPlanAdjustment({
  profile,
  weekHistory,
  phase,
  daysToRace,
  complianceScore,
}) {
  const workoutList = (weekHistory || [])
    .map(
      (w) =>
        `${w.discipline}: ${w.title} (${w.duration || w.durationMinutes || 0}min${w.completedSets !== undefined ? `, ${w.completedSets}/${w.totalSets} sets` : ''})`
    )
    .join(', ');

  const coachType = isRunningOnly(profile) ? 'running' : 'endurance triathlon';
  const systemPrompt = `You are an elite ${coachType} coach. Review the athlete's past week and give a 2-3 paragraph adjustment plan for next week. Be specific about what to change. Plain text only.`;
  const userPrompt = `Athlete: ${profile.level || 'Intermediate'}, ${profile.raceType || 'triathlon'} - ${profile.distance}, phase: ${phase}, ${daysToRace ?? 'N/A'} days to race, compliance: ${complianceScore ?? 'N/A'}%.
This week: ${workoutList || 'no workouts completed'}, sessions: ${(weekHistory || []).length}.`;

  let modelResponse = null;
  try {
    modelResponse = await runInference(systemPrompt, userPrompt);
  } catch (e) {
    if (!(e instanceof ModelNotReadyError) && !(e instanceof ContextFullError)) throw e;
  }
  if (modelResponse) return modelResponse;

  return generateFallbackWeeklyAdjustment(weekHistory, phase, complianceScore);
}

function generateFallbackWeeklyAdjustment(weekHistory, phase, complianceScore) {
  const sessions = (weekHistory || []).length;
  const compliance = complianceScore ?? 0;

  const disciplines = {};
  (weekHistory || []).forEach((w) => {
    const d = w.discipline?.toLowerCase() || 'other';
    disciplines[d] = (disciplines[d] || 0) + 1;
  });

  const parts = [];
  if (sessions === 0) {
    parts.push(
      "You had no completed workouts this week. Consistency is the most important factor in training. Let's aim for at least 4-5 sessions next week."
    );
  } else {
    parts.push(`You completed ${sessions} sessions this week with ${compliance}% compliance.`);
    if (compliance >= 85) {
      parts.push('Excellent consistency! Next week, maintain this rhythm.');
    } else if (compliance >= 60) {
      parts.push('Decent effort, but aim to complete more of each session fully.');
    } else {
      parts.push(
        'Completion was low — consider if the workouts are too intense or if scheduling needs adjustment.'
      );
    }
  }

  const hasBike = disciplines.bike || 0;
  const hasSwim = disciplines.swim || 0;
  const hasRun = disciplines.run || 0;
  if (hasBike === 0) parts.push('No bike sessions — add at least one next week.');
  if (hasSwim === 0)
    parts.push('No swim sessions — swimming is important for race readiness. Add at least one.');
  if (hasRun === 0) parts.push('No run sessions — get at least one run in next week.');

  const phaseMessages = {
    BASE: 'Focus on Zone 2 volume and building consistency.',
    BUILD: 'Add one quality interval session per discipline.',
    PEAK: 'This is your biggest training week — push but recover well.',
    TAPER: 'Volume drops but keep intensity sharp. Trust the taper.',
    RACE_WEEK: 'Easy movement only. Stay calm, visualize the race.',
  };
  parts.push(phaseMessages[phase] || phaseMessages.BASE);

  return parts.join(' ');
}

function buildWorkoutUserPrompt(profile, healthData, readinessScore, phase, daysToRace) {
  return `Athlete: ${profile.level || 'Intermediate'}, ${profile.raceType || 'triathlon'} - ${profile.distance}, weekly hrs: ${profile.weeklyHours}, strongest: ${profile.strongestDiscipline}, weakest: ${profile.weakestDiscipline}, injuries: ${profile.injuries}, goal: ${profile.goalTime}.
Status: phase=${phase}, days to race=${daysToRace}, readiness=${readinessScore}/100, RHR=${healthData?.restingHR || 'N/A'}bpm, HRV=${healthData?.hrv || 'N/A'}ms, sleep=${healthData?.sleepHours?.toFixed(1) || 'N/A'}h.
Day: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.`;
}

/**
 * Rule-based workout generator — works without any model.
 * Uses readiness score, training phase, day of week, and athlete profile
 * to construct a structured workout.
 */
function generateRuleBasedWorkout({
  profile,
  _healthData,
  readinessScore,
  phase,
  _daysToRace,
  completedWorkouts,
  targetDate,
  targetDiscipline,
  trends,
}) {
  const date = targetDate || new Date();
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ...
  const score = readinessScore || 65;
  const isFatiguing = trends?.health?.overallTrend === 'fatiguing';

  // Use explicit discipline if provided, otherwise derive from weekly plan
  let discipline;
  if (targetDiscipline) {
    discipline = targetDiscipline;
  } else {
    const weekPlan = getWeeklyDisciplinePlan(phase, profile);
    discipline = weekPlan[dayOfWeek];

    // If a discipline is under-trained, prioritize it
    const balance = trends?.workout?.disciplineBalance;
    if (balance && !targetDiscipline && discipline !== 'rest') {
      const activeDisciplines = getDisciplinesForProfile(profile).filter(
        (d) => d !== 'rest' && d !== 'strength'
      );
      const undertrained = activeDisciplines.find(
        (d) => (balance[d] || 0) === 0 && d !== discipline
      );
      if (undertrained) {
        discipline = undertrained;
      }
    }

    // Avoid repeating yesterday's discipline if possible (only for today)
    if (!targetDate) {
      const yesterdayDiscipline = getYesterdayDiscipline(completedWorkouts);
      if (yesterdayDiscipline && discipline === yesterdayDiscipline && discipline !== 'rest') {
        const activeDisciplines = getDisciplinesForProfile(profile).filter(
          (d) => d !== 'rest' && d !== 'strength' && d !== yesterdayDiscipline
        );
        if (activeDisciplines.length > 0) {
          discipline = activeDisciplines[0];
        }
      }
    }
  }

  // Adjust duration based on phase and available hours
  const baseDuration = getBaseDuration(phase, profile.weeklyHours);
  let adjustedDuration =
    score >= 75 ? Math.round(baseDuration * 1.1) : Math.round(baseDuration * 0.9);

  // Fatigue trend: reduce duration by 15% and cap intensity at moderate
  if (isFatiguing) {
    adjustedDuration = Math.round(adjustedDuration * 0.85);
  }

  let effectiveScore = isFatiguing ? Math.min(score, 74) : score;

  // Check for coach-set load adjustment from conversation
  const insights = profile.athleteInsights;
  const adjustmentActive =
    insights?.loadAdjustmentExpiry && new Date(insights.loadAdjustmentExpiry) > new Date();

  // Rest day override: if athlete explicitly requested rest today
  const restToday =
    insights?.requestedRestDay &&
    new Date(insights.requestedRestDay).toDateString() === date.toDateString();
  if (restToday) {
    discipline = 'rest';
  }

  // Apply load reduction
  if (adjustmentActive && insights.loadAdjustment === 'reduce' && discipline !== 'rest') {
    adjustedDuration = Math.round(adjustedDuration * 0.75);
    effectiveScore = Math.min(effectiveScore, 64); // cap at moderate (below 65 threshold for hard)
  }

  // Apply load increase
  if (adjustmentActive && insights.loadAdjustment === 'increase' && discipline !== 'rest') {
    adjustedDuration = Math.round(adjustedDuration * 1.15);
  }

  return buildWorkout(discipline, adjustedDuration, effectiveScore, phase, profile);
}

export function getWeeklyDisciplinePlan(phase, profile) {
  if (isRunningOnly(profile)) {
    const basePlan = getRunningWeekPlan(phase);
    return applySchedulePreferences(basePlan, profile, 'run');
  }
  const weak = profile.weakestDiscipline?.toLowerCase() || 'swim';
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  // Rules: no two consecutive same discipline; long sessions & bricks on weekends (Sat=6, Sun=0).
  // BUILD/PEAK: Saturday is a brick session (bike → run transition).
  const plans = {
    BASE: ['swim', 'rest', 'run', 'bike', 'swim', 'run', 'bike'],
    BUILD: ['run', 'rest', 'swim', 'bike', 'run', 'rest', 'brick'],
    PEAK: ['swim', 'rest', 'run', 'bike', weak, 'rest', 'brick'],
    TAPER: ['bike', 'rest', 'swim', 'run', 'bike', 'rest', 'run'],
    RACE_WEEK: ['rest', 'rest', 'swim', 'bike', 'run', 'rest', 'rest'],
  };
  const basePlan = plans[phase] || plans.BASE;
  return applySchedulePreferences(basePlan, profile, 'brick');
}

/**
 * Apply user schedule preferences to a base weekly plan.
 * Moves long disciplines to preferred days and sets rest days.
 */
function applySchedulePreferences(plan, profile, longDiscipline) {
  const prefs = profile?.schedulePreferences;
  if (!prefs) return plan;

  const result = [...plan];

  // Apply rest days first
  if (prefs.restDays && prefs.restDays.length > 0) {
    const displaced = [];
    for (const day of prefs.restDays) {
      if (result[day] !== 'rest') {
        displaced.push(result[day]);
        result[day] = 'rest';
      }
    }
    // Put displaced disciplines in empty non-rest slots
    for (const discipline of displaced) {
      const emptySlot = result.findIndex(
        (d, i) => d === 'rest' && !prefs.restDays.includes(i) && !(prefs.longDays || []).includes(i)
      );
      if (emptySlot >= 0) {
        result[emptySlot] = discipline;
      }
    }
  }

  // Apply avoid days (same as rest days)
  if (prefs.avoidDays && prefs.avoidDays.length > 0) {
    const displaced = [];
    for (const day of prefs.avoidDays) {
      if (result[day] !== 'rest') {
        displaced.push(result[day]);
        result[day] = 'rest';
      }
    }
    for (const discipline of displaced) {
      const emptySlot = result.findIndex(
        (d, i) =>
          d === 'rest' &&
          !(prefs.restDays || []).includes(i) &&
          !(prefs.avoidDays || []).includes(i) &&
          !(prefs.longDays || []).includes(i)
      );
      if (emptySlot >= 0) {
        result[emptySlot] = discipline;
      }
    }
  }

  // Apply long days — move the long discipline to preferred days
  if (prefs.longDays && prefs.longDays.length > 0) {
    for (const day of prefs.longDays) {
      if (result[day] === 'rest') continue; // Don't override rest days
      const currentLongIdx = result.findIndex(
        (d, i) => d === longDiscipline && !prefs.longDays.includes(i)
      );
      if (currentLongIdx >= 0 && result[day] !== longDiscipline) {
        // Swap the long discipline into the preferred day
        const displaced = result[day];
        result[day] = longDiscipline;
        result[currentLongIdx] = displaced;
      }
    }
  }

  return result;
}

function getRunningWeekPlan(phase) {
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  // Default: Mon=rest, Sat/Sun=long runs
  const plans = {
    BASE: ['run', 'rest', 'strength', 'run', 'run', 'run', 'run'],
    BUILD: ['run', 'rest', 'run', 'strength', 'run', 'run', 'run'],
    PEAK: ['run', 'rest', 'run', 'run', 'strength', 'run', 'run'],
    TAPER: ['run', 'rest', 'run', 'rest', 'run', 'run', 'rest'],
    RACE_WEEK: ['rest', 'rest', 'run', 'rest', 'run', 'rest', 'rest'],
  };
  return plans[phase] || plans.BASE;
}

function getYesterdayDiscipline(completedWorkouts) {
  if (!completedWorkouts || completedWorkouts.length === 0) return null;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const yesterdayWorkouts = completedWorkouts.filter(
    (w) => w.startDate && new Date(w.startDate).toDateString() === yesterdayStr
  );
  if (yesterdayWorkouts.length === 0) return null;
  return yesterdayWorkouts[yesterdayWorkouts.length - 1].discipline;
}

function formatRecentWorkouts(completedWorkouts) {
  if (!completedWorkouts || completedWorkouts.length === 0) return '';
  const recent = completedWorkouts.slice(-5);
  return recent
    .map((w) => {
      const date = new Date(w.startDate).toLocaleDateString('en-US', { weekday: 'short' });
      return `${date}: ${w.discipline} ${w.durationMinutes}min`;
    })
    .join(', ');
}

export function getBaseDuration(phase, weeklyHours) {
  const hoursMap = { '5-7': 50, '8-10': 70, '11-14': 85, '15+': 100 };
  const base = hoursMap[weeklyHours] || 60;
  const phaseMultiplier = {
    BASE: 0.9,
    BUILD: 1.0,
    PEAK: 1.1,
    TAPER: 0.7,
    RACE_WEEK: 0.4,
  };
  return Math.round(base * (phaseMultiplier[phase] || 1));
}

function buildWorkout(discipline, duration, readiness, _phase, _profile) {
  const intensity = readiness >= 75 ? 'hard' : 'moderate';

  const workouts = {
    swim: {
      title: intensity === 'hard' ? 'Threshold Swim' : 'Endurance Swim',
      discipline: 'swim',
      duration,
      summary:
        intensity === 'hard'
          ? 'Build threshold pace with structured intervals.'
          : 'Steady aerobic swimming to build endurance and technique.',
      intensity,
      sections: [
        {
          name: 'Warmup',
          notes: 'Easy swimming with drill focus.',
          sets: [
            { description: `${Math.round(duration * 0.15)} min easy free`, zone: 1 },
            { description: '4x50m drill/swim by 25', zone: 2 },
          ],
        },
        {
          name: 'Main Set',
          notes: intensity === 'hard' ? 'Push threshold pace on intervals.' : 'Hold steady pace.',
          sets:
            intensity === 'hard'
              ? [
                  { description: '6x200m at threshold pace, 20s rest', zone: 4 },
                  { description: '4x100m descending 1-4, 15s rest', zone: 3 },
                ]
              : [
                  { description: `${Math.round(duration * 0.5)} min steady swimming`, zone: 2 },
                  { description: 'Focus on bilateral breathing and catch', zone: 2 },
                ],
        },
        {
          name: 'Cooldown',
          notes: 'Easy swimming to flush.',
          sets: [{ description: `${Math.round(duration * 0.1)} min easy backstroke`, zone: 1 }],
        },
      ],
    },
    bike: {
      title: intensity === 'hard' ? 'Tempo Ride' : 'Zone 2 Endurance Ride',
      discipline: 'bike',
      duration,
      summary:
        intensity === 'hard'
          ? 'Build power at tempo with structured intervals.'
          : 'Steady aerobic ride to build your cycling base.',
      intensity,
      sections: [
        {
          name: 'Warmup',
          notes: 'Gradually increase effort.',
          sets: [{ description: `${Math.round(duration * 0.15)} min easy spinning`, zone: 1 }],
        },
        {
          name: 'Main Set',
          notes:
            intensity === 'hard' ? 'Tempo intervals with recovery.' : 'Maintain Zone 2 effort.',
          sets:
            intensity === 'hard'
              ? [
                  { description: '3x10 min at tempo, 3 min easy between', zone: 3 },
                  { description: 'Maintain 85-95 RPM during intervals', zone: 3 },
                ]
              : [
                  { description: `${Math.round(duration * 0.7)} min steady Zone 2`, zone: 2 },
                  { description: 'Smooth pedaling at 85-95 RPM', zone: 2 },
                ],
        },
        {
          name: 'Cooldown',
          notes: 'Easy spin to recover.',
          sets: [{ description: `${Math.round(duration * 0.1)} min easy spin`, zone: 1 }],
        },
      ],
    },
    run: {
      title: intensity === 'hard' ? 'Tempo Run' : 'Easy Aerobic Run',
      discipline: 'run',
      duration,
      summary:
        intensity === 'hard'
          ? 'Build running speed with tempo intervals.'
          : 'Relaxed aerobic run to build endurance.',
      intensity,
      sections: [
        {
          name: 'Warmup',
          notes: 'Easy jog with dynamic stretches.',
          sets: [
            { description: `${Math.round(duration * 0.15)} min easy jog`, zone: 1 },
            { description: 'Dynamic warm-up drills', zone: null },
          ],
        },
        {
          name: 'Main Set',
          notes: intensity === 'hard' ? 'Run at tempo effort.' : 'Keep it conversational.',
          sets:
            intensity === 'hard'
              ? [
                  { description: '4x5 min at tempo, 2 min jog recovery', zone: 3 },
                  { description: 'Focus on quick turnover ~170-180 spm', zone: 3 },
                ]
              : [
                  { description: `${Math.round(duration * 0.7)} min easy running`, zone: 2 },
                  { description: 'You should be able to hold a conversation', zone: 2 },
                ],
        },
        {
          name: 'Cooldown',
          notes: 'Easy jog and stretch.',
          sets: [
            { description: `${Math.round(duration * 0.1)} min easy jog`, zone: 1 },
            { description: 'Static stretching 5 min', zone: null },
          ],
        },
      ],
    },
    strength: {
      title: 'Functional Strength',
      discipline: 'strength',
      duration: Math.min(duration, 45),
      summary: 'Core and functional strength to prevent injury and improve efficiency.',
      intensity: 'moderate',
      sections: [
        {
          name: 'Warmup',
          notes: 'Activate key muscle groups.',
          sets: [
            { description: '5 min light cardio', zone: 1 },
            { description: 'Band activation: glutes, shoulders', zone: null },
          ],
        },
        {
          name: 'Main Set',
          notes: '3 rounds through.',
          sets: [
            { description: '12 single-leg deadlifts each side', zone: null },
            { description: '10 push-ups', zone: null },
            { description: '15 goblet squats', zone: null },
            { description: '30s side plank each side', zone: null },
            { description: '12 band pull-aparts', zone: null },
            { description: '60s rest between rounds', zone: null },
          ],
        },
        {
          name: 'Cooldown',
          notes: 'Stretch and foam roll.',
          sets: [{ description: '10 min stretching and foam rolling', zone: null }],
        },
      ],
    },
    brick: {
      title: intensity === 'hard' ? 'Race-Pace Brick' : 'Aerobic Brick',
      discipline: 'brick',
      duration,
      summary:
        intensity === 'hard'
          ? 'Bike at tempo then immediately run to simulate race transitions and train your legs to run off the bike.'
          : 'Long aerobic ride followed by a short run. Teaches your legs to transition from cycling to running.',
      intensity,
      sections: [
        {
          name: 'Bike Leg',
          notes:
            intensity === 'hard'
              ? 'Build to tempo effort on the bike.'
              : 'Steady Zone 2 ride — long and aerobic.',
          sets:
            intensity === 'hard'
              ? [
                  { description: `${Math.round(duration * 0.15)} min easy spin warmup`, zone: 1 },
                  { description: `${Math.round(duration * 0.5)} min at tempo effort`, zone: 3 },
                  { description: '5 min easy spin before dismount', zone: 1 },
                ]
              : [
                  { description: `${Math.round(duration * 0.15)} min easy spin warmup`, zone: 1 },
                  { description: `${Math.round(duration * 0.6)} min steady Zone 2 ride`, zone: 2 },
                ],
        },
        {
          name: 'T2 Transition',
          notes: 'Quick change — rack bike, swap shoes, go. Practice smooth, calm transition.',
          sets: [{ description: 'Rack bike → helmet off → running shoes on → go', zone: null }],
        },
        {
          name: 'Run Leg',
          notes: 'Legs will feel heavy for the first 5-10 min — this is normal. Stay steady.',
          sets:
            intensity === 'hard'
              ? [
                  { description: `${Math.round(duration * 0.25)} min at race pace`, zone: 3 },
                  { description: 'Focus on quick turnover despite heavy legs', zone: 3 },
                ]
              : [
                  {
                    description: `${Math.round(duration * 0.2)} min easy run off the bike`,
                    zone: 2,
                  },
                  { description: 'Stay relaxed — do not chase pace', zone: 2 },
                ],
        },
        {
          name: 'Cooldown',
          notes: 'Walk and stretch after the run.',
          sets: [{ description: '5 min walk + static stretching', zone: null }],
        },
      ],
    },
    rest: {
      title: 'Rest Day',
      discipline: 'rest',
      duration: 0,
      summary: 'Full rest day. Your body adapts and gets stronger during recovery.',
      intensity: 'recovery',
      sections: [
        {
          name: 'Recovery',
          notes: 'Optional light activity only.',
          sets: [
            { description: 'Light walk or gentle yoga if desired', zone: 1 },
            { description: 'Focus on hydration and nutrition', zone: null },
            { description: 'Aim for 8+ hours of sleep tonight', zone: null },
          ],
        },
      ],
    },
  };

  return workouts[discipline] || workouts.rest;
}

/**
 * Analyze recent workout sessions using a focused minimal prompt.
 * Returns 2-3 sentences of actionable coach feedback.
 * Uses a short context window to avoid ContextFullError on device.
 */
export async function analyzeRecentWorkouts(recentDays, healthData) {
  if (!recentDays || recentDays.length === 0) return null;

  const sessionLines = recentDays
    .flatMap(({ dateLabel, workouts }) =>
      workouts.map(
        (w) =>
          `- ${w.discipline || w.discipline}, ${w.duration || w.durationMinutes}min${w.avgHeartRate ? `, avg ${w.avgHeartRate}bpm` : ''}${w.effortScore ? `, effort ${w.effortScore}/10` : ''} (${dateLabel})`
      )
    )
    .join('\n');

  const healthLine = healthData
    ? `Health: RHR ${healthData.restingHR ?? 'N/A'}bpm, HRV ${healthData.hrv ?? 'N/A'}ms, sleep ${healthData.sleepHours?.toFixed(1) ?? 'N/A'}h`
    : '';

  const systemPrompt = `You are a triathlon coach. Analyze the athlete's recent sessions and give 2-3 sentences of specific, actionable feedback about patterns, recovery, or focus areas. Be direct and practical.`;

  const userPrompt = `Recent sessions:\n${sessionLines}${healthLine ? `\n${healthLine}` : ''}`;

  try {
    const response = await runInference(systemPrompt, userPrompt);
    if (response) return response.trim();
  } catch (e) {
    if (!(e instanceof ModelNotReadyError) && !(e instanceof ContextFullError)) throw e;
  }

  // Rule-based fallback
  const disciplines = [...new Set(recentDays.flatMap((d) => d.workouts.map((w) => w.discipline)))];
  const totalSessions = recentDays.reduce((sum, d) => sum + d.workouts.length, 0);
  if (totalSessions === 0) return 'No recent sessions recorded.';
  return `You completed ${totalSessions} session${totalSessions > 1 ? 's' : ''} recently across ${disciplines.join(', ')}. Keep the consistency going — recovery and sleep are key between sessions.`;
}
