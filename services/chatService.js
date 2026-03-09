import { runInference } from './localModel';
import { generateReplacementWorkout } from './localModel';
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
        'change',
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
 */
export function generateFallbackResponse(category, _userMessage, context) {
  const { readinessScore, phase, daysToRace, healthData, todayWorkout } = context;
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
    case 'training_plan':
      return buildTrainingPlanResponse(phaseName, daysToRace, score);
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
      return buildGeneralResponse(phaseName, score, daysToRace);
  }
}

function buildTrainingPlanResponse(phaseName, daysToRace, score) {
  let response = `You're currently in the ${phaseName} phase`;
  if (daysToRace !== null && daysToRace !== undefined) {
    response += ` with ${daysToRace} days until race day`;
  }
  response += '. ';

  if (score >= 75) {
    response +=
      'Your readiness is high, so this is a great time for quality sessions. Focus on discipline-specific work and one key session per discipline this week.';
  } else if (score >= 55) {
    response +=
      'Your readiness is moderate. Keep the majority of your training in Zone 2 and limit high-intensity efforts to 1-2 sessions this week.';
  } else {
    response +=
      'Your readiness is low right now. Consider reducing volume by 20-30% this week and prioritizing sleep and nutrition before pushing harder.';
  }
  return response;
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

function buildGeneralResponse(phaseName, score, daysToRace) {
  let response = `Hey! I'm your AI endurance coach. You're in the ${phaseName} phase`;
  if (daysToRace !== null && daysToRace !== undefined) {
    response += ` with ${daysToRace} days to race`;
  }
  response += `. Your readiness today is ${score}/100. `;
  response +=
    "Ask me about your training plan, workout modifications, recovery, nutrition, or race strategy. I can also swap your workout if you need something different today. Let's get after it!";
  return response;
}
