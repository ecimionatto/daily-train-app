import { runInference, getModelLoadingProgress, ModelNotReadyError } from './localModel';
import { generateReplacementWorkout } from './localModel';
import { isRunningOnly } from './raceConfig';
import { deriveHRZonesFromWorkouts } from './healthKit';
import {
  generateTrendSummary,
  detectPaceAchievements,
  formatAchievementsForCoach,
} from './trendAnalysis';
import {
  buildIdentitySection,
  buildSkillsSection,
  COACH_KNOWLEDGE,
  COACH_CONSTRAINTS,
  PLAN_RULES,
} from './agentConstitution';
import { processMessage as agentProcessMessage } from './agentOrchestrator';

const FATIGUE_KEYWORDS = [
  'tired',
  'exhausted',
  'fatigue',
  'burnout',
  'drained',
  'low energy',
  'worn out',
  'wiped',
  'overtraining',
  'need rest',
  'need a break',
];

const PAIN_KEYWORDS = ['pain', 'hurt', 'injury', 'sore', 'ache', 'stiff', 'strain', 'pulled'];

const BODY_PARTS = [
  'knee',
  'shoulder',
  'back',
  'hip',
  'ankle',
  'hamstring',
  'calf',
  'shin',
  'neck',
  'wrist',
  'elbow',
  'quad',
  'glute',
  'achilles',
  'foot',
  'IT band',
];

const INTENSITY_EASIER_KEYWORDS = ['easier', 'too hard', 'lighter', 'less intense', 'dial back'];
const INTENSITY_HARDER_KEYWORDS = ['harder', 'too easy', 'push me', 'more intense', 'step up'];

const LOAD_REDUCE_KEYWORDS = [
  'take it easy',
  'easier this week',
  'reduce load',
  'back off',
  'dial it back',
  'too much',
  'lighter week',
  'cut back',
  'ease up',
  'reduce my training',
  'less training',
];

const LOAD_INCREASE_KEYWORDS = [
  'push harder',
  'more volume',
  'increase load',
  'step it up',
  'push me harder',
  'train more',
  'increase my training',
];

const REST_DAY_KEYWORDS = [
  'take tomorrow off',
  'day off tomorrow',
  'rest tomorrow',
  'skip tomorrow',
  'tomorrow off',
  'need a rest day',
  'give me tomorrow off',
];

const DISCIPLINE_FOCUS_MAP = {
  swim: ['more swimming', 'focus on swim', 'swim more', 'work on my swim', 'more swim'],
  bike: ['more cycling', 'focus on bike', 'bike more', 'more riding', 'work on my bike'],
  run: ['more running', 'focus on run', 'run more', 'work on my running', 'more run'],
};

const MOTIVATION_POSITIVE = [
  'feeling great',
  'strong',
  'motivated',
  'pumped',
  'fired up',
  'ready',
  'excited',
  'confident',
];

/**
 * Returns the number of days remaining until the end of the current week (Sunday=0).
 */
function daysUntilEndOfWeek() {
  const day = new Date().getDay(); // 0=Sun
  return day === 0 ? 0 : 7 - day;
}

/**
 * Extract persistent athlete insights from conversation history.
 * Analyzes recent messages (last 7 days) for mood, pain, intensity preferences,
 * and multi-day load adjustments requested through the coach chat.
 *
 * @param {Array} messages - Full conversation history
 * @param {Object|null} existingInsights - Current athleteInsights to carry forward active adjustments
 */
export function extractAthleteInsights(messages, existingInsights = null) {
  if (!messages || messages.length === 0) return null;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentAthleteMessages = messages.filter(
    (m) => m.role === 'athlete' && new Date(m.timestamp).getTime() > sevenDaysAgo
  );

  if (recentAthleteMessages.length === 0) return null;

  let recentMood = 'neutral';
  let lastFatigueReport = null;
  let preferredIntensity = null;
  const painPoints = [];
  const themes = [];

  let loadAdjustment = null;
  let loadAdjustmentExpiry = null;
  let loadAdjustmentDays = null;
  let requestedRestDay = null;
  let requestedDisciplineFocus = null;

  for (const msg of recentAthleteMessages) {
    const lower = msg.content.toLowerCase();

    // Detect fatigue
    if (FATIGUE_KEYWORDS.some((kw) => lower.includes(kw))) {
      recentMood = 'fatigued';
      lastFatigueReport = msg.timestamp;
      if (!themes.includes('fatigue')) themes.push('fatigue');
    }

    // Detect pain/injury + body part
    if (PAIN_KEYWORDS.some((kw) => lower.includes(kw))) {
      recentMood = 'injured';
      for (const part of BODY_PARTS) {
        if (lower.includes(part.toLowerCase()) && !painPoints.includes(part)) {
          painPoints.push(part);
        }
      }
      if (!themes.includes('injury')) themes.push('injury');
    }

    // Detect intensity preference
    if (INTENSITY_EASIER_KEYWORDS.some((kw) => lower.includes(kw))) {
      preferredIntensity = 'easier';
    }
    if (INTENSITY_HARDER_KEYWORDS.some((kw) => lower.includes(kw))) {
      preferredIntensity = 'harder';
    }

    // Detect positive motivation (overrides fatigue if more recent)
    if (MOTIVATION_POSITIVE.some((kw) => lower.includes(kw))) {
      if (recentMood === 'neutral') recentMood = 'motivated';
      if (!themes.includes('motivation')) themes.push('motivation');
    }

    // Detect multi-day load reduction request
    if (
      LOAD_REDUCE_KEYWORDS.some((kw) => lower.includes(kw)) ||
      FATIGUE_KEYWORDS.some((kw) => lower.includes(kw))
    ) {
      loadAdjustment = 'reduce';
      const days = lower.includes('this week') || lower.includes('week') ? daysUntilEndOfWeek() : 3;
      loadAdjustmentDays = days || 3;
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + loadAdjustmentDays);
      loadAdjustmentExpiry = expiry.toISOString();
    }

    // Detect load increase request
    if (LOAD_INCREASE_KEYWORDS.some((kw) => lower.includes(kw))) {
      loadAdjustment = 'increase';
      loadAdjustmentDays = 7;
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);
      loadAdjustmentExpiry = expiry.toISOString();
    }

    // Detect explicit rest day request for tomorrow
    if (REST_DAY_KEYWORDS.some((kw) => lower.includes(kw))) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      requestedRestDay = tomorrow.toISOString();
    }

    // Detect discipline focus request
    for (const [discipline, keywords] of Object.entries(DISCIPLINE_FOCUS_MAP)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        requestedDisciplineFocus = discipline;
        break;
      }
    }

    // Detect topic themes
    const topic = classifyMessage(msg.content);
    if (!themes.includes(topic) && topic !== 'general') {
      themes.push(topic);
    }
  }

  // Carry forward active adjustments from existing insights when no new signal was detected
  const now = new Date();
  const existingAdjustmentActive =
    existingInsights?.loadAdjustmentExpiry && new Date(existingInsights.loadAdjustmentExpiry) > now;

  return {
    recentMood,
    painPoints,
    preferredIntensity,
    lastFatigueReport,
    conversationThemes: themes.slice(0, 5),
    extractedAt: new Date().toISOString(),
    loadAdjustment:
      loadAdjustment ?? (existingAdjustmentActive ? existingInsights.loadAdjustment : null),
    loadAdjustmentExpiry:
      loadAdjustmentExpiry ??
      (existingAdjustmentActive ? existingInsights.loadAdjustmentExpiry : null),
    loadAdjustmentDays:
      loadAdjustmentDays ?? (existingAdjustmentActive ? existingInsights.loadAdjustmentDays : null),
    requestedRestDay: requestedRestDay ?? existingInsights?.requestedRestDay ?? null,
    requestedDisciplineFocus:
      requestedDisciplineFocus ?? existingInsights?.requestedDisciplineFocus ?? null,
  };
}

const TRAINING_KEYWORDS = [
  'workout',
  'train',
  'run',
  'swim',
  'bike',
  'cycle',
  'ride',
  'race',
  'ironman',
  'triathlon',
  'marathon',
  'sprint',
  'endurance',
  'interval',
  'tempo',
  'zone',
  'recovery',
  'rest',
  'sore',
  'tired',
  'fatigue',
  'injury',
  'pain',
  'hurt',
  'nutrition',
  'eat',
  'food',
  'hydrat',
  'fuel',
  'carb',
  'protein',
  'calorie',
  'diet',
  'gel',
  'electrolyte',
  'pacing',
  'strategy',
  'transition',
  'taper',
  'plan',
  'schedule',
  'phase',
  'volume',
  'intensity',
  'threshold',
  'brick',
  'stretch',
  'warm',
  'cool',
  'drill',
  'pace',
  'heart rate',
  'hrv',
  'sleep',
  'readiness',
  'coach',
  'session',
  'set',
  'rep',
  'lap',
  'distance',
  'speed',
  'watts',
  'power',
  'cadence',
  'stroke',
  'form',
  'technique',
  'gear',
  'wetsuit',
  'shoes',
  'helmet',
  'aero',
  'strength',
  'core',
  'muscle',
  'weight',
  'body',
  'fitness',
  'health',
  'performance',
  'goal',
  'pr',
  'personal best',
  'time',
  'finish',
  'split',
  'negative split',
  'kick',
  'pull',
  'bilateral',
  'breathing',
  'foam roll',
  'massage',
  'ice bath',
  'active recovery',
  'cross train',
  'overtrain',
  'burnout',
  'base build',
  'peak',
  'deload',
  'vo2',
  'aerobic',
  'anaerobic',
  'lactate',
  'ftp',
  'css',
  'half ironman',
  '70.3',
  'full ironman',
  '140.6',
  'olympic',
  '5k',
  '10k',
  'half marathon',
  'ultra',
  'modify',
  'change',
  'swap',
  'easier',
  'harder',
  'skip',
  'replace',
  'how am i',
  'progress',
  'improve',
  'faster',
  'stronger',
  'week',
  'yesterday',
  'today',
  'tomorrow',
  'morning',
  'evening',
  'daily',
  'hello',
  'hi',
  'hey',
  'thanks',
  'thank',
  'help',
  'advice',
];

