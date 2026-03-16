import {
  classifyMessage,
  generateFallbackResponse,
  buildCoachSystemPrompt,
  isOffTopic,
  getOffTopicResponse,
  buildConversationSummary,
  generateFallbackGreeting,
  extractAthleteInsights,
} from '../services/chatService';

describe('classifyMessage', () => {
  it('classifies workout swap requests', () => {
    expect(classifyMessage('Give me a different workout')).toBe('workout_swap');
    expect(classifyMessage("I can't do this today")).toBe('workout_swap');
    expect(classifyMessage('I want another workout')).toBe('workout_swap');
  });

  it('classifies workout modification requests', () => {
    expect(classifyMessage('Can I make today easier?')).toBe('workout_modification');
    expect(classifyMessage('I want to skip the swim')).toBe('workout_modification');
    expect(classifyMessage('This is too hard for me')).toBe('workout_modification');
  });

  it('classifies workout inquiry questions', () => {
    expect(classifyMessage('What is my workout today?')).toBe('workout_inquiry');
    expect(classifyMessage("Show me today's workout")).toBe('workout_inquiry');
    expect(classifyMessage('What should I do today?')).toBe('workout_inquiry');
    expect(classifyMessage('What should I train today')).toBe('workout_inquiry');
  });

  it('classifies readiness inquiry questions', () => {
    expect(classifyMessage('How am I doing?')).toBe('readiness_inquiry');
    expect(classifyMessage('What is my readiness?')).toBe('readiness_inquiry');
    expect(classifyMessage('Am I ready for the race?')).toBe('readiness_inquiry');
  });

  it('classifies schedule inquiry questions', () => {
    expect(classifyMessage('When is my weights session?')).toBe('schedule_inquiry');
    expect(classifyMessage('When do I swim next?')).toBe('schedule_inquiry');
    expect(classifyMessage('What does this week look like?')).toBe('schedule_inquiry');
    expect(classifyMessage('Which day is my strength session?')).toBe('schedule_inquiry');
  });

  it('classifies recovery questions', () => {
    expect(classifyMessage('My HRV is low, should I rest?')).toBe('recovery');
    expect(classifyMessage('I feel really tired today')).toBe('recovery');
    expect(classifyMessage('Am I overtraining?')).toBe('recovery');
  });

  it('classifies completed workout questions', () => {
    expect(classifyMessage('What workouts did I finish yesterday?')).toBe('completed_workout');
    expect(classifyMessage('Do you know the workouts that I finished yesterday?')).toBe(
      'completed_workout'
    );
    expect(classifyMessage('Show me my recent workouts')).toBe('completed_workout');
    expect(classifyMessage('What did I do last workout?')).toBe('completed_workout');
    expect(classifyMessage('Show my workout history')).toBe('completed_workout');
    expect(classifyMessage('How did I do yesterday?')).toBe('completed_workout');
  });

  it('classifies schedule preference requests', () => {
    expect(classifyMessage('I want to do my long sessions on weekends')).toBe(
      'schedule_preference'
    );
    expect(classifyMessage('Move my rest day to Friday')).toBe('schedule_preference');
    expect(classifyMessage('I prefer Saturday for long rides')).toBe('schedule_preference');
    expect(classifyMessage('Can I do long runs on Sunday?')).toBe('schedule_preference');
    expect(classifyMessage('No training on Monday please')).toBe('schedule_preference');
  });

  it('classifies training plan questions', () => {
    expect(classifyMessage('What phase am I in?')).toBe('training_plan');
    expect(classifyMessage('Can I increase my weekly volume?')).toBe('training_plan');
  });

  it('classifies nutrition questions', () => {
    expect(classifyMessage('What should I eat before a long ride?')).toBe('nutrition');
    expect(classifyMessage('How many carbs do I need?')).toBe('nutrition');
  });

  it('classifies race strategy questions', () => {
    expect(classifyMessage('What is a good pacing strategy?')).toBe('race_strategy');
    expect(classifyMessage('How should I handle the transition?')).toBe('race_strategy');
  });

  it('returns general for unrecognized messages', () => {
    expect(classifyMessage('Hello')).toBe('general');
    expect(classifyMessage('Thanks coach')).toBe('general');
  });
});

