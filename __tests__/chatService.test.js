import {
  classifyMessage,
  generateFallbackResponse,
  buildCoachSystemPrompt,
} from '../services/chatService';

describe('classifyMessage', () => {
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
    expect(prompt).toContain('Full Ironman');
    expect(prompt).toContain('N/A');
  });
});