/**
 * Check if a message is off-topic (not training-related).
 */
export function isOffTopic(message) {
  const lower = message.toLowerCase();
  return !TRAINING_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Standard response for off-topic questions.
 */
export function getOffTopicResponse() {
  return "I'm your endurance coach! I can help with training plans, workout modifications, recovery, nutrition, and race strategy. For other topics, you'll want to check a different source. What can I help you with on your training?";
}

/**
 * Process a user message and return a coach response.
 *
 * Flow:
 * 1. Off-topic filter
 * 2. Agent orchestrator (LLM tool-calling via Hammer 2.1)
 * 3. Fallback: keyword-based handlers (classifyMessage → handler chain)
 * 4. Fallback: AI model text inference
 * 5. Fallback: rule-based response
 */
export async function getCoachResponse(userMessage, context, conversationHistory) {
  if (isOffTopic(userMessage)) {
    return getOffTopicResponse();
  }

  // 1. Try agent orchestrator (LLM tool-calling) — handles pending confirmations too
  try {
    const agentResult = await agentProcessMessage(userMessage, context);
    if (agentResult !== null) return agentResult;
  } catch (e) {
    if (!(e instanceof ModelNotReadyError)) {
      // eslint-disable-next-line no-console
      console.warn('[Coach] Agent orchestrator failed:', e.message);
    }
    // Fall through to existing handlers
  }

  // 2. Existing keyword-based handlers (fallback chain)
  const category = classifyMessage(userMessage);

  // Handle full plan regeneration requests
  if (category === 'plan_regeneration') {
    return handlePlanRegeneration(context);
  }

  // Handle profile changes (race date, goals)
  if (category === 'profile_change' && context.onProfileUpdate) {
    return handleProfileChange(userMessage, context);
  }

  // Handle schedule preference changes (fallback if skill executor missed or failed)
  if (category === 'schedule_preference' && context.onProfileUpdate) {
    return handleSchedulePreference(userMessage, context);
  }

  // Handle multi-day load adjustments (fatigue, rest day, discipline focus)
  if (category === 'load_adjustment' && context.onProfileUpdate) {
    return handleLoadAdjustment(userMessage, context);
  }

  // Handle workout swap requests
  if (
    (category === 'workout_swap' || category === 'workout_modification') &&
    context.onWorkoutSwap
  ) {
    return handleWorkoutSwap(userMessage, context);
  }

  const systemPrompt = buildCoachSystemPrompt(context);
  const summary = buildConversationSummary(conversationHistory);
  const userPrompt = summary ? `${summary}\n\nAthlete: ${userMessage}` : `Athlete: ${userMessage}`;

  try {
    const modelResponse = await runInference(systemPrompt, userPrompt);
    return modelResponse
      ? modelResponse.trim()
      : generateFallbackResponse(category, userMessage, context);
  } catch (e) {
    if (e instanceof ModelNotReadyError) {
      const fallback = generateFallbackResponse(category, userMessage, context);
      const progress = getModelLoadingProgress();
      const progressNote =
        progress > 0 && progress < 100
          ? ` *(AI model loading — ${progress}% done)*`
          : ' *(AI model still loading)*';
      return `${fallback}${progressNote}`;
    }
    throw e;
  }
}

/**
 * Build a user-facing message when the AI model is not ready yet.
 */
export function buildModelNotReadyMessage() {
  const progress = getModelLoadingProgress();
  if (progress > 0 && progress < 100) {
    return `Your AI coach is still loading (${progress}% ready). Please wait a moment and try again.`;
  }
  return `Your AI coach isn't ready yet. Make sure the model has finished downloading and loading on the Dashboard, then try again.`;
}

/**
 * Parse day references from a user message.
 * Returns array of day indices (0=Sunday, 6=Saturday).
 */
function parseDaysFromMessage(message) {
  const lower = message.toLowerCase();
  const dayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const found = [];

  if (lower.includes('weekend')) {
    found.push(0, 6); // Sunday + Saturday
  }
  if (lower.includes('weekday')) {
    found.push(1, 2, 3, 4, 5);
  }

  for (const [name, index] of Object.entries(dayMap)) {
    if (lower.includes(name)) {
      if (!found.includes(index)) found.push(index);
    }
  }

  return found;
}

/**
 * Detect ALL schedule preference intents in a message.
 * Returns an object with any combination of restDays, longDays, avoidDays.
 */
function parseAllScheduleIntents(message) {
  const lower = message.toLowerCase();
  const days = parseDaysFromMessage(message);
  const intents = {};

  const restKeywords = [
    'rest on',
    'day off',
    'no training',
    'rest day',
    'avoid training',
    'move rest',
    'change rest',
  ];
  if (restKeywords.some((kw) => lower.includes(kw))) {
    intents.restDays = days;
  }

  const longKeywords = [
    'long session',
    'long run',
    'long ride',
    'long swim',
    'endurance on',
    'prefer weekend',
    'long on',
    'long workout',
  ];
  if (longKeywords.some((kw) => lower.includes(kw))) {
    intents.longDays = days;
  }

  const avoidKeywords = ['avoid', 'skip', 'no workout', 'free on'];
  if (avoidKeywords.some((kw) => lower.includes(kw))) {
    intents.avoidDays = days;
  }

  const strengthKeywords = [
    'strength on',
    'strength to',
    'move strength',
    'move my strength',
    'change strength',
    'change my strength',
    'strength training on',
    'strength training to',
    'strength workout on',
    'strength workout to',
    'weights on',
    'weights to',
    'move weights',
    'move my weights',
    'gym on',
    'gym to',
    'gym day on',
    'gym day to',
    'lifting on',
    'lifting to',
    'lifting day on',
    'lifting day to',
    'strength day',
    'strength session',
  ];
  if (strengthKeywords.some((kw) => lower.includes(kw))) {
    intents.strengthDays = days;
  }

  // Weekend preference detection
  const weekendSwapKeywords = [
    'bike saturday',
    'bike on saturday',
    'run saturday',
    'run on saturday',
    'bike sunday',
    'bike on sunday',
    'run sunday',
    'run on sunday',
    'swap weekend',
    'flip weekend',
  ];
  for (const kw of weekendSwapKeywords) {
    if (lower.includes(kw)) {
      if (
        lower.includes('run saturday') ||
        lower.includes('run on saturday') ||
        lower.includes('bike sunday') ||
        lower.includes('bike on sunday')
      ) {
        intents.weekendPreference = 'run-sat-bike-sun';
      } else {
        intents.weekendPreference = 'bike-sat-run-sun';
      }
      break;
    }
  }

  // Swim day preference detection
  const swimDayKeywords = [
    'swim monday',
    'swim wednesday',
    'swim friday',
    'swim mon',
    'swim wed',
    'swim fri',
    'swim tuesday',
    'swim thursday',
    'swim tue',
    'swim thu',
    'swim on monday',
    'swim on tuesday',
    'swim on wednesday',
    'swim on thursday',
    'swim on friday',
    'move swim',
    'change swim days',
    'swim days',
  ];
  if (swimDayKeywords.some((kw) => lower.includes(kw))) {
    if (
      lower.includes('tue') ||
      lower.includes('thu') ||
      lower.includes('tuesday') ||
      lower.includes('thursday')
    ) {
      intents.swimDays = 'tts';
    } else if (
      lower.includes('mon') ||
      lower.includes('wed') ||
      lower.includes('fri') ||
      lower.includes('monday') ||
      lower.includes('wednesday') ||
      lower.includes('friday')
    ) {
      intents.swimDays = 'mwf';
    }
  }

  // Default to longDays if nothing detected
  if (Object.keys(intents).length === 0) {
    intents.longDays = days;
  }

  return intents;
}

/**
 * Handle a schedule preference change from the coach chat.
 * Parses all day/intent combinations and persists them to the athlete profile.
 */
async function handleSchedulePreference(userMessage, context) {
  const { athleteProfile, onProfileUpdate } = context;
  const days = parseDaysFromMessage(userMessage);
  const intents = parseAllScheduleIntents(userMessage);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Check if we detected any intent (including string-valued weekendPreference/swimDays)
  const hasStringIntents = intents.weekendPreference || intents.swimDays;
  const hasDayIntents = days.length > 0;

  if (!hasStringIntents && !hasDayIntents) {
    const systemPrompt = buildCoachSystemPrompt(context);
    const prompt = `${userMessage}\n\n[The athlete is trying to change their schedule preference but the specific days are unclear. Ask them to clarify which days, and give examples based on their current plan. Keep it under 80 words.]`;
    const aiResponse = await runInference(systemPrompt, prompt);
    if (aiResponse) return aiResponse.trim();
    return `I want to update your schedule — could you mention specific days? For example: 'I want long sessions on weekends' or 'Move my rest day to Monday'.`;
  }

  const existing = athleteProfile.schedulePreferences || {};
  const updated = {
    ...athleteProfile,
    schedulePreferences: {
      ...existing,
      ...intents,
    },
  };

  await onProfileUpdate(updated);

  const changeDescs = Object.entries(intents)
    .map(([intent, intentValue]) => {
      if (intent === 'weekendPreference') {
        return intentValue === 'run-sat-bike-sun'
          ? 'long run on Saturday and long bike on Sunday'
          : 'long bike on Saturday and long run on Sunday';
      }
      if (intent === 'swimDays') {
        return intentValue === 'tts'
          ? 'swim sessions on Tue/Thu/Sat'
          : 'swim sessions on Mon/Wed/Fri';
      }
      if (!Array.isArray(intentValue)) return null;
      const dayList = intentValue.map((d) => dayNames[d]).join(' and ');
      return {
        longDays: `long sessions on ${dayList}`,
        restDays: `${dayList} as rest day${intentValue.length > 1 ? 's' : ''}`,
        avoidDays: `${dayList} as no-training day${intentValue.length > 1 ? 's' : ''}`,
        strengthDays: `strength sessions on ${dayList}`,
      }[intent];
    })
    .filter(Boolean);

  const changeSummary = changeDescs.join(', and ');
  const systemPrompt = buildCoachSystemPrompt({ ...context, athleteProfile: updated });
  const prompt = `I just updated the athlete's schedule: ${changeSummary}. Confirm this warmly, briefly explain how their weekly plan will adapt, and keep it under 80 words.`;
  const aiResponse = await runInference(systemPrompt, prompt);
  if (aiResponse) return aiResponse.trim();

  return `Done! Updated your schedule: ${changeSummary}. Training will be balanced across the remaining days going forward.`;
}

/**
 * Handle a multi-day load adjustment request.
 * Persists load change to athleteInsights so future workout generation adapts.
 * Returns a concrete confirmation message to the athlete.
 */
async function handleLoadAdjustment(userMessage, context) {
  const { athleteProfile, onProfileUpdate } = context;
  if (!onProfileUpdate || !athleteProfile) {
    return generateFallbackResponse('recovery', userMessage, context);
  }

  const lower = userMessage.toLowerCase();
  const isRestDayRequest = REST_DAY_KEYWORDS.some((kw) => lower.includes(kw));
  const isReduceRequest =
    LOAD_REDUCE_KEYWORDS.some((kw) => lower.includes(kw)) ||
    FATIGUE_KEYWORDS.some((kw) => lower.includes(kw));
  const isIncreaseRequest = LOAD_INCREASE_KEYWORDS.some((kw) => lower.includes(kw));

  const existingInsights = athleteProfile.athleteInsights || null;
  const newInsights = extractAthleteInsights(
    [{ role: 'athlete', content: userMessage, timestamp: new Date().toISOString() }],
    existingInsights
  );

  const confirmationParts = [];

  if (isRestDayRequest && newInsights.requestedRestDay) {
    const tomorrowLabel = new Date(newInsights.requestedRestDay).toLocaleDateString('en-US', {
      weekday: 'long',
    });
    confirmationParts.push(`set ${tomorrowLabel} as a rest day for you`);
  }

  if (isReduceRequest && !isRestDayRequest) {
    const days = newInsights.loadAdjustmentDays || 3;
    confirmationParts.push(
      `reduced your training load for the next ${days} day${days !== 1 ? 's' : ''} — shorter sessions and lower intensity`
    );
  }

  if (isIncreaseRequest) {
    confirmationParts.push('increased your training load for the next 7 days');
  }

  const disciplineFocus = newInsights.requestedDisciplineFocus;
  if (disciplineFocus) {
    confirmationParts.push(`prioritized ${disciplineFocus} sessions in your upcoming plan`);
  }

  if (confirmationParts.length === 0) {
    return generateFallbackResponse('recovery', userMessage, context);
  }

  const updatedProfile = {
    ...athleteProfile,
    athleteInsights: newInsights,
    ...(disciplineFocus
      ? {
          weakestDiscipline: disciplineFocus.charAt(0).toUpperCase() + disciplineFocus.slice(1),
        }
      : {}),
  };

  await onProfileUpdate(updatedProfile);

  const expiryStr =
    newInsights.loadAdjustmentExpiry && isReduceRequest
      ? ` through ${new Date(newInsights.loadAdjustmentExpiry).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}`
      : '';

  const systemPrompt = buildCoachSystemPrompt({ ...context, athleteProfile: updatedProfile });
  const changeDesc = `${confirmationParts.join(' and ')}${expiryStr}`;
  const prompt = `I just updated the athlete's training plan: ${changeDesc}. Confirm this empathetically, explain briefly how their upcoming workouts will change, and keep it under 100 words.`;
  const aiResponse = await runInference(systemPrompt, prompt);
  if (aiResponse) return aiResponse.trim();

  return `Got it. I've ${changeDesc}. Your workouts will adapt automatically — listen to your body and let me know if you need further adjustments.`;
}

/**
 * Handle a workout swap request: generate replacement and update state.
 */
async function handleWorkoutSwap(userMessage, context) {
  const { athleteProfile, healthData, readinessScore, phase, daysToRace, todayWorkout } = context;

  try {
    const newWorkout = await generateReplacementWorkout({
      profile: athleteProfile,
      healthData,
      readinessScore,
      phase,
      daysToRace,
      reason: userMessage,
    });

    if (newWorkout && context.onWorkoutSwap) {
      await context.onWorkoutSwap(newWorkout);
      return `I've updated your workout! Your new session is: ${newWorkout.title} (${newWorkout.discipline}, ${newWorkout.duration}min, ${newWorkout.intensity}). ${newWorkout.summary} Check your Dashboard to see the full details.`;
    }
  } catch (e) {
    console.warn('Failed to generate replacement workout:', e);
  }

  // Fallback: give advice without swapping
  const score = readinessScore || 65;
  return buildWorkoutModResponse(todayWorkout, score);
}

/**
 * Handle a plan regeneration request.
 * Calls onPlanRegenerate if available (clears all cached workouts + history),
 * otherwise falls back to clearing just today's workout via onProfileUpdate.
 */
async function handlePlanRegeneration(context) {
  try {
    if (context.onPlanRegenerate) {
      await context.onPlanRegenerate();
      return "Your training plan has been reset and will regenerate fresh from your current profile and race date. Head to the Dashboard to load today's new workout.";
    }
    if (context.onProfileUpdate && context.athleteProfile) {
      await context.onProfileUpdate(context.athleteProfile);
      return 'Your plan cache has been cleared. Head to the Dashboard — your workout will regenerate based on your current profile and race target.';
    }
  } catch (e) {
    // fall through to safe message
  }
  return 'To regenerate your plan, go to the Dashboard and pull down to refresh. Your workouts will be rebuilt based on your current race date and fitness data.';
}

/**
 * Handle a profile change request (race date, race type, distance, new race).
 */
async function handleProfileChange(userMessage, context) {
  const { athleteProfile, onProfileUpdate } = context;
  const lower = userMessage.toLowerCase();

  const dateMatch = parseRaceDateFromMessage(userMessage);
  const distanceMatch = parseRaceDistanceFromMessage(lower);

  const updates = {};
  const confirmParts = [];

  if (dateMatch) {
    updates.raceDate = dateMatch.toISOString();
    const formatted = dateMatch.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const daysOut = Math.ceil((dateMatch - new Date()) / (24 * 60 * 60 * 1000));
    confirmParts.push(`race date set to ${formatted} (${daysOut} days away)`);
  }

  if (distanceMatch) {
    updates.distance = distanceMatch.distance;
    updates.raceType = distanceMatch.raceType;
    confirmParts.push(`race updated to ${distanceMatch.label}`);
  }

  if (Object.keys(updates).length > 0) {
    const updated = { ...athleteProfile, ...updates };
    await onProfileUpdate(updated);
    const systemPrompt = buildCoachSystemPrompt({ ...context, athleteProfile: updated });
    const prompt = `The athlete just updated their plan: ${confirmParts.join(', ')}. Confirm the change, explain briefly how their training phases and upcoming workouts will adapt, and encourage them. Keep it under 100 words.`;
    const aiResponse = await runInference(systemPrompt, prompt);
    if (aiResponse) return aiResponse.trim();
    return `Got it! I've updated your ${confirmParts.join(' and ')}. Your training phases and workouts will adjust automatically — every session from here is tailored to your new target!`;
  }

  // No parseable update — pass to AI with explicit instruction to help
  const systemPrompt = buildCoachSystemPrompt(context);
  const prompt = `${userMessage}\n\n[The athlete wants to change their race or training goal. Help them update it. If they need to provide a date, ask for it specifically. DO NOT say the plan is finalized or cannot change.]`;
  const aiResponse = await runInference(systemPrompt, prompt);
  if (aiResponse) return aiResponse.trim();
  return `I want to update your plan! Could you tell me the race date? For example: "My race is on September 28, 2026".`;
}

const DISTANCE_ALIASES = [
  {
    patterns: ['sprint', 'sprint triathlon'],
    distance: 'Sprint',
    raceType: 'triathlon',
    label: 'Sprint Triathlon',
  },
  {
    patterns: ['olympic', 'olympic triathlon', 'oly'],
    distance: 'Olympic',
    raceType: 'triathlon',
    label: 'Olympic Triathlon',
  },
  {
    patterns: ['half ironman', '70.3', 'half distance', 'half tri'],
    distance: '70.3',
    raceType: 'triathlon',
    label: 'Half Ironman (70.3)',
  },
  {
    patterns: ['ironman', 'full ironman', 'full distance', '140.6'],
    distance: 'Full',
    raceType: 'triathlon',
    label: 'Full Ironman (140.6)',
  },
  { patterns: ['marathon'], distance: 'Marathon', raceType: 'running', label: 'Marathon' },
  {
    patterns: ['half marathon'],
    distance: 'Half Marathon',
    raceType: 'running',
    label: 'Half Marathon',
  },
  { patterns: ['5k', '5km'], distance: '5K', raceType: 'running', label: '5K' },
  { patterns: ['10k', '10km'], distance: '10K', raceType: 'running', label: '10K' },
];

function parseRaceDistanceFromMessage(lower) {
  for (const alias of DISTANCE_ALIASES) {
    if (alias.patterns.some((p) => lower.includes(p))) {
      return alias;
    }
  }
  return null;
}

/**
 * Parse a date from a user message about race day changes.
 */
function parseRaceDateFromMessage(message) {
  const months = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  // Match "September 28", "Sep 28 2026", "March 15, 2027"
  const pattern =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/i;
  const match = message.match(pattern);
  if (match) {
    const month = months[match[1].toLowerCase()];
    const day = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : guessYear(month, day);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && date > new Date()) return date;
    // If date is in the past without a year, try next year
    if (!match[3] && date <= new Date()) {
      const nextYear = new Date(year + 1, month, day);
      if (!isNaN(nextYear.getTime())) return nextYear;
    }
  }
  return null;
}

