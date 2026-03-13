import { runInference } from './localModel';
import { generateReplacementWorkout, getWeeklyDisciplinePlan } from './localModel';
import { isRunningOnly } from './raceConfig';

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

  sections.push(`You are an elite ${coachType} coach named Coach. You provide concise, personalized coaching advice.
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
    sections.push(`YESTERDAY'S PERFORMANCE:
- Completion: ${yesterdayScore.completionScore ?? 'N/A'}%
- Feedback: ${yesterdayScore.feedback?.label || 'N/A'}`);
  }

  const workoutInfo = todayWorkout
    ? `${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration}min, ${todayWorkout.intensity})`
    : 'Not generated yet';
  sections.push(`TODAY'S WORKOUT: ${workoutInfo}`);

  if (workoutHistory && workoutHistory.length > 0) {
    const recent = workoutHistory.slice(-7);
    const historyLines = recent.map((w) => {
      if (w.startDate) {
        return `${w.discipline}: ${w.durationMinutes || w.duration}min (${new Date(w.startDate).toLocaleDateString()})`;
      }
      return `${w.discipline}: ${w.title} (${w.completedSets}/${w.totalSets} sets)`;
    });
    sections.push(
      `RECENT WORKOUT HISTORY (last ${recent.length} sessions):\n${historyLines.join('\n')}`
    );
  }

  if (conversationSummary) {
    sections.push(conversationSummary);
  }

  sections.push(
    "Keep responses under 150 words. Be encouraging but honest. Reference the athlete's specific data when relevant. Push the athlete to stay consistent and follow their training plan."
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
Include: yesterday's performance feedback, today's workout preview, race countdown encouragement.
Keep it under 100 words. Be warm, specific, and push them to follow the plan.`;

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
