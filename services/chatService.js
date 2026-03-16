import { runInference } from './localModel';
import { generateReplacementWorkout, getWeeklyDisciplinePlan } from './localModel';
import { isRunningOnly } from './raceConfig';
import { generateTrendSummary } from './trendAnalysis';

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
 * Checks off-topic first, then tries AI model, falls back to rule-based.
 */
export async function getCoachResponse(userMessage, context, conversationHistory) {
  if (isOffTopic(userMessage)) {
    return getOffTopicResponse();
  }

  const category = classifyMessage(userMessage);

  // Handle profile changes (race date, goals)
  if (category === 'profile_change' && context.onProfileUpdate) {
    return handleProfileChange(userMessage, context);
  }

  // Handle schedule preference changes
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

  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) {
    return modelResponse.trim();
  }

  return generateFallbackResponse(category, userMessage, context);
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
 * Detect the intent type from a schedule preference message.
 * Returns 'longDays', 'restDays', or 'avoidDays'.
 */
function parseScheduleIntent(message) {
  const lower = message.toLowerCase();
  const restKeywords = [
    'rest on',
    'day off',
    'no training',
    'rest day',
    'avoid training',
    'move rest',
    'change rest',
  ];
  if (restKeywords.some((kw) => lower.includes(kw))) return 'restDays';

  const avoidKeywords = ['avoid', 'skip', 'no workout', 'free on'];
  if (avoidKeywords.some((kw) => lower.includes(kw))) return 'avoidDays';

  // Default to longDays for "long sessions on...", "prefer weekends", etc.
  return 'longDays';
}

/**
 * Handle a schedule preference change from the coach chat.
 * Parses day preferences and persists them to the athlete profile.
 */
