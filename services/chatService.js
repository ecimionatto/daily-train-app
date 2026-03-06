import { runInference } from './localModel';

/**
 * Process a user message and return a coach response.
 * Tries local Qwen 3.5 model first, falls back to rule-based engine.
 */
export async function getCoachResponse(userMessage, context, conversationHistory) {
  const systemPrompt = buildCoachSystemPrompt(context);

  const recentHistory = conversationHistory.slice(-6);
  const historyBlock = recentHistory
    .map((m) => `${m.role === 'athlete' ? 'Athlete' : 'Coach'}: ${m.content}`)
    .join('\n');

  const userPrompt = historyBlock
    ? `Previous conversation:\n${historyBlock}\n\nAthlete: ${userMessage}`
    : `Athlete: ${userMessage}`;

  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) {
    return modelResponse.trim();
  }

  const category = classifyMessage(userMessage);
  return generateFallbackResponse(category, userMessage, context);
}

/**
 * Build the system prompt injected with full athlete context.
 */
export function buildCoachSystemPrompt(context) {
  const { athleteProfile, healthData, readinessScore, phase, daysToRace, todayWorkout } = context;
  return `You are an elite Ironman triathlon coach named Coach. You provide concise, personalized coaching advice.

ATHLETE PROFILE:
- Distance: ${athleteProfile?.distance || 'Full Ironman'}
- Level: ${athleteProfile?.level || 'Intermediate'}
- Weekly hours: ${athleteProfile?.weeklyHours || 'N/A'}
- Strongest: ${athleteProfile?.strongestDiscipline || 'N/A'}
- Weakest: ${athleteProfile?.weakestDiscipline || 'N/A'}
- Injuries: ${athleteProfile?.injuries || 'None'}
- Goal time: ${athleteProfile?.goalTime || 'N/A'}

CURRENT STATUS:
- Training phase: ${phase || 'BASE'}
- Days to race: ${daysToRace ?? 'N/A'}
- Readiness score: ${readinessScore ?? 'N/A'}/100
- Resting HR: ${healthData?.restingHR || 'N/A'} bpm
- HRV: ${healthData?.hrv || 'N/A'} ms
- Sleep: ${healthData?.sleepHours?.toFixed(1) || 'N/A'} hours

TODAY'S WORKOUT: ${todayWorkout ? `${todayWorkout.title} (${todayWorkout.discipline}, ${todayWorkout.duration}min, ${todayWorkout.intensity})` : 'Not generated yet'}

Keep responses under 150 words. Be encouraging but honest. Reference the athlete's specific data when relevant.`;
}

/**
 * Classify user message into a coaching category for fallback.
 */
export function classifyMessage(message) {
  const lower = message.toLowerCase();
  const categories = [
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
      'Given your low readiness score, I recommend swapping this for an easy recovery session. A 30-minute easy spin or walk with stretching would be ideal.';
  } else if (score < 75) {
    response +=
      'Your readiness is moderate. You can do this workout but consider reducing the intensity of any Zone 3-4 intervals to Zone 2-3. Listen to your body.';
  } else {
    response +=
      'Your readiness is solid. Execute the workout as planned. If you feel great, you can push the upper end of the prescribed zones.';
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
  let response = 'Nutrition is a key pillar of Ironman training. ';
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
  let response = `Welcome! I'm your AI coach. You're in the ${phaseName} phase`;
  if (daysToRace !== null && daysToRace !== undefined) {
    response += ` with ${daysToRace} days to race`;
  }
  response += `. Your readiness today is ${score}/100. `;
  response +=
    'Feel free to ask me about your training plan, workout modifications, recovery, nutrition, or race strategy. I have access to your health data and training phase to give personalized advice.';
  return response;
}
