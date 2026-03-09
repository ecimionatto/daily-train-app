import {
  classifyMessage,
  generateFallbackResponse,
  buildCoachSystemPrompt,
  isOffTopic,
  getOffTopicResponse,
  buildConversationSummary,
  generateFallbackGreeting,
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

  it('classifies recovery questions', () => {
    expect(classifyMessage('My HRV is low, should I rest?')).toBe('recovery');
    expect(classifyMessage('I feel really tired today')).toBe('recovery');
    expect(classifyMessage('Am I overtraining?')).toBe('recovery');
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
    todayWorkout: {
      title: 'Tempo Run',
      discipline: 'run',
      duration: 60,
      intensity: 'moderate',
    },
  };

  it('returns a non-empty string for each category', () => {
    const categories = [
      'training_plan',
      'workout_modification',
      'workout_swap',
      'recovery',
      'nutrition',
      'race_strategy',
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

  it('handles missing workout gracefully', () => {
    const noWorkoutCtx = { ...context, todayWorkout: null };
    const response = generateFallbackResponse('workout_modification', 'change it', noWorkoutCtx);
    expect(response).toContain('Dashboard');
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
      workoutHistory: [{ discipline: 'run', title: 'Easy Run', completedSets: 5, totalSets: 6 }],
    };
    const prompt = buildCoachSystemPrompt(context);
    expect(prompt).toContain('RECENT WORKOUT HISTORY');
    expect(prompt).toContain('Easy Run');
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
});