async function handleSchedulePreference(userMessage, context) {
  const { athleteProfile, onProfileUpdate } = context;
  const days = parseDaysFromMessage(userMessage);

  if (days.length === 0) {
    return "I'd like to adjust your schedule, but I couldn't determine which days you mean. Try something like 'I want long sessions on weekends' or 'Move my rest day to Friday'.";
  }

  const intent = parseScheduleIntent(userMessage);
  const existing = athleteProfile.schedulePreferences || {};
  const updated = {
    ...athleteProfile,
    schedulePreferences: {
      ...existing,
      [intent]: days,
    },
  };

  await onProfileUpdate(updated);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayList = days.map((d) => dayNames[d]).join(' and ');

  const responses = {
    longDays: `Done! I've updated your plan to schedule long sessions on ${dayList}. Your calendar and daily workouts will reflect this change. The bike and long endurance sessions will now be placed on ${dayList}.`,
    restDays: `Done! I've set ${dayList} as rest days in your plan. Your weekly schedule will adjust to keep training balanced on the remaining days.`,
    avoidDays: `Got it! I've marked ${dayList} as days to avoid training. I'll redistribute your workouts across the other days of the week.`,
  };

  return responses[intent];
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

  const name = athleteProfile.name ? `${athleteProfile.name}, ` : '';
  const expiryStr =
    newInsights.loadAdjustmentExpiry && isReduceRequest
      ? ` through ${new Date(newInsights.loadAdjustmentExpiry).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}`
      : '';

  return `Got it, ${name}I've ${confirmationParts.join(' and ')}${expiryStr}. Your workouts will adapt automatically — listen to your body and let me know if you need further adjustments.`;
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
 * Handle a profile change request (e.g. race date update).
 */
async function handleProfileChange(userMessage, context) {
  const { athleteProfile, onProfileUpdate } = context;
  const dateMatch = parseRaceDateFromMessage(userMessage);

  if (dateMatch) {
    const updated = { ...athleteProfile, raceDate: dateMatch.toISOString() };
    await onProfileUpdate(updated);
    const formatted = dateMatch.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const daysOut = Math.ceil((dateMatch - new Date()) / (24 * 60 * 60 * 1000));
    return `Done! I've updated your race date to ${formatted}. That's ${daysOut} days from now. Your training phases and workout plan will adjust automatically. Let's make every session count!`;
  }

  return "I'd like to update your race date but I couldn't parse the date from your message. Try something like 'Change my race day to September 28' or 'My race is on March 15, 2027'.";
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
export function buildConversationSummary(messages) {
  if (!messages || messages.length === 0) return '';

  const athleteMessages = messages.filter((m) => m.role === 'athlete');
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
    parts.push(`CONVERSATION HISTORY (${messages.length} messages):`);
    parts.push(`Key topics discussed: ${topTopics.join(', ')}`);
  }

  // Include last 3 exchanges verbatim for immediate context
  const recentMessages = messages.slice(-6);
  if (recentMessages.length > 0) {
    parts.push('Recent messages:');
    recentMessages.forEach((m) => {
      const role = m.role === 'athlete' ? 'Athlete' : 'Coach';
      parts.push(`${role}: ${m.content}`);
    });
  }

  return parts.join('\n');
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
    yesterdayScore,
    overallReadiness,
    workoutHistory,
    conversationSummary,
  } = context;

  const sections = [];

  const raceType = athleteProfile?.raceType || 'triathlon';
  const coachType = isRunningOnly(athleteProfile) ? 'running' : 'endurance triathlon';

  const athleteName = athleteProfile?.name || null;
  sections.push(`You are an elite ${coachType} coach named Alex. Your name is Alex.
You are coaching ${athleteName ? athleteName : 'the athlete'}.
Always address the athlete as '${athleteName || 'you'}'. Never call the athlete 'Coach'.
You are ONLY an ${coachType} coach. If the athlete asks about non-training topics, politely decline and redirect to training.
When the athlete is struggling, encourage them but also offer to adjust the workout. Push them to follow their plan.`);

  sections.push(`ATHLETE PROFILE:
- Race type: ${raceType}
- Distance: ${athleteProfile?.distance || 'N/A'}
- Level: ${athleteProfile?.level || 'Intermediate'}
- Weekly hours: ${athleteProfile?.weeklyHours || 'N/A'}
- Strongest: ${athleteProfile?.strongestDiscipline || 'N/A'}
- Weakest: ${athleteProfile?.weakestDiscipline || 'N/A'}
- Injuries: ${athleteProfile?.injuries || 'None'}
- Goal time: ${athleteProfile?.goalTime || 'N/A'}`);

  sections.push(`CURRENT STATUS:
- Training phase: ${phase || 'BASE'}
- Days to race: ${daysToRace ?? 'N/A'}
- Readiness score: ${readinessScore ?? 'N/A'}/100
- Resting HR: ${healthData?.restingHR || 'N/A'} bpm
- HRV: ${healthData?.hrv || 'N/A'} ms
- Sleep: ${healthData?.sleepHours?.toFixed(1) || 'N/A'} hours`);

  if (overallReadiness) {
    sections.push(`OVERALL READINESS BREAKDOWN:
- Overall: ${overallReadiness.overall}/100
- Health: ${overallReadiness.health}/100
- Training compliance: ${overallReadiness.compliance}/100
- Race preparation: ${overallReadiness.racePrep}/100`);
  }

  if (yesterdayScore) {
    const prescribed = yesterdayScore.prescribedDiscipline
      ? `${yesterdayScore.prescribedDiscipline} ${yesterdayScore.prescribedDuration}min`
      : 'N/A';
    const actual =
      yesterdayScore.allWorkouts?.map((w) => `${w.discipline} ${w.duration}min`).join(', ') ||
      'none';
    sections.push(`YESTERDAY'S PERFORMANCE:
- Prescribed: ${prescribed}
- Actual: ${actual}
- Compliance: ${yesterdayScore.completionScore ?? 'N/A'}%
- Feedback: ${yesterdayScore.feedback?.label || 'N/A'}`);
  }

  const workoutInfo = todayWorkout
    ? `${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration}min, ${todayWorkout.intensity})`
    : 'Not generated yet';
  sections.push(`TODAY'S WORKOUT: ${workoutInfo}`);

  if (workoutHistory && workoutHistory.length > 0) {
    const recent = workoutHistory.slice(-7);
    const historyLines = recent.map((w) => {
      const parts = [w.discipline];
      parts.push(`${w.durationMinutes || w.duration}min`);
      if (w.avgHeartRate) parts.push(`avg ${w.avgHeartRate}bpm`);
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

  // Training trends
  if (context.trends) {
    const summary = generateTrendSummary(context.trends.health, context.trends.workout);
    sections.push(`TRAINING TRENDS:\n${summary}`);
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

  // Expert coaching knowledge for evidence-based advice
  if (healthData) {
    sections.push(`COACHING KNOWLEDGE — apply these principles when advising the athlete:

HEART RATE ZONES (based on max HR):
- Zone 1 Recovery: <65% max HR — warmup, cooldown, active recovery only
- Zone 2 Aerobic: 65-75% max HR — 80% of all training volume should be here
- Zone 3 Tempo: 76-82% max HR — comfortably hard; max 1 session/week; avoid in BASE phase
- Zone 4 Threshold: 83-89% max HR — only prescribe when readiness > 70
- Zone 5 VO2Max: ≥90% max HR — short intervals only in BUILD/PEAK phase

HRV (RMSSD) DECISION RULES — use athlete's current HRV vs their typical baseline:
- ≥10% above baseline: athlete is well-recovered; approve or upgrade intensity
- Within ±10% of baseline: execute plan as scheduled
- 5-10% below baseline: reduce intensity by one zone; keep duration
- 10-15% below baseline: replace hard session with Zone 1-2; reduce duration 20%
- >15% below baseline AND resting HR elevated: rest day or ≤30 min easy only
- HRV declining 3+ consecutive days: enter light week — 50% volume, Zone 1-2 only

RESTING HR RULES (elevation above athlete's baseline):
- +3-5 bpm: caution; approve moderate only; skip high intensity
- +5-10 bpm: reduce volume 20-30%; skip all intensity work
- +10+ bpm: force rest day

PERIODIZATION PRINCIPLES:
- BASE phase: 80% Zone 2, technique focus, volume build ≤8% per week
- BUILD phase: 70% Zone 2 + threshold and VO2max intervals; brick workouts begin
- PEAK phase: race-pace simulation, longest efforts of cycle, 1 brick/week
- TAPER phase: volume ↓40-60%, maintain intensity, 2 quality sessions/week
- RACE_WEEK: ≤30% normal volume, short openers only, rest is priority

RACE PROXIMITY RULES:
- 14-21 days out: begin taper; target TSB climbing toward race day
- 7 days out: race week protocol — short easy openers, no new hard efforts
- 2-3 days out: rest or very light shake-out only

ADAPTIVE LOAD PRINCIPLES:
- Never increase volume AND intensity in the same week — choose one
- Every 3-4 build weeks: schedule 1 deload week at 30-40% reduced volume
- Injury reported: avoid loading that body part for at least 3 days
- 80/20 rule: 80% of sessions easy (Zone 1-2), 20% hard (Zone 3-5)`);
  }

  if (conversationSummary) {
    sections.push(conversationSummary);
  }

  sections.push(
    "Keep responses under 150 words. Be encouraging but honest. Reference the athlete's specific data when relevant. Push the athlete to stay consistent and follow their training plan. When you reference completion percentages or workout data, only use data from Apple Health — never fabricate statistics."
  );

  return sections.join('\n\n');
}

/**
 * Generate a proactive morning greeting.
 * Tries AI model first, falls back to rule-based.
 */
export async function generateProactiveGreeting(context) {
  const { yesterdayScore, todayWorkout, daysToRace, readinessScore, phase } = context;

  const systemPrompt = `You are an elite endurance coach. Generate a brief, motivating morning message for your athlete.
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
  const { yesterdayScore, todayWorkout, daysToRace, readinessScore, phase } = context;
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
        'push harder',
        'more volume',
        'increase load',
        'step it up',
        'push me harder',
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
    yesterdayScore,
    overallReadiness,
    workoutHistory,
  } = context;
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
      return "I'd like to adjust your schedule but couldn't process the change. Try something like 'I want long sessions on weekends' or 'Move my rest day to Friday'.";
    case 'profile_change':
      return "I'd like to update your profile but I couldn't process the change. Try being specific, like 'Change my race day to September 28'.";
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
    const allWorkouts = yesterdayScore.allWorkouts || [yesterdayScore.completedWorkout];
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

function buildWorkoutInquiryResponse(todayWorkout, score, daysToRace, phaseName) {
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

  if (score >= 75) {
    parts.push('Your readiness is strong — push hard and make this one count!');
  } else if (score < 55) {
    parts.push(
      'Your readiness is low today. Consider taking it easier than prescribed or switching to recovery.'
    );
  }

  if (daysToRace !== null && daysToRace !== undefined) {
    parts.push(`${daysToRace} days to race — you're in ${phaseName} phase.`);
  }

  return parts.join(' ');
}

function buildScheduleInquiryResponse(context) {
  const { athleteProfile, phase } = context;
  const profile = athleteProfile || {};
  const weekPlan = getWeeklyDisciplinePlan(phase || 'BASE', profile);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const schedule = weekPlan.map((discipline, i) => `${dayNames[i]}: ${discipline}`).join(', ');

  const parts = [];
  parts.push(
    `Here's your weekly schedule for the ${(phase || 'BASE').toLowerCase().replace('_', ' ')} phase:`
  );
  parts.push(schedule + '.');

  const strengthDay = weekPlan.indexOf('strength');
  if (strengthDay >= 0) {
    parts.push(`Your strength/weights session is on ${dayNames[strengthDay]}.`);
  } else {
    parts.push(
      'There is no dedicated strength session in your current plan. You may want to add one for injury prevention.'
    );
  }

  const today = new Date().getDay();
  const todayDiscipline = weekPlan[today];
  parts.push(`Today (${dayNames[today]}) is ${todayDiscipline}.`);

  return parts.join(' ');
}

function buildReadinessInquiryResponse(overallReadiness, healthData, yesterdayScore, daysToRace) {
  const parts = [];

  if (overallReadiness) {
    parts.push(`Your overall readiness is ${overallReadiness.overall}/100.`);
    parts.push(
      `Breakdown — Health: ${overallReadiness.health}/100, Training compliance: ${overallReadiness.compliance}/100, Race preparation: ${overallReadiness.racePrep}/100.`
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

  if (overallReadiness?.overall >= 75) {
    parts.push('You are in a good spot — keep the momentum going!');
  } else if (overallReadiness?.overall < 55) {
    parts.push(
      'Your readiness needs attention. Focus on sleep, nutrition, and recovery to bounce back.'
    );
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
      'Your readiness is high, so this is a great time for quality sessions. Focus on one key session per discipline.'
    );
  } else if (score >= 55) {
    parts.push(
      'Your readiness is moderate. Keep most training in Zone 2 and limit high-intensity to 1-2 sessions.'
    );
  } else {
    parts.push(
      'Your readiness is low. Consider reducing volume by 20-30% and prioritizing sleep and nutrition.'
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

  parts.push(`Your readiness is ${score}/100 and you're in the ${phaseName} phase.`);

  if (daysToRace !== null && daysToRace !== undefined) {
    parts.push(`${daysToRace} days to race.`);
  }

  if (yesterdayScore?.completionScore !== null && yesterdayScore?.completionScore !== undefined) {
    parts.push(`Yesterday's completion: ${yesterdayScore.completionScore}%.`);
  }

  if (score >= 75) {
    parts.push("You're in great shape — stay consistent and follow the plan!");
  } else if (score < 55) {
    parts.push(
      "Your body needs some attention. Prioritize recovery today and don't push too hard."
    );
  } else {
    parts.push(
      'Stay the course. Ask me about your workout, recovery, nutrition, or race strategy.'
    );
  }

  return parts.join(' ');
}
