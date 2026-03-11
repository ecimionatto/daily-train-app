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
    console.warn('Model download failed:', e);
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
        console.warn('Model download failed, falling back to rule-based');
        return false;
      }
    }

    const modelPath = getModelPath();
    llamaContext = await initLlama(
      {
        model: modelPath,
        n_ctx: 2048,
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
    console.warn('Failed to initialize local model:', e);
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

/**
 * Run inference using the local llama.rn model.
 * Returns the generated text or null if model isn't available.
 */
export async function runInference(systemPrompt, userPrompt) {
  if (!modelLoaded || !llamaContext) return null;

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
    console.warn('Local model inference failed:', e);
    return null;
  }
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
}) {
  const raceType = profile.raceType || 'triathlon';
  const coachType = isRunningOnly(profile) ? 'running' : 'endurance triathlon';
  const disciplines = getDisciplinesForProfile(profile).filter(
    (d) => d !== 'rest' && d !== 'strength'
  );
  const recentActivity = formatRecentWorkouts(completedWorkouts);

  const systemPrompt = `You are an elite ${coachType} coach. Generate a JSON workout.
Respond ONLY with valid JSON matching this structure:
{"title":"string","discipline":"${disciplines.join('|')}|strength|rest","duration":number,"summary":"string","intensity":"easy|moderate|hard|recovery","sections":[{"name":"string","notes":"string","sets":[{"description":"string","zone":number|null}]}]}`;

  const userPrompt = `Athlete: ${profile.level || 'Intermediate'}, ${raceType} - ${profile.distance}, weekly hrs: ${profile.weeklyHours}, strongest: ${profile.strongestDiscipline}, weakest: ${profile.weakestDiscipline}, injuries: ${profile.injuries}, goal: ${profile.goalTime}.
Status: phase=${phase}, days to race=${daysToRace}, readiness=${readinessScore}/100, RHR=${healthData?.restingHR || 'N/A'}bpm, HRV=${healthData?.hrv || 'N/A'}ms, sleep=${healthData?.sleepHours?.toFixed(1) || 'N/A'}h.
Day: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.${recentActivity ? `\nRecent Apple Health activity:\n${recentActivity}` : ''}`;

  // Try local model first
  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) {
    try {
      const jsonStr = modelResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(jsonStr);
    } catch {
      console.warn('Failed to parse local model output, using fallback');
    }
  }

  // Rule-based fallback (no model needed)
  return generateRuleBasedWorkout({
    profile,
    healthData,
    readinessScore,
    phase,
    daysToRace,
    completedWorkouts,
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

  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) return modelResponse;

  // Simple fallback summary
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

  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) {
    try {
      const jsonStr = modelResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(jsonStr);
    } catch {
      console.warn('Failed to parse alternative workout, using fallback');
    }
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

  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) {
    try {
      const jsonStr = modelResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(jsonStr);
    } catch {
      console.warn('Failed to parse replacement workout, using fallback');
    }
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

  const modelResponse = await runInference(systemPrompt, userPrompt);
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
}) {
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
  const score = readinessScore || 65;

  // Recovery day
  if (score < 55) {
    return {
      title: 'Active Recovery',
      discipline: 'rest',
      duration: 30,
      summary: 'Your readiness is low. Focus on gentle movement and recovery.',
      intensity: 'recovery',
      sections: [
        {
          name: 'Recovery Session',
          notes: 'Keep everything easy. Focus on breathing and mobility.',
          sets: [
            { description: '10 min easy walk or gentle spin', zone: 1 },
            { description: '10 min stretching and foam rolling', zone: null },
            { description: '10 min yoga or mobility work', zone: null },
          ],
        },
      ],
    };
  }

  // Check yesterday's discipline from HealthKit to avoid repeats
  const yesterdayDiscipline = getYesterdayDiscipline(completedWorkouts);

  // Map days to disciplines with weekly structure
  const weekPlan = getWeeklyDisciplinePlan(phase, profile);
  let todayPlan = weekPlan[dayOfWeek];

  // Avoid repeating yesterday's discipline if possible
  if (yesterdayDiscipline && todayPlan === yesterdayDiscipline && todayPlan !== 'rest') {
    const activeDisciplines = getDisciplinesForProfile(profile).filter(
      (d) => d !== 'rest' && d !== 'strength' && d !== yesterdayDiscipline
    );
    if (activeDisciplines.length > 0) {
      todayPlan = activeDisciplines[0];
    }
  }

  // Adjust duration based on phase and available hours
  const baseDuration = getBaseDuration(phase, profile.weeklyHours);
  const adjustedDuration =
    score >= 75 ? Math.round(baseDuration * 1.1) : Math.round(baseDuration * 0.9);

  return buildWorkout(todayPlan, adjustedDuration, score, phase, profile);
}

export function getWeeklyDisciplinePlan(phase, profile) {
  if (isRunningOnly(profile)) {
    return getRunningWeekPlan(phase);
  }
  const weak = profile.weakestDiscipline?.toLowerCase() || 'swim';
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  const plans = {
    BASE: ['rest', 'swim', 'bike', 'run', 'swim', 'strength', 'bike'],
    BUILD: ['rest', 'swim', 'bike', 'run', 'swim', 'bike', 'run'],
    PEAK: ['rest', weak, 'bike', 'run', 'swim', 'bike', 'run'],
    TAPER: ['rest', 'swim', 'bike', 'run', 'rest', 'swim', 'bike'],
    RACE_WEEK: ['rest', 'swim', 'bike', 'run', 'rest', 'rest', 'rest'],
  };
  return plans[phase] || plans.BASE;
}

function getRunningWeekPlan(phase) {
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  const plans = {
    BASE: ['rest', 'run', 'strength', 'run', 'rest', 'run', 'run'],
    BUILD: ['rest', 'run', 'run', 'strength', 'run', 'rest', 'run'],
    PEAK: ['rest', 'run', 'run', 'run', 'strength', 'rest', 'run'],
    TAPER: ['rest', 'run', 'rest', 'run', 'rest', 'run', 'rest'],
    RACE_WEEK: ['rest', 'run', 'rest', 'run', 'rest', 'rest', 'rest'],
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

function getBaseDuration(phase, weeklyHours) {
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