function guessYear(month, day) {
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), month, day);
  return thisYear > now ? now.getFullYear() : now.getFullYear() + 1;
}

/**
 * Build a conversation summary from full history.
 * Groups exchanges, extracts topics, appends last 3 messages verbatim.
 */
/**
 * Detect whether a coach message contains a specific workout prescription.
 * Used to pin the last prescription in the conversation summary so the LLM
 * stays consistent when asked the same question again.
 */
function isWorkoutPrescription(content) {
  const lower = content.toLowerCase();
  const hasDiscipline = ['swim', 'bike', 'run', 'ride', 'cycle', 'brick', 'strength'].some((d) =>
    lower.includes(d)
  );
  const hasQuantity = ['min', 'hour', 'km', 'mile', 'interval', 'zone', 'session'].some((q) =>
    lower.includes(q)
  );
  const hasPrescriptionVerb = [
    "i'd suggest",
    'i recommend',
    'i prescribe',
    'your workout',
    'how about a',
    'try a',
    "let's do",
    "i've updated",
    "i've scheduled",
    'plan includes',
    'scheduled a',
  ].some((v) => lower.includes(v));
  return (hasDiscipline && hasQuantity) || hasPrescriptionVerb;
}

// Max messages passed into context — 6 turns (3 athlete + 3 coach).
// Older messages are summarised into topTopics to preserve context budget.
const MAX_HISTORY_MESSAGES = 6;