describe('isOffTopic', () => {
  it('returns false for training-related messages', () => {
    expect(isOffTopic('How should I pace my run?')).toBe(false);
    expect(isOffTopic('What should I eat before the race?')).toBe(false);
    expect(isOffTopic('My HRV is low today')).toBe(false);
    expect(isOffTopic('Can I modify my workout?')).toBe(false);
  });

  it('returns true for off-topic messages', () => {
    expect(isOffTopic('What is the capital of France?')).toBe(true);
    expect(isOffTopic('Write me a poem about cats')).toBe(true);
    expect(isOffTopic('How do I fix my car engine?')).toBe(true);
  });

  it('returns false for greetings and basic interactions', () => {
    expect(isOffTopic('Hello')).toBe(false);
    expect(isOffTopic('Thanks')).toBe(false);
    expect(isOffTopic('Hi coach')).toBe(false);
  });
});

describe('getOffTopicResponse', () => {
  it('returns a standard decline message', () => {
    const response = getOffTopicResponse();
    expect(response).toContain('endurance coach');
    expect(response).toContain('training');
  });
});

describe('buildConversationSummary', () => {
  it('returns empty string for empty messages', () => {
    expect(buildConversationSummary([])).toBe('');
    expect(buildConversationSummary(null)).toBe('');
  });

  it('includes topic categories from message history', () => {
    const messages = [
      {
        role: 'athlete',
        content: 'How is my recovery looking?',
        timestamp: new Date().toISOString(),
      },
      { role: 'coach', content: 'Your HRV is good.', timestamp: new Date().toISOString() },
      { role: 'athlete', content: 'What should I eat?', timestamp: new Date().toISOString() },
      { role: 'coach', content: 'Focus on carbs.', timestamp: new Date().toISOString() },
    ];
    const summary = buildConversationSummary(messages);
    expect(summary).toContain('recovery');
    expect(summary).toContain('nutrition');
  });

  it('includes recent messages verbatim', () => {
    const messages = [
      {
        role: 'athlete',
        content: 'My specific question here',
        timestamp: new Date().toISOString(),
      },
      { role: 'coach', content: 'My specific answer here', timestamp: new Date().toISOString() },
    ];
    const summary = buildConversationSummary(messages);
    expect(summary).toContain('My specific question here');
    expect(summary).toContain('My specific answer here');
  });
});

describe('generateFallbackGreeting', () => {
  it('includes yesterday score when available', () => {
    const context = {
      yesterdayScore: {
        completionScore: 85,
        feedback: { label: 'Solid session', message: 'Good work.' },
      },
      todayWorkout: { title: 'Tempo Run', discipline: 'run', duration: 60 },
      daysToRace: 45,
      readinessScore: 72,
      phase: 'BUILD',
    };
    const greeting = generateFallbackGreeting(context);
    expect(greeting).toContain('85%');
  });

  it('includes today workout info', () => {
    const context = {
      yesterdayScore: null,
      todayWorkout: { title: 'Zone 2 Ride', discipline: 'bike', duration: 70 },
      daysToRace: 45,
      readinessScore: 72,
      phase: 'BUILD',
    };
    const greeting = generateFallbackGreeting(context);
    expect(greeting).toContain('Zone 2 Ride');
  });

  it('includes race countdown', () => {
    const context = {
      yesterdayScore: null,
      todayWorkout: null,
      daysToRace: 30,
      readinessScore: 72,
      phase: 'PEAK',
    };
    const greeting = generateFallbackGreeting(context);
    expect(greeting).toContain('30 days');
  });

  it('returns default when all context is empty', () => {
    const context = {};
    const greeting = generateFallbackGreeting(context);
    expect(greeting.length).toBeGreaterThan(0);
  });
});

describe('generateFallbackResponse', () => {
  const context = {
    readinessScore: 72,
    phase: 'BUILD',
    daysToRace: 45,
    healthData: { hrv: 55, restingHR: 54, sleepHours: 7.2 },
    athleteProfile: { weakestDiscipline: 'Swim', raceType: 'triathlon' },
    todayWorkout: {
      title: 'Tempo Run',
      discipline: 'run',
      duration: 60,
      intensity: 'moderate',
      summary: 'Build running speed with tempo intervals.',
      sections: [
        {
          name: 'Warmup',
          notes: 'Easy jog.',
          sets: [{ description: '10 min easy jog', zone: 1 }],
        },
        {
          name: 'Main Set',
          notes: 'Tempo effort.',
          sets: [{ description: '4x5 min at tempo, 2 min jog', zone: 3 }],
        },
      ],
    },
    yesterdayScore: {
      completionScore: 85,
      feedback: { label: 'Solid session', message: 'Good execution.' },
    },
    overallReadiness: { overall: 72, health: 75, compliance: 70, racePrep: 68 },
    workoutHistory: [
      { discipline: 'run', title: 'Easy Run', completedSets: 4, totalSets: 4 },
      { discipline: 'bike', title: 'Zone 2 Ride', completedSets: 3, totalSets: 3 },
    ],
  };

  it('returns workout details for workout_inquiry', () => {
    const response = generateFallbackResponse('workout_inquiry', 'what is my workout', context);
    expect(response).toContain('Tempo Run');
    expect(response).toContain('60-minute');
    expect(response).toContain('run');
    expect(response).toContain('moderate');
  });

  it('returns workout sections for workout_inquiry', () => {
    const response = generateFallbackResponse('workout_inquiry', 'what is my workout', context);
    expect(response).toContain('Main Set');
    expect(response).toContain('4x5 min');
  });

  it('handles missing workout for workout_inquiry', () => {
    const noWorkoutCtx = { ...context, todayWorkout: null };
    const response = generateFallbackResponse(
      'workout_inquiry',
      'what is my workout',
      noWorkoutCtx
    );
    expect(response).toContain('Dashboard');
  });

  it('returns readiness breakdown for readiness_inquiry', () => {
    const response = generateFallbackResponse('readiness_inquiry', 'how am i', context);
    expect(response).toContain('72/100');
    expect(response).toContain('Health: 75');
    expect(response).toContain('compliance: 70');
  });

  it('includes health metrics in readiness_inquiry', () => {
    const response = generateFallbackResponse('readiness_inquiry', 'how am i', context);
    expect(response).toContain('55ms');
    expect(response).toContain('54bpm');
  });

  it('returns weekly schedule for schedule_inquiry', () => {
    const response = generateFallbackResponse(
      'schedule_inquiry',
      'when is my weights session',
      context
    );
    expect(response).toContain('weekly schedule');
    expect(response).toContain('Monday');
    expect(response).toContain('Sunday');
  });

  it('returns a non-empty string for each category', () => {
    const categories = [
      'completed_workout',
      'workout_inquiry',
      'schedule_inquiry',
      'readiness_inquiry',
      'training_plan',
      'workout_modification',
      'workout_swap',
      'recovery',
      'nutrition',
      'race_strategy',
      'schedule_preference',
      'general',
    ];
    categories.forEach((cat) => {
      const response = generateFallbackResponse(cat, 'test', context);
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(20);
    });
  });

  it('references readiness score in recovery responses', () => {
    const response = generateFallbackResponse('recovery', 'How am I recovering?', context);
    expect(response).toContain('72');
  });

  it('references workout details in modification responses', () => {
    const response = generateFallbackResponse('workout_modification', 'too hard', context);
    expect(response).toContain('Tempo Run');
  });

  it('references today workout in general responses', () => {
    const response = generateFallbackResponse('general', 'hello', context);
    expect(response).toContain('Tempo Run');
    expect(response).toContain('72/100');
  });

  it('lists completed workouts when asked about history', () => {
    const ctxWithHistory = {
      ...context,
      yesterdayScore: {
        completionScore: 82,
        feedback: { label: 'Solid session', message: 'Good effort!' },
        completedWorkout: { discipline: 'run', duration: 48, title: 'Easy Run' },
      },
      workoutHistory: [
        { discipline: 'swim', durationMinutes: 45, startDate: '2026-03-09T06:00:00Z' },
        { discipline: 'run', durationMinutes: 48, startDate: '2026-03-10T07:00:00Z' },
      ],
    };
    const response = generateFallbackResponse(
      'completed_workout',
      'what did I do yesterday',
      ctxWithHistory
    );
    expect(response).toContain('run');
    expect(response).toContain('82%');
  });

  it('handles no completed workout data gracefully', () => {
    const emptyCtx = { ...context, yesterdayScore: null, workoutHistory: [] };
    const response = generateFallbackResponse('completed_workout', 'what did I do', emptyCtx);
    expect(response).toContain("don't have");
  });

  it('gives race-week specific nutrition advice', () => {
    const raceWeekCtx = { ...context, phase: 'RACE_WEEK', daysToRace: 3 };
    const response = generateFallbackResponse('nutrition', 'what to eat', raceWeekCtx);
    expect(response).toContain('carb');
  });
});