export function buildConversationSummary(messages) {
  if (!messages || messages.length === 0) return '';

  // Only analyse the most recent MAX_HISTORY_MESSAGES for recent topics;
  // older history is intentionally dropped to stay within token budget.
  const bounded = messages.slice(-MAX_HISTORY_MESSAGES);
  const athleteMessages = bounded.filter((m) => m.role === 'athlete');
  const topicCounts = {};
  athleteMessages.forEach((m) => {
    const topic = classifyMessage(m.content);
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });

  const topTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([topic]) => topic);

  const parts = [];
  if (topTopics.length > 0) {
    parts.push(`CONVERSATION HISTORY (last ${bounded.length} messages):`);
    parts.push(`Key topics discussed: ${topTopics.join(', ')}`);
  }

  // Pin the most recent workout prescription from the bounded history.
  // This prevents the LLM from prescribing a different workout when asked again.
  const coachMessages = bounded.filter((m) => m.role === 'coach');
  const lastPrescription = [...coachMessages]
    .reverse()
    .find((m) => isWorkoutPrescription(m.content));
  if (lastPrescription) {
    const capped =
      lastPrescription.content.length > 250
        ? `${lastPrescription.content.slice(0, 250)}…`
        : lastPrescription.content;
    parts.push(`LAST WORKOUT PRESCRIPTION (stay consistent with this): ${capped}`);
  }

  // Include last 2 exchanges (4 messages) with content capped to save context space
  const recentMessages = bounded.slice(-4);
  if (recentMessages.length > 0) {
    parts.push('Recent messages:');
    recentMessages.forEach((m) => {
      const role = m.role === 'athlete' ? 'Athlete' : 'Coach';
      const content = m.content.length > 120 ? `${m.content.slice(0, 120)}…` : m.content;
      parts.push(`${role}: ${content}`);
    });
  }

  return parts.join('\n');
}

/**
 * Extract key facts from a session's messages for tiered context history.
 * Pure function — no AI calls, regex/string logic only.
 *
 * @param {Array} messages - Session messages array
 * @param {string} date - Session date string (YYYY-MM-DD)
 * @returns {{ date: string, keyFacts: string[], intents: string[], workoutPrescribed: string|null }}
 */
export function extractSessionFacts(messages, date) {
  if (!messages || messages.length === 0) {
    return { date: date || '', keyFacts: [], intents: [], workoutPrescribed: null };
  }

  const coachMessages = messages.filter((m) => m.role === 'coach');
  const athleteMessages = messages.filter((m) => m.role === 'athlete');

  // Extract key facts from all messages (coach + athlete combined)
  const keyFacts = [];
  const factPatterns = [
    { pattern: /swap|swapped|switch|changed.*workout/i, label: 'workout swapped' },
    { pattern: /load.*reduc|reduc.*load|easier|lighter/i, label: 'load reduced' },
    { pattern: /load.*increas|push.*harder|more.*volume/i, label: 'load increased' },
    {
      pattern: /knee|shoulder|back|hip|ankle|hamstring|injury|pain|sore/i,
      label: 'injury/pain mention',
    },
    { pattern: /tire|exhaust|fatigue|burnt? out/i, label: 'fatigue reported' },
    { pattern: /race|event|sign.*up|register/i, label: 'race discussion' },
    { pattern: /rest day|day off|recovery day/i, label: 'rest day requested' },
  ];

  const allMessages = [...coachMessages, ...athleteMessages];
  for (const msg of allMessages) {
    if (keyFacts.length >= 5) break;
    for (const { pattern, label } of factPatterns) {
      if (pattern.test(msg.content) && !keyFacts.includes(label)) {
        keyFacts.push(label);
        if (keyFacts.length >= 5) break;
      }
    }
  }

  // Extract unique intents from athlete messages using classifyMessage
  const intentSet = new Set();
  for (const msg of athleteMessages) {
    const intent = classifyMessage(msg.content);
    if (intent && intent !== 'general') {
      intentSet.add(intent);
    }
  }
  const intents = Array.from(intentSet);

  // Find last workout prescription from coach messages (capped at 80 chars)
  const lastPrescription = [...coachMessages]
    .reverse()
    .find((m) => isWorkoutPrescription(m.content));
  let workoutPrescribed = null;
  if (lastPrescription) {
    workoutPrescribed =
      lastPrescription.content.length > 80
        ? `${lastPrescription.content.slice(0, 80)}…`
        : lastPrescription.content;
  }

  return { date: date || '', keyFacts, intents, workoutPrescribed };
}

/**
 * Build a compact tiered context string for the AI system prompt.
 * Replaces buildConversationSummary for injection into the coach prompt.
 *
 * Tier 1: Last 5 exchanges (10 messages) verbatim from current session
 * Tier 2: Last 7 historical sessions — compact facts
 * Tier 3: Older sessions — single compressed background line
 *
 * @param {Array} currentMessages - Today's session messages
 * @param {Array} contextHistory - Past session summaries from chatContextHistory
 * @returns {string} Formatted context string for AI injection
 */
export function buildContextForAI(currentMessages, contextHistory) {
  const parts = [];

  // Tier 1: recent exchanges from current session (last 10 messages = 5 exchanges)
  if (currentMessages && currentMessages.length > 0) {
    const recentMessages = currentMessages.slice(-10);
    const tier1Lines = ['RECENT EXCHANGES (today):'];
    recentMessages.forEach((m) => {
      const role = m.role === 'athlete' ? 'Athlete' : 'Coach';
      const content = m.content.length > 120 ? `${m.content.slice(0, 120)}…` : m.content;
      tier1Lines.push(`${role}: ${content}`);
    });
    parts.push(tier1Lines.join('\n'));

    // Also pin last prescription from current session for coach consistency
    const coachMessages = currentMessages.filter((m) => m.role === 'coach');
    const lastPrescription = [...coachMessages]
      .reverse()
      .find((m) => isWorkoutPrescription(m.content));
    if (lastPrescription) {
      const capped =
        lastPrescription.content.length > 250
          ? `${lastPrescription.content.slice(0, 250)}…`
          : lastPrescription.content;
      parts.push(`LAST WORKOUT PRESCRIPTION (stay consistent with this): ${capped}`);
    }
  }

  // Tier 2: last 7 historical sessions — compact facts per session
  const history = contextHistory || [];
  if (history.length > 0) {
    const recentHistory = history.slice(0, 7);
    const tier2Lines = ['RECENT HISTORY (last 7 days):'];
    recentHistory.forEach((session) => {
      const facts =
        session.keyFacts && session.keyFacts.length > 0
          ? session.keyFacts.join(', ')
          : session.intents && session.intents.length > 0
            ? session.intents.join(', ')
            : 'general chat';
      tier2Lines.push(`${session.date}: ${facts}`);
    });
    parts.push(tier2Lines.join('\n'));
  }

  // Tier 3: older sessions — compressed background from remaining history
  if (history.length > 7) {
    const olderHistory = history.slice(7);
    const allOlderFacts = olderHistory.flatMap((s) => s.keyFacts || []);
    const uniqueFacts = [...new Set(allOlderFacts)].slice(0, 5);
    if (uniqueFacts.length > 0) {
      parts.push(`BACKGROUND: ${uniqueFacts.join('; ')}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Build the system prompt injected with full athlete context.
 */
export function buildCoachSystemPrompt(context) {
  const {
    athleteProfile,
    healthData,
    readinessScore,
    phase,
    daysToRace,
    todayWorkout,
    recentScore,
    overallReadiness,
    workoutHistory,
    conversationSummary,
    completedWorkouts,
  } = context;

  const sections = [];

  const raceType = athleteProfile?.raceType || 'triathlon';
  const coachType = isRunningOnly(athleteProfile) ? 'running' : 'endurance triathlon';

  sections.push(buildIdentitySection(coachType));
  sections.push(buildSkillsSection());

  sections.push(`ATHLETE PROFILE:
- Race type: ${raceType}
- Distance: ${athleteProfile?.distance || 'N/A'}
- Level: ${athleteProfile?.level || 'Intermediate'}
- Weekly hours: ${athleteProfile?.weeklyHours || 'N/A'}
- Strongest: ${athleteProfile?.strongestDiscipline || 'N/A'}
- Weakest: ${athleteProfile?.weakestDiscipline || 'N/A'}
- Injuries: ${athleteProfile?.injuries || 'None'}
- Goal time: ${athleteProfile?.goalTime || 'N/A'}`);

  const hrZones = deriveHRZonesFromWorkouts(completedWorkouts, healthData?.restingHR);
  const zonesLine = hrZones
    ? `- HR zones (derived): LTHR ${hrZones.lthr} bpm | Z2 ${hrZones.zones[1].min}-${hrZones.zones[1].max} | Z4 ${hrZones.zones[3].min}-${hrZones.zones[3].max} bpm`
    : '- HR zones: formula-based (insufficient workout data)';

  sections.push(`CURRENT STATUS:
- Training phase: ${phase || 'BASE'}
- Days to race: ${daysToRace ?? 'N/A'}
- Readiness score: ${readinessScore ?? 'N/A'}/100
- Resting HR: ${healthData?.restingHR || 'N/A'} bpm
- HRV: ${healthData?.hrv || 'N/A'} ms
- Sleep: ${healthData?.sleepHours?.toFixed(1) || 'N/A'} hours
${zonesLine}`);

  if (overallReadiness) {
    sections.push(`OVERALL READINESS BREAKDOWN:
- Overall: ${overallReadiness.overall}/100
- Health: ${overallReadiness.health}/100
- Training compliance: ${overallReadiness.compliance}/100
- Race preparation: ${overallReadiness.racePrep}/100`);
  }

  if (recentScore && recentScore.length > 0) {
    const lines = recentScore.map((day) => {
      const prescribed = day.prescribedDiscipline
        ? `${day.prescribedDiscipline} ${day.prescribedDuration}min`
        : 'N/A';
      const actual =
        day.workouts?.map((w) => `${w.discipline} ${w.duration}min`).join(', ') || 'none';
      return `  ${day.dateLabel}: prescribed ${prescribed}, actual: ${actual}, compliance ${day.completionScore ?? 'N/A'}%`;
    });
    sections.push(`RECENT SESSIONS (last 3 days including today):\n${lines.join('\n')}`);
  }

  const workoutInfo = todayWorkout
    ? todayWorkout.discipline === 'rest'
      ? `Rest Day (recovery — no training)`
      : `${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration}min, ${todayWorkout.intensity})`
    : 'Not generated yet';
  // Detect if today's workout was swapped from the plan
  const contextWeekPlan = context.weekPlan || null;
  const todayIdx = new Date().getDay();
  const plannedDiscipline = contextWeekPlan ? contextWeekPlan[todayIdx] : null;
  const isSwapped =
    todayWorkout &&
    todayWorkout.discipline !== 'rest' &&
    plannedDiscipline &&
    todayWorkout.discipline !== plannedDiscipline;

  sections.push(
    `TODAY'S WORKOUT: ${workoutInfo}${isSwapped ? ` (adjusted from planned ${plannedDiscipline})` : ''}`
  );

  if (contextWeekPlan) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const planLines = dayNames.map((day, i) => `  ${day}: ${contextWeekPlan[i] || 'rest'}`);
    const planHeader = isSwapped
      ? 'WEEKLY TRAINING PLAN (default template — today was adjusted, see above)'
      : 'WEEKLY TRAINING PLAN (prescribed disciplines for the week)';
    sections.push(`${planHeader}:\n${planLines.join('\n')}`);
  }

  if (workoutHistory && workoutHistory.length > 0) {
    // Exclude rest days — they add noise and have no meaningful metrics
    const activeWorkouts = workoutHistory.filter((w) => w.discipline !== 'rest');
    const recent = activeWorkouts.slice(-7);
    if (recent.length > 0) {
      const historyLines = recent.map((w) => {
        const duration = w.durationMinutes || w.duration || '?';
        const parts = [w.discipline, `${duration}min`];
        if (w.avgHeartRate) parts.push(`avg ${w.avgHeartRate}bpm`);
        if (w.maxHeartRate) parts.push(`max ${w.maxHeartRate}bpm`);
        if (w.effortScore) parts.push(`effort ${w.effortScore}/10`);
        if (w.avgPace) {
          const mins = Math.floor(w.avgPace);
          const secs = Math.round((w.avgPace - mins) * 60);
          parts.push(`pace ${mins}:${secs.toString().padStart(2, '0')}/km`);
        }
        if (w.startDate) parts.push(`(${new Date(w.startDate).toLocaleDateString()})`);
        return parts.join(', ');
      });
      sections.push(
        `RECENT WORKOUT HISTORY (last ${recent.length} sessions):\n${historyLines.join('\n')}`
      );
    }
  }

  // Training trends
  if (context.trends) {
    const summary = generateTrendSummary(context.trends.health, context.trends.workout);
    sections.push(`TRAINING TRENDS:\n${summary}`);
  }

  // Pace achievements and PRs — used to congratulate and motivate
  // Only injected when completedWorkouts is available (avoids empty block)
  if (completedWorkouts?.length > 0) {
    const achievements = detectPaceAchievements(completedWorkouts);
    const achievementBlock = formatAchievementsForCoach(achievements);
    if (achievementBlock) {
      sections.push(achievementBlock);
    }
  }

  // Athlete insights from recent conversations
  const insights = athleteProfile?.athleteInsights;
  if (insights) {
    const insightParts = [
      `ATHLETE INSIGHTS (from recent conversations):\n- Mood: ${insights.recentMood}`,
    ];
    if (insights.painPoints?.length > 0) {
      insightParts.push(`- Pain points: ${insights.painPoints.join(', ')}`);
    }
    if (insights.preferredIntensity) {
      insightParts.push(`- Preferred intensity: ${insights.preferredIntensity}`);
    }
    if (insights.lastFatigueReport) {
      const daysAgo = Math.round(
        (Date.now() - new Date(insights.lastFatigueReport).getTime()) / 86400000
      );
      insightParts.push(`- Last fatigue report: ${daysAgo} day(s) ago`);
    }
    if (insights.conversationThemes?.length > 0) {
      insightParts.push(`- Recent topics: ${insights.conversationThemes.join(', ')}`);
    }
    // Load adjustment fields
    if (insights.loadAdjustment && insights.loadAdjustmentExpiry) {
      const expiry = new Date(insights.loadAdjustmentExpiry);
      if (expiry > new Date()) {
        insightParts.push(
          `- Active load adjustment: ${insights.loadAdjustment} (expires ${expiry.toLocaleDateString()})`
        );
      }
    }
    if (insights.requestedRestDay) {
      const restDate = new Date(insights.requestedRestDay);
      if (restDate >= new Date(new Date().setHours(0, 0, 0, 0))) {
        insightParts.push(
          `- Requested rest day: ${restDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
        );
      }
    }
    if (insights.requestedDisciplineFocus) {
      insightParts.push(`- Requested discipline focus: ${insights.requestedDisciplineFocus}`);
    }
    sections.push(insightParts.join('\n'));
  }

  // Coaching knowledge + plan rules (from agentConstitution — always injected)
  sections.push(`COACHING KNOWLEDGE:\n${COACH_KNOWLEDGE}`);
  sections.push(PLAN_RULES);

  if (conversationSummary) {
    sections.push(conversationSummary);
  }

  sections.push(COACH_CONSTRAINTS);

  const raw = sections.join('\n\n');
  return trimPromptToTokenBudget(raw);
}

// ---------------------------------------------------------------------------
// TOKEN MANAGEMENT
// Qwen 3.5 context window is 4096 tokens. System prompt must stay ≤ 2048 tokens.
// Rule of thumb: 1 token ≈ 4 characters.
// ---------------------------------------------------------------------------

const MAX_SYSTEM_PROMPT_TOKENS = 2048;
const CHARS_PER_TOKEN = 4;
const MAX_SYSTEM_CHARS = MAX_SYSTEM_PROMPT_TOKENS * CHARS_PER_TOKEN;

/**
 * Estimate token count from a string using the 4-char-per-token heuristic.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Trim a system prompt to fit within the 2048-token budget.
 * Truncation priority (least important first):
 *   1. CONVERSATION HISTORY section (if present)
 *   2. COACHING KNOWLEDGE section
 * Identity, constraints, and athlete status are never trimmed.
 */
export function trimPromptToTokenBudget(prompt) {
  if (estimateTokens(prompt) <= MAX_SYSTEM_PROMPT_TOKENS) return prompt;

  // Try trimming the CONVERSATION HISTORY section first
  let trimmed = prompt.replace(/(CONVERSATION HISTORY[\s\S]*?)(\n\n[A-Z])/, (_, _history, next) => {
    const short = _history.split('\n').slice(0, 4).join('\n') + '\n[history trimmed for context]';
    return short + next;
  });
  if (estimateTokens(trimmed) <= MAX_SYSTEM_PROMPT_TOKENS) return trimmed;

  // Then trim COACHING KNOWLEDGE to first 3 lines
  trimmed = trimmed.replace(
    /(COACHING KNOWLEDGE:\n)([\s\S]*?)(\n\n[A-Z])/,
    (_, label, content, next) => {
      const short = content.split('\n').slice(0, 3).join('\n') + '\n[knowledge trimmed]';
      return label + short + next;
    }
  );
  if (estimateTokens(trimmed) <= MAX_SYSTEM_PROMPT_TOKENS) return trimmed;

  // Last resort: hard truncate to budget (preserves start of prompt — identity + constraints)
  return trimmed.slice(0, MAX_SYSTEM_CHARS) + '\n[prompt truncated]';
}

/**
 * Generate a proactive morning greeting.
 * Tries AI model first, falls back to rule-based.
 */
export async function generateProactiveGreeting(context) {
  const { recentScore, todayWorkout, daysToRace, readinessScore, phase } = context;
  const yesterdayScore = recentScore?.find((d) => d.dateLabel === 'Yesterday') ?? null;

  const systemPrompt = `${buildIdentitySection('endurance triathlon')}
Generate a brief, motivating morning message for your athlete.
Include today's workout preview and race countdown encouragement.${yesterdayScore ? " Include yesterday's performance feedback." : " Do NOT mention yesterday's workout or completion percentage — no data available."}
Keep it under 100 words. Be warm, specific, and push them to follow the plan. NEVER fabricate statistics or percentages — only reference data provided below.`;

  const parts = [];
  if (yesterdayScore?.completionScore !== null && yesterdayScore?.completionScore !== undefined) {
    parts.push(
      `Yesterday: ${yesterdayScore.completionScore}% completion (${yesterdayScore.feedback?.label})`
    );
  }
  if (todayWorkout) {
    parts.push(
      `Today: ${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration}min)`
    );
  }
  parts.push(
    `Readiness: ${readinessScore ?? 'N/A'}/100, Phase: ${phase}, Days to race: ${daysToRace ?? 'N/A'}`
  );

  const modelResponse = await runInference(systemPrompt, parts.join('. '));
  if (modelResponse) return modelResponse.trim();

  return generateFallbackGreeting(context);
}

/**
 * Rule-based proactive greeting.
 */
export function generateFallbackGreeting(context) {
  const { recentScore, todayWorkout, daysToRace, readinessScore, phase } = context;
  const yesterdayScore = recentScore?.find((d) => d.dateLabel === 'Yesterday') ?? null;
  const parts = [];

  // Yesterday feedback
  if (yesterdayScore?.completionScore !== null && yesterdayScore?.completionScore !== undefined) {
    parts.push(
      `Yesterday you completed ${yesterdayScore.completionScore}% of your workout. ${yesterdayScore.feedback?.message || ''}`
    );
  }

  // Today preview
  if (todayWorkout) {
    const score = readinessScore || 65;
    let motivation = 'Give it your best today.';
    if (score >= 75) motivation = 'Your body is ready — make this one count!';
    else if (score < 55) motivation = 'Take it easy and focus on recovery.';
    parts.push(
      `Today's session: ${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration}min). ${motivation}`
    );
  }

  // Race countdown
  if (daysToRace !== null && daysToRace !== undefined) {
    const phaseMessages = {
      RACE_WEEK: 'Race week! Trust your training and stay calm.',
      TAPER: 'Taper mode — the hard work is done. Stay sharp.',
      PEAK: 'Peak training — this is where champions are made.',
      BUILD: 'Building fitness every day. Stay consistent!',
      BASE: 'Building your foundation. Every session matters.',
    };
    parts.push(`${daysToRace} days to race. ${phaseMessages[phase] || phaseMessages.BASE}`);
  }

  return parts.join(' ') || 'Good morning! Ready to train today?';
}

/**
 * Generate a weekly review (for Sunday nights).
 */
export async function generateWeeklyReview(context) {
  const { athleteProfile, workoutHistory, phase, daysToRace, overallReadiness } = context;
  const { generateWeeklyPlanAdjustment } = require('./localModel');

  const complianceScore = overallReadiness?.compliance ?? null;

  return generateWeeklyPlanAdjustment({
    profile: athleteProfile,
    weekHistory: (workoutHistory || []).slice(-7),
    phase,
    daysToRace,
    complianceScore,
  });
}

/**
 * Classify user message into a coaching category for fallback.
 */
export function classifyMessage(message) {
  const lower = message.toLowerCase();
  const categories = [
    {
      key: 'profile_change',
      keywords: [
        'change my race',
        'move my race',
        'race date',
        'race day to',
        'change my goal',
        'update my',
        'set my race',
        'my race is on',
        'race is in',
        'racing on',
        // New race / adding a race
        'found a race',
        'add a race',
        'new race',
        'signed up for',
        'signing up for',
        'registered for',
        'i want to do a',
        'i want to race',
        'i want to compete',
        'entered a race',
        'targeting a race',
        'i found a',
        'just signed',
        // Distance / goal changes
        'change my distance',
        'switch to a',
        'switching to',
        'doing a half',
        'doing a full',
        'doing an ironman',
        "i'm doing a",
        'training for a marathon',
        'training for a half',
        'train for a marathon',
        'train for a sprint',
        'train for a 70.3',
        'train for an ironman',
        '70.3',
        'change my goal distance',
        'new goal',
        'different race',
        'different distance',
        // Natural date phrases
        'race in',
        'race on',
        'compete in',
        'compete on',
        'event in',
        'event on',
        // Race changes / cancellations / postponements
        'pushed my race',
        'postponed my race',
        'cancelled my race',
        'canceled my race',
        'race is cancelled',
        'race is canceled',
        'race is postponed',
        'dropped out',
        'not racing',
        'race next month',
        'race in a few weeks',
        'race is in',
        'deferred my race',
        'race got moved',
        'race was moved',
        'pulled out',
        'my race moved',
        'race has moved',
      ],
    },
    {
      key: 'plan_regeneration',
      keywords: [
        'regenerate my plan',
        'regenerate the plan',
        'generate a new plan',
        'generate new plan',
        'rebuild my plan',
        'rebuild the plan',
        'reset my plan',
        'reset the plan',
        'redo my plan',
        'new training plan',
        'start fresh',
        'fresh start',
        'start over',
        'restart my plan',
        'create a new plan',
        'make me a new plan',
      ],
    },
    {
      key: 'load_adjustment',
      keywords: [
        'take it easy',
        'easier this week',
        'reduce load',
        'reduce my training',
        'less training',
        'back off',
        'dial it back',
        'lighter week',
        'cut back',
        'ease up',
        'take tomorrow off',
        'day off tomorrow',
        'rest tomorrow',
        'skip tomorrow',
        'tomorrow off',
        'need a rest day',
        'give me tomorrow off',
        // Explicit fatigue / burnout declarations (not questions or mild descriptions)
        "i'm exhausted",
        'i am exhausted',
        'feeling exhausted',
        'i am burned out',
        "i'm burned out",
        'burned out',
        'burnt out',
        'dead legs',
        'legs are dead',
        'totally drained',
        'completely drained',
        'too sore to train',
        'body is wrecked',
        'feeling wrecked',
        'need a few days off',
        'need to skip',
        'feeling run down',
        'run down',
        'no energy',
        'zero energy',
        'overtrained',
        'not feeling it today',
        'not feeling it',
        'really struggling',
        'struggling today',
        // Load increase signals
        'push harder',
        'more volume',
        'increase load',
        'step it up',
        'push me harder',
        // Discipline focus signals
        'focus on swim',
        'focus on bike',
        'focus on run',
        'more swimming',
        'more cycling',
        'more running',
      ],
    },
    {
      key: 'schedule_preference',
      keywords: [
        'long sessions on',
        'long session on',
        'long runs on',
        'long ride on',
        'train on weekends',
        'train on the weekend',
        'weekends for long',
        'prefer weekends',
        'prefer saturday',
        'prefer sunday',
        'rest on friday',
        'rest on monday',
        'day off on',
        'no training on',
        'move my long',
        'long workouts on',
        'schedule my long',
        'want to do long',
        'do my long',
        'move rest day',
        'move my rest',
        'change rest day',
        'change my rest',
        'rest days on',
        'rest day to',
        'avoid training on',
        'free on weekdays',
        'only train on',
        'move strength',
        'move my strength',
        'change strength',
        'change my strength',
        'strength on',
        'strength to',
        'strength session on',
        'strength session to',
        'strength training on',
        'strength training to',
        'strength workout on',
        'strength workout to',
        'strength day on',
        'strength day to',
        'move weights',
        'move my weights',
        'weights on',
        'weights to',
        'gym on',
        'gym to',
        'gym day on',
        'gym day to',
        'lifting on',
        'lifting to',
        'lifting day on',
        'lifting day to',
      ],
    },
    {
      key: 'workout_swap',
      keywords: [
        'different workout',
        'change workout',
        "can't do",
        'cannot do',
        'not feeling',
        'something else',
        'give me another',
        'another workout',
        'new workout',
      ],
    },
    {
      key: 'workout_modification',
      keywords: [
        'modify',
        'swap',
        'shorter',
        'longer',
        'easier',
        'harder',
        'skip',
        'replace',
        'adjust workout',
        'too hard',
        'too easy',
        'can i do',
      ],
    },
    {
      key: 'completed_workout',
      keywords: [
        'finish yesterday',
        'finished yesterday',
        'did yesterday',
        'completed yesterday',
        'done yesterday',
        'yesterday workout',
        'yesterday session',
        'workouts i finish',
        'workouts i did',
        'workouts i completed',
        'i finish yesterday',
        'i did yesterday',
        'i completed yesterday',
        'last workout',
        'past workout',
        'recent workout',
        'workout history',
        'what did i do',
        'what have i done',
        'how did i do',
        'my activity',
        'recent activity',
        'completed workouts',
        'finished workouts',
      ],
    },
    {
      key: 'workout_inquiry',
      keywords: [
        'what is my workout',
        'what workout',
        "today's workout",
        'what should i do today',
        'what do i do today',
        'what am i doing today',
        'workout today',
        'session today',
        'training today',
        'what should i train',
        'what do i train',
        'tell me my workout',
        'show me my workout',
        'my workout',
      ],
    },
    {
      key: 'schedule_inquiry',
      keywords: [
        'when is my',
        'when do i',
        'what day is',
        'which day',
        'when is the',
        'weights session',
        'strength session',
        'next swim',
        'next bike',
        'next run',
        'next rest',
        'weekly schedule',
        'week look like',
        'this week',
      ],
    },
    {
      key: 'trend_analysis',
      keywords: [
        'analyze my training',
        'training analysis',
        'weekly review',
        'review my week',
        'how was my week',
        'am i on track',
        'training trends',
        'any recommendations',
        'suggest changes',
        'optimize my plan',
        'what should i change',
        'how is my training',
      ],
    },
    {
      key: 'readiness_inquiry',
      keywords: [
        'readiness',
        'how am i doing',
        'how am i',
        'my score',
        'my status',
        'am i ready',
        'how is my progress',
        'progress',
      ],
    },
    {
      key: 'recovery',
      keywords: [
        'recovery',
        'rest',
        'sore',
        'tired',
        'fatigue',
        'sleep',
        'hrv',
        'heart rate',
        'overtrain',
        'burnout',
        'injury',
        'pain',
        'hurt',
      ],
    },
    {
      key: 'nutrition',
      keywords: [
        'nutrition',
        'eat',
        'food',
        'hydrat',
        'fuel',
        'carb',
        'protein',
        'calorie',
        'diet',
        'race day nutrition',
        'gel',
        'electrolyte',
      ],
    },
    {
      key: 'race_strategy',
      keywords: ['pacing', 'strategy', 'transition', 'race day', 'taper', 'peak'],
    },
    {
      key: 'training_plan',
      keywords: [
        'plan',
        'schedule',
        'phase',
        'volume',
        'intensity',
        'zone',
        'threshold',
        'base',
        'build',
        'long run',
        'brick',
        'change',
      ],
    },
  ];

  for (const cat of categories) {
    if (cat.keywords.some((kw) => lower.includes(kw))) {
      return cat.key;
    }
  }
  return 'general';
}

/**
 * Generate a rule-based response without any model.
 * Every response must reference actual athlete data — never generic introductions.
 */
export function generateFallbackResponse(category, _userMessage, context) {
  const {
    readinessScore,
    phase,
    daysToRace,
    healthData,
    todayWorkout,
    recentScore,
    overallReadiness,
    workoutHistory,
  } = context;
  const yesterdayScore = recentScore?.find((d) => d.dateLabel === 'Yesterday') ?? null;
  const score = readinessScore || 65;
  const phaseLabels = {
    BASE: 'base building',
    BUILD: 'build',
    PEAK: 'peak training',
    TAPER: 'taper',
    RACE_WEEK: 'race week',
  };
  const phaseName = phaseLabels[phase] || 'base building';

  switch (category) {
    case 'schedule_preference':
      return `Let me know which days work best for you — for example, 'I want long sessions on weekends' or 'Move my rest day to Friday', and I'll update your plan right away.`;
    case 'profile_change':
      return `Tell me your new race date or goal and I'll update your plan. For example: 'My race is on September 28, 2026' or 'I signed up for a half ironman in June'.`;
    case 'completed_workout':
      return buildCompletedWorkoutResponse(workoutHistory, yesterdayScore);
    case 'workout_inquiry':
      return buildWorkoutInquiryResponse(todayWorkout, score, daysToRace, phaseName);
    case 'schedule_inquiry':
      return buildScheduleInquiryResponse(context);
    case 'readiness_inquiry':
      return buildReadinessInquiryResponse(
        overallReadiness,
        healthData,
        yesterdayScore,
        daysToRace
      );
    case 'training_plan':
      return buildTrainingPlanResponse(phaseName, daysToRace, score, workoutHistory);
    case 'workout_swap':
    case 'workout_modification':
      return buildWorkoutModResponse(todayWorkout, score);
    case 'recovery':
      return buildRecoveryResponse(healthData, score);
    case 'nutrition':
      return buildNutritionResponse(phase, daysToRace);
    case 'race_strategy':
      return buildRaceStrategyResponse(phase, daysToRace);
    default:
      return buildGeneralResponse(todayWorkout, score, daysToRace, phaseName, yesterdayScore);
  }
}

function buildCompletedWorkoutResponse(workoutHistory, yesterdayScore) {
  const parts = [];

  // Yesterday's specific data
  if (yesterdayScore) {
    const allWorkouts = yesterdayScore.workouts || [];
    if (allWorkouts.length === 1) {
      const w = allWorkouts[0];
      parts.push(
        `Yesterday you completed a ${w?.discipline || 'workout'} session${w?.duration ? ` (${w.duration}min)` : ''}${w?.title ? `: ${w.title}` : ''}.`
      );
    } else {
      parts.push(`Yesterday you completed ${allWorkouts.length} workouts:`);
      allWorkouts.forEach((w) => {
        parts.push(
          `- ${w?.discipline?.charAt(0).toUpperCase()}${w?.discipline?.slice(1)}: ${w?.duration || '?'}min`
        );
      });
    }
    parts.push(
      `Completion score: ${yesterdayScore.completionScore}%. ${yesterdayScore.feedback?.message || yesterdayScore.feedback?.label || ''}`
    );
  } else {
    parts.push(
      "I don't have a recorded workout for yesterday. It may have been a rest day, or the data hasn't synced from Apple Health yet."
    );
  }

  // Recent history
  if (workoutHistory && workoutHistory.length > 0) {
    const recent = workoutHistory.slice(-7);
    parts.push(`Here's your recent activity (last ${recent.length} sessions):`);
    recent.forEach((w) => {
      const date = w.startDate
        ? new Date(w.startDate).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : 'unknown date';
      const duration = w.durationMinutes || w.duration || '?';
      parts.push(
        `- ${w.discipline?.charAt(0).toUpperCase()}${w.discipline?.slice(1)}: ${duration}min (${date})`
      );
    });
  }

  if (parts.length === 0) {
    return "I don't have any completed workout data yet. Try syncing from Apple Health on the Dashboard, or complete a workout so I can track your progress!";
  }

  return parts.join('\n');
}

function buildWorkoutInquiryResponse(todayWorkout, score, daysToRace, _phaseName) {
  if (!todayWorkout) {
    return "Your workout hasn't been generated yet. Head to the Dashboard and it will load your session for today.";
  }

  const parts = [];
  parts.push(
    `Today you have: ${todayWorkout.title} — a ${todayWorkout.duration}-minute ${todayWorkout.discipline} session at ${todayWorkout.intensity} intensity.`
  );

  if (todayWorkout.summary) {
    parts.push(todayWorkout.summary);
  }

  if (todayWorkout.sections && todayWorkout.sections.length > 0) {
    const sectionNames = todayWorkout.sections.map((s) => s.name).join(', ');
    parts.push(`The session has ${todayWorkout.sections.length} parts: ${sectionNames}.`);

    const mainSet = todayWorkout.sections.find(
      (s) => s.name.toLowerCase().includes('main') || s.name.toLowerCase().includes('set')
    );
    if (mainSet && mainSet.sets) {
      const setDescriptions = mainSet.sets.map((s) => s.description).join('; ');
      parts.push(`Main set: ${setDescriptions}.`);
    }
  }

  const closingParts = [];
  if (score >= 75) closingParts.push('Readiness is strong — push hard!');
  else if (score < 55) closingParts.push('Readiness is low — consider taking it easier.');
  if (daysToRace !== null && daysToRace !== undefined) {
    closingParts.push(`${daysToRace} days to race.`);
  }
  if (closingParts.length > 0) parts.push(closingParts.join(' '));

  return parts.join(' ');
}

function buildScheduleInquiryResponse(context) {
  const { phase, todayWorkout } = context;
  const plan = context.weekPlan || Array(7).fill('rest');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const schedule = plan.map((discipline, i) => `${dayNames[i]}: ${discipline}`).join(', ');

  const parts = [];
  parts.push(
    `Here's your weekly schedule for the ${(phase || 'BASE').toLowerCase().replace('_', ' ')} phase:`
  );
  parts.push(schedule + '.');

  const strengthDay = plan.indexOf('strength');
  if (strengthDay >= 0) {
    parts.push(`Your strength/weights session is on ${dayNames[strengthDay]}.`);
  } else {
    parts.push(
      'There is no dedicated strength session in your current plan. You may want to add one for injury prevention.'
    );
  }

  const today = new Date().getDay();
  const plannedDiscipline = plan[today];
  const actualDiscipline = todayWorkout?.discipline;
  if (actualDiscipline && actualDiscipline !== plannedDiscipline) {
    parts.push(
      `Today (${dayNames[today]}) is ${actualDiscipline} (adjusted from planned ${plannedDiscipline}).`
    );
  } else {
    parts.push(`Today (${dayNames[today]}) is ${plannedDiscipline}.`);
  }

  return parts.join(' ');
}

function buildReadinessInquiryResponse(overallReadiness, healthData, yesterdayScore, daysToRace) {
  const parts = [];

  if (overallReadiness) {
    const score = overallReadiness.overall;
    const advice =
      score >= 75
        ? 'You are in a good spot — keep the momentum going!'
        : score < 55
          ? 'Your readiness needs attention. Focus on sleep, nutrition, and recovery.'
          : 'Readiness is moderate — stay consistent.';
    parts.push(`Your overall readiness is ${score}/100. ${advice}`);
    parts.push(
      `Breakdown — Health: ${overallReadiness.health}/100, Compliance: ${overallReadiness.compliance}/100, Race prep: ${overallReadiness.racePrep}/100.`
    );
  }

  if (healthData) {
    const metrics = [];
    if (healthData.hrv) metrics.push(`HRV ${healthData.hrv}ms`);
    if (healthData.restingHR) metrics.push(`resting HR ${healthData.restingHR}bpm`);
    if (healthData.sleepHours) metrics.push(`${healthData.sleepHours.toFixed(1)}h sleep`);
    if (metrics.length > 0) {
      parts.push(`Today's metrics: ${metrics.join(', ')}.`);
    }
  }

  if (yesterdayScore?.completionScore !== null && yesterdayScore?.completionScore !== undefined) {
    parts.push(
      `Yesterday you completed ${yesterdayScore.completionScore}% of your workout. ${yesterdayScore.feedback?.message || ''}`
    );
  }

  if (daysToRace !== null && daysToRace !== undefined) {
    parts.push(`You have ${daysToRace} days until race day.`);
  }

  return (
    parts.join(' ') ||
    "I don't have enough data to assess your readiness yet. Complete a few workouts and sync your health data so I can give you a proper score."
  );
}

function buildTrainingPlanResponse(phaseName, daysToRace, score, workoutHistory) {
  const parts = [];
  parts.push(`You're in the ${phaseName} phase`);
  if (daysToRace !== null && daysToRace !== undefined) {
    parts.push(`with ${daysToRace} days until race day`);
  }
  parts[parts.length - 1] += '.';

  if (workoutHistory && workoutHistory.length > 0) {
    const recent = workoutHistory.slice(-7);
    const disciplines = {};
    recent.forEach((w) => {
      const d = w.discipline?.toLowerCase() || 'other';
      disciplines[d] = (disciplines[d] || 0) + 1;
    });
    const breakdown = Object.entries(disciplines)
      .map(([d, count]) => `${count} ${d}`)
      .join(', ');
    parts.push(`This week you've done ${recent.length} sessions: ${breakdown}.`);

    const hasBike = disciplines.bike || 0;
    const hasSwim = disciplines.swim || 0;
    const hasRun = disciplines.run || 0;
    const missing = [];
    if (hasBike === 0) missing.push('bike');
    if (hasSwim === 0) missing.push('swim');
    if (hasRun === 0) missing.push('run');
    if (missing.length > 0) {
      parts.push(
        `You're missing ${missing.join(' and ')} — try to fit ${missing.length > 1 ? 'those' : 'that'} in.`
      );
    }
  }

  if (score >= 75) {
    parts.push(
      `Readiness ${score}/100 — great time for quality sessions. Focus on one key session per discipline.`
    );
  } else if (score >= 55) {
    parts.push(
      `Readiness ${score}/100 — keep most training in Zone 2, limit high-intensity to 1-2 sessions.`
    );
  } else {
    parts.push(
      `Readiness ${score}/100 — consider reducing volume 20-30% and prioritizing recovery.`
    );
  }
  return parts.join(' ');
}

function buildWorkoutModResponse(todayWorkout, score) {
  if (!todayWorkout) {
    return "You don't have a workout generated yet. Head to the Dashboard to generate today's session, then come back if you need modifications.";
  }

  let response = `Today's workout is ${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration} min, ${todayWorkout.intensity} intensity). `;
  if (score < 55) {
    response +=
      "Given your low readiness score, I recommend swapping this for an easy recovery session. A 30-minute easy spin or walk with stretching would be ideal. Just ask me for a different workout and I'll set one up for you.";
  } else if (score < 75) {
    response +=
      'Your readiness is moderate. You can do this workout but consider reducing the intensity of any Zone 3-4 intervals to Zone 2-3. Want me to swap it for something different?';
  } else {
    response +=
      'Your readiness is solid. Execute the workout as planned. If you feel great, you can push the upper end of the prescribed zones. Stay consistent!';
  }
  return response;
}

function buildRecoveryResponse(healthData, score) {
  let response = `Your current readiness score is ${score}/100. `;
  if (healthData) {
    const parts = [];
    if (healthData.hrv) parts.push(`HRV is ${healthData.hrv}ms`);
    if (healthData.restingHR) parts.push(`resting HR is ${healthData.restingHR}bpm`);
    if (healthData.sleepHours) parts.push(`sleep was ${healthData.sleepHours.toFixed(1)} hours`);
    if (parts.length) response += `Today's metrics: ${parts.join(', ')}. `;
  }
  if (score < 55) {
    response +=
      'Your body needs recovery. Prioritize 8+ hours of sleep, hydration, light stretching, and easy nutrition. Skip intensity today.';
  } else if (score < 75) {
    response +=
      'Recovery is adequate but not optimal. Focus on quality sleep tonight and keep training moderate. Consider adding foam rolling.';
  } else {
    response +=
      'Your recovery metrics look strong. You are well-recovered and ready for quality training.';
  }
  return response;
}

function buildNutritionResponse(phase, daysToRace) {
  let response = 'Nutrition is a key pillar of endurance training. ';
  if (phase === 'RACE_WEEK' || (daysToRace !== null && daysToRace < 7)) {
    response +=
      'In race week, focus on carb-loading 2-3 days before. Eat familiar foods, stay hydrated, and avoid anything new. Plan your race-day nutrition: aim for 60-90g carbs per hour on the bike and 30-60g on the run.';
  } else if (phase === 'TAPER') {
    response +=
      'During taper, reduce portions slightly since training volume is lower but maintain quality nutrition. Focus on anti-inflammatory foods, adequate protein (1.6-2.0g/kg), and staying well-hydrated.';
  } else {
    response +=
      'During heavy training, aim for 5-8g carbs per kg of body weight daily. Prioritize post-workout recovery meals within 30 minutes. Stay on top of hydration — aim for pale yellow urine throughout the day.';
  }
  return response;
}

function buildRaceStrategyResponse(phase, daysToRace) {
  let response = '';
  if (phase === 'RACE_WEEK' || (daysToRace !== null && daysToRace < 7)) {
    response =
      'Race week is about staying calm and trusting your training. Key tips: lay out all gear the night before, arrive early for transition setup, start the swim conservatively, ride your own race on the bike (negative split if possible), and save energy for the run. Execute your nutrition plan — practice nothing new on race day.';
  } else if (phase === 'TAPER') {
    response = `You're ${daysToRace ?? 'a few'} days out. This is a great time to finalize your race strategy. Practice your transitions mentally, decide on pacing targets for each leg, and plan your nutrition schedule. Remember: the taper is where fitness becomes performance.`;
  } else {
    response =
      "It's early to focus too much on race-day specifics, but start thinking about target paces for each discipline. Use your long sessions to practice nutrition timing and gear transitions. Build your race plan gradually through your build and peak phases.";
  }
  return response;
}

function buildGeneralResponse(todayWorkout, score, daysToRace, phaseName, yesterdayScore) {
  const parts = [];

  if (todayWorkout) {
    parts.push(
      `Today's session is ${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration}min, ${todayWorkout.intensity}).`
    );
  }

  if (score >= 75) {
    parts.push(`Readiness ${score}/100 — you're in great shape. Stay consistent!`);
  } else if (score < 55) {
    parts.push(`Readiness ${score}/100 — your body needs attention. Prioritize recovery today.`);
  } else {
    parts.push(`Readiness ${score}/100 — solid. Stay the course.`);
  }

  if (daysToRace !== null && daysToRace !== undefined) {
    parts.push(`${daysToRace} days to race in ${phaseName} phase.`);
  }

  if (yesterdayScore?.completionScore !== null && yesterdayScore?.completionScore !== undefined) {
    parts.push(`Yesterday's completion: ${yesterdayScore.completionScore}%.`);
  }

  return parts.join(' ');
}