describe('buildCoachSystemPrompt', () => {
  it('includes athlete profile data', () => {
    const context = {
      athleteProfile: { weeklyHours: '8-10', weakestDiscipline: 'Swim' },
      healthData: { hrv: 60 },
      readinessScore: 80,
      phase: 'BUILD',
      daysToRace: 60,
      todayWorkout: null,
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('8-10');
    expect(prompt).toContain('Swim');
    expect(prompt).toContain('BUILD');
    expect(prompt).toContain('80');
  });

  it('handles null context gracefully', () => {
    const prompt = buildCoachSystemPrompt({});
    expect(prompt).toContain('N/A');
    expect(prompt).toContain('endurance triathlon');
  });

  it('includes off-topic guard instruction', () => {
    const prompt = buildCoachSystemPrompt({});
    expect(prompt).toContain('ONLY an endurance triathlon coach');
  });

  it('includes race type in athlete profile section', () => {
    const context = {
      athleteProfile: { raceType: 'running', distance: 'Marathon' },
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('running');
    expect(prompt).toContain('Marathon');
    expect(prompt).toContain('ONLY an running coach');
  });

  it('includes workout history when provided', () => {
    const context = {
      athleteProfile: {},
      workoutHistory: [
        { discipline: 'run', durationMinutes: 45, startDate: '2026-03-14T08:00:00Z' },
      ],
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('RECENT WORKOUT HISTORY');
    expect(prompt).toContain('run');
    expect(prompt).toContain('45min');
  });

  it('includes yesterday score when provided', () => {
    const context = {
      athleteProfile: {},
      yesterdayScore: { completionScore: 80, feedback: { label: 'Solid session' } },
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('YESTERDAY');
    expect(prompt).toContain('80');
  });

  it('includes overall readiness breakdown when provided', () => {
    const context = {
      athleteProfile: {},
      overallReadiness: { overall: 75, health: 80, compliance: 70, racePrep: 72 },
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('OVERALL READINESS BREAKDOWN');
    expect(prompt).toContain('75');
  });

  it('includes athlete insights when present in profile', () => {
    const context = {
      athleteProfile: {
        athleteInsights: {
          recentMood: 'fatigued',
          painPoints: ['knee'],
          preferredIntensity: 'easier',
          lastFatigueReport: new Date().toISOString(),
          conversationThemes: ['recovery', 'injury'],
        },
      },
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('ATHLETE INSIGHTS');
    expect(prompt).toContain('fatigued');
    expect(prompt).toContain('knee');
    expect(prompt).toContain('easier');
  });

  it('instructs coach not to fabricate statistics', () => {
    const prompt = buildCoachSystemPrompt({});
    expect(prompt).toContain('never fabricate');
  });
});

describe('extractAthleteInsights', () => {
  const now = new Date();
  const makeMsg = (content, daysAgo = 0) => ({
    role: 'athlete',
    content,
    timestamp: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  });

  it('returns null for empty messages', () => {
    expect(extractAthleteInsights([])).toBeNull();
    expect(extractAthleteInsights(null)).toBeNull();
  });

  it('detects fatigue mood', () => {
    const messages = [makeMsg('I am exhausted after this week')];
    const insights = extractAthleteInsights(messages);
    expect(insights.recentMood).toBe('fatigued');
    expect(insights.lastFatigueReport).toBeDefined();
  });

  it('detects pain points with body parts', () => {
    const messages = [makeMsg('My knee hurts after running')];
    const insights = extractAthleteInsights(messages);
    expect(insights.recentMood).toBe('injured');
    expect(insights.painPoints).toContain('knee');
  });

  it('detects multiple pain points', () => {
    const messages = [makeMsg('My knee is sore'), makeMsg('My shoulder aches too')];
    const insights = extractAthleteInsights(messages);
    expect(insights.painPoints).toContain('knee');
    expect(insights.painPoints).toContain('shoulder');
  });

  it('detects preferred intensity easier', () => {
    const messages = [makeMsg('The workouts are too hard for me')];
    const insights = extractAthleteInsights(messages);
    expect(insights.preferredIntensity).toBe('easier');
  });

  it('detects preferred intensity harder', () => {
    const messages = [makeMsg('These workouts are too easy, push me more')];
    const insights = extractAthleteInsights(messages);
    expect(insights.preferredIntensity).toBe('harder');
  });

  it('detects motivated mood', () => {
    const messages = [makeMsg('Feeling great today, ready to go!')];
    const insights = extractAthleteInsights(messages);
    expect(insights.recentMood).toBe('motivated');
  });

  it('ignores messages older than 7 days', () => {
    const messages = [makeMsg('I am exhausted', 10)];
    const insights = extractAthleteInsights(messages);
    expect(insights).toBeNull();
  });

  it('extracts conversation themes', () => {
    const messages = [
      makeMsg('What should I eat before my long ride?'),
      makeMsg('How is my readiness looking?'),
    ];
    const insights = extractAthleteInsights(messages);
    expect(insights.conversationThemes.length).toBeGreaterThan(0);
  });

  it('sets loadAdjustment to reduce when athlete reports fatigue', () => {
    const messages = [makeMsg("I'm really tired this week, take it easy")];
    const insights = extractAthleteInsights(messages);
    expect(insights.loadAdjustment).toBe('reduce');
    expect(insights.loadAdjustmentExpiry).toBeDefined();
    expect(new Date(insights.loadAdjustmentExpiry) > new Date()).toBe(true);
  });

  it('sets loadAdjustment to reduce for LOAD_REDUCE_KEYWORDS', () => {
    const messages = [makeMsg('Give me a lighter week please')];
    const insights = extractAthleteInsights(messages);
    expect(insights.loadAdjustment).toBe('reduce');
  });

  it('sets requestedRestDay to tomorrow when athlete asks for day off', () => {
    const messages = [makeMsg('Can I take tomorrow off?')];
    const insights = extractAthleteInsights(messages);
    expect(insights.requestedRestDay).toBeDefined();
    const restDate = new Date(insights.requestedRestDay);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(restDate.toDateString()).toBe(tomorrow.toDateString());
  });

  it('sets loadAdjustment to increase for push-harder requests', () => {
    const messages = [makeMsg('Push me harder this week')];
    const insights = extractAthleteInsights(messages);
    expect(insights.loadAdjustment).toBe('increase');
  });

  it('sets requestedDisciplineFocus when athlete wants more of a discipline', () => {
    const messages = [makeMsg('I want to focus on swim more')];
    const insights = extractAthleteInsights(messages);
    expect(insights.requestedDisciplineFocus).toBe('swim');
  });

  it('carries forward active loadAdjustment from existingInsights when no new signal', () => {
    const futureExpiry = new Date();
    futureExpiry.setDate(futureExpiry.getDate() + 2);
    const existing = {
      loadAdjustment: 'reduce',
      loadAdjustmentExpiry: futureExpiry.toISOString(),
      loadAdjustmentDays: 2,
    };
    const messages = [makeMsg('What is my workout today?')];
    const insights = extractAthleteInsights(messages, existing);
    expect(insights.loadAdjustment).toBe('reduce');
    expect(insights.loadAdjustmentExpiry).toBe(futureExpiry.toISOString());
  });

  it('does not carry forward expired loadAdjustment from existingInsights', () => {
    const pastExpiry = new Date();
    pastExpiry.setDate(pastExpiry.getDate() - 1);
    const existing = {
      loadAdjustment: 'reduce',
      loadAdjustmentExpiry: pastExpiry.toISOString(),
      loadAdjustmentDays: 3,
    };
    const messages = [makeMsg('What is my workout today?')];
    const insights = extractAthleteInsights(messages, existing);
    expect(insights.loadAdjustment).toBeNull();
  });

  it('returns null for loadAdjustment when no relevant keywords', () => {
    const messages = [makeMsg('What should I eat before my run?')];
    const insights = extractAthleteInsights(messages);
    expect(insights.loadAdjustment).toBeNull();
    expect(insights.requestedRestDay).toBeNull();
  });
});

describe('classifyMessage - load_adjustment', () => {
  it('classifies load reduction requests', () => {
    expect(classifyMessage("I'm exhausted, take it easy this week")).toBe('load_adjustment');
    expect(classifyMessage('Give me a lighter week')).toBe('load_adjustment');
    expect(classifyMessage('Can we ease up on training?')).toBe('load_adjustment');
  });

  it('classifies rest day requests as load_adjustment', () => {
    expect(classifyMessage('Take tomorrow off')).toBe('load_adjustment');
    expect(classifyMessage('I need a rest day tomorrow')).toBe('load_adjustment');
    expect(classifyMessage('Can I have tomorrow off?')).toBe('load_adjustment');
  });

  it('classifies push harder requests as load_adjustment', () => {
    expect(classifyMessage('Push me harder this week')).toBe('load_adjustment');
  });

  it('classifies discipline focus requests as load_adjustment', () => {
    expect(classifyMessage('I want to focus on swim more')).toBe('load_adjustment');
    expect(classifyMessage('More running this week')).toBe('load_adjustment');
  });
});

describe('buildCoachSystemPrompt - coach name fix', () => {
  it('uses coach name Alex, not Coach', () => {
    const context = { athleteProfile: { raceType: 'triathlon' } };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('named Alex');
    expect(prompt).not.toMatch(/named Coach\b/);
  });

  it('addresses athlete by name when name is in profile', () => {
    const context = { athleteProfile: { name: 'Sarah', raceType: 'triathlon' } };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('Sarah');
    expect(prompt).toContain("Never call the athlete 'Coach'");
  });

  it('falls back to coaching the athlete when no name in profile', () => {
    const context = { athleteProfile: { raceType: 'triathlon' } };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('the athlete');
  });

  it('includes active load adjustment in ATHLETE INSIGHTS section', () => {
    const futureExpiry = new Date();
    futureExpiry.setDate(futureExpiry.getDate() + 2);
    const context = {
      athleteProfile: {
        name: 'Tom',
        raceType: 'triathlon',
        athleteInsights: {
          recentMood: 'fatigued',
          loadAdjustment: 'reduce',
          loadAdjustmentExpiry: futureExpiry.toISOString(),
          loadAdjustmentDays: 2,
          painPoints: [],
          conversationThemes: [],
        },
      },
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('load adjustment');
    expect(prompt).toContain('reduce');
  });

  it('includes COACHING KNOWLEDGE section when healthData is present', () => {
    const context = {
      athleteProfile: { raceType: 'triathlon' },
      healthData: { hrv: 60, restingHR: 50, sleepHours: 7.5 },
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('COACHING KNOWLEDGE');
    expect(prompt).toContain('Zone 2');
    expect(prompt).toContain('HRV');
    expect(prompt).toContain('80/20');
  });

  it('omits COACHING KNOWLEDGE section when healthData is absent', () => {
    const context = { athleteProfile: { raceType: 'triathlon' } };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).not.toContain('COACHING KNOWLEDGE');
  });
});
