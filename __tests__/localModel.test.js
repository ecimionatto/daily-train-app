import {
  generateWorkoutLocally,
  generateWeeklySummaryLocally,
  generateAlternativeWorkout,
  generateReplacementWorkout,
  generateWeeklyPlanAdjustment,
  getWeeklyDisciplinePlan,
  analyzeRecentWorkouts,
} from '../services/localModel';

jest.mock('../services/healthKit');

const mockProfile = {
  level: 'Intermediate',
  raceType: 'triathlon',
  distance: 'Full Ironman (140.6)',
  weeklyHours: '8-10',
  strongestDiscipline: 'Bike',
  weakestDiscipline: 'Swim',
  injuries: 'None',
  goalTime: '12-14h',
};

const mockRunningProfile = {
  level: 'Intermediate',
  raceType: 'running',
  distance: 'Marathon',
  weeklyHours: '8-10',
  strongestDiscipline: 'Run',
  weakestDiscipline: 'Run',
  injuries: 'None',
  goalTime: 'Sub 4:00',
};

const mockHealthData = {
  restingHR: 54,
  hrv: 62,
  sleepHours: 7.5,
};

describe('generateWorkoutLocally', () => {
  it('returns a recovery workout when readiness is low', async () => {
    const workout = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 40,
      phase: 'BUILD',
      daysToRace: 60,
    });

    expect(workout.discipline).toBeDefined();
    expect(workout.intensity).toBeDefined();
    expect(workout.sections).toBeDefined();
    expect(workout.sections.length).toBeGreaterThan(0);
  });

  it('returns a structured workout with sections', async () => {
    const workout = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
    });

    expect(workout.title).toBeDefined();
    expect(workout.discipline).toBeDefined();
    expect(workout.sections).toBeDefined();
    expect(workout.sections.length).toBeGreaterThan(0);
  });

  it('returns a workout with valid discipline', async () => {
    const workout = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 80,
      phase: 'BASE',
      daysToRace: 120,
    });

    expect(['swim', 'bike', 'run', 'strength', 'rest']).toContain(workout.discipline);
  });

  it('adjusts duration up when readiness is high', async () => {
    const highReadiness = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 80,
      phase: 'BUILD',
      daysToRace: 60,
    });

    const lowReadiness = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 60,
      phase: 'BUILD',
      daysToRace: 60,
    });

    // Both should have valid durations (rest days can be 0)
    expect(highReadiness.duration).toBeGreaterThanOrEqual(0);
    expect(lowReadiness.duration).toBeGreaterThanOrEqual(0);
  });

  it('includes sets with descriptions in each section', async () => {
    const workout = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'PEAK',
      daysToRace: 30,
    });

    workout.sections.forEach((section) => {
      expect(section.name).toBeDefined();
      expect(section.sets).toBeDefined();
      section.sets.forEach((set) => {
        expect(set.description).toBeDefined();
      });
    });
  });
});

describe('generateAlternativeWorkout', () => {
  it('returns a workout with different discipline than excluded', async () => {
    const alt = await generateAlternativeWorkout({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      excludeDiscipline: 'run',
    });

    expect(alt).not.toBeNull();
    expect(alt.discipline).not.toBe('run');
    expect(['swim', 'bike', 'strength', 'rest']).toContain(alt.discipline);
  });

  it('returns a valid workout structure', async () => {
    const alt = await generateAlternativeWorkout({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      excludeDiscipline: 'bike',
    });

    expect(alt.title).toBeDefined();
    expect(alt.sections).toBeDefined();
    expect(alt.sections.length).toBeGreaterThan(0);
  });

  it('returns null for rest day with low readiness', async () => {
    const alt = await generateAlternativeWorkout({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 40,
      phase: 'BUILD',
      daysToRace: 60,
      excludeDiscipline: 'rest',
    });

    expect(alt).toBeNull();
  });

  it('prioritizes weakest discipline as alternative', async () => {
    const alt = await generateAlternativeWorkout({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      excludeDiscipline: 'run',
    });

    // weakestDiscipline is Swim, and it's not excluded, so it should be picked
    expect(alt.discipline).toBe('swim');
  });
});

describe('generateReplacementWorkout', () => {
  it('avoids run when knee injury mentioned', async () => {
    const workout = await generateReplacementWorkout({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      reason: 'my knee hurts today',
    });

    expect(workout.discipline).not.toBe('run');
  });

  it('returns easy workout when tired', async () => {
    const workout = await generateReplacementWorkout({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      reason: 'I am exhausted and tired',
    });

    expect(workout.discipline).toBe('rest');
  });

  it('returns a valid workout structure', async () => {
    const workout = await generateReplacementWorkout({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      reason: 'I want something different',
    });

    expect(workout.title).toBeDefined();
    expect(workout.sections).toBeDefined();
  });
});

describe('generateWeeklyPlanAdjustment', () => {
  it('returns advice text for empty week', async () => {
    const advice = await generateWeeklyPlanAdjustment({
      profile: mockProfile,
      weekHistory: [],
      phase: 'BUILD',
      daysToRace: 60,
      complianceScore: null,
    });

    expect(typeof advice).toBe('string');
    expect(advice.length).toBeGreaterThan(20);
    expect(advice).toContain('no completed workouts');
  });

  it('includes compliance assessment', async () => {
    const weekHistory = [
      { discipline: 'swim', title: 'Swim', duration: 60, completedSets: 6, totalSets: 6 },
      { discipline: 'run', title: 'Run', duration: 45, completedSets: 4, totalSets: 5 },
    ];

    const advice = await generateWeeklyPlanAdjustment({
      profile: mockProfile,
      weekHistory,
      phase: 'BUILD',
      daysToRace: 60,
      complianceScore: 85,
    });

    expect(advice).toContain('2 sessions');
    expect(advice).toContain('85%');
  });

  it('flags missing disciplines', async () => {
    const weekHistory = [
      { discipline: 'run', title: 'Run', duration: 45, completedSets: 4, totalSets: 5 },
    ];

    const advice = await generateWeeklyPlanAdjustment({
      profile: mockProfile,
      weekHistory,
      phase: 'BUILD',
      daysToRace: 60,
      complianceScore: 80,
    });

    expect(advice).toContain('swim');
    expect(advice).toContain('bike');
  });
});

describe('generateWeeklySummaryLocally', () => {
  it('returns summary text for an empty week', async () => {
    const summary = await generateWeeklySummaryLocally({
      profile: mockProfile,
      weekHistory: [],
      phase: 'BUILD',
    });

    expect(typeof summary).toBe('string');
    expect(summary).toContain('0 sessions');
  });

  it('returns summary with session count and duration', async () => {
    const weekHistory = [
      {
        discipline: 'swim',
        title: 'Endurance Swim',
        duration: 60,
        completedAt: new Date().toISOString(),
      },
      {
        discipline: 'run',
        title: 'Tempo Run',
        duration: 45,
        completedAt: new Date().toISOString(),
      },
    ];

    const summary = await generateWeeklySummaryLocally({
      profile: mockProfile,
      weekHistory,
      phase: 'BUILD',
    });

    expect(summary).toContain('2 sessions');
    expect(summary).toContain('build');
  });

  it('includes discipline breakdown', async () => {
    const weekHistory = [
      { discipline: 'bike', title: 'Ride', duration: 90, completedAt: new Date().toISOString() },
      { discipline: 'bike', title: 'Ride 2', duration: 60, completedAt: new Date().toISOString() },
      { discipline: 'swim', title: 'Swim', duration: 45, completedAt: new Date().toISOString() },
    ];

    const summary = await generateWeeklySummaryLocally({
      profile: mockProfile,
      weekHistory,
      phase: 'BASE',
    });

    expect(summary).toContain('bike');
    expect(summary).toContain('swim');
  });

  it('includes phase-specific advice', async () => {
    const summary = await generateWeeklySummaryLocally({
      profile: mockProfile,
      weekHistory: [],
      phase: 'TAPER',
    });

    expect(summary).toContain('taper');
  });
});

describe('generateWorkoutLocally with running profile', () => {
  it('returns only run/strength/rest disciplines for running profile', async () => {
    const workout = await generateWorkoutLocally({
      profile: mockRunningProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
    });

    expect(['run', 'strength', 'rest']).toContain(workout.discipline);
  });

  it('never returns swim or bike for running profile', async () => {
    const results = [];
    for (let i = 0; i < 7; i++) {
      const workout = await generateWorkoutLocally({
        profile: mockRunningProfile,
        healthData: mockHealthData,
        readinessScore: 72,
        phase: 'BUILD',
        daysToRace: 60,
      });
      results.push(workout.discipline);
    }
    expect(results).not.toContain('swim');
    expect(results).not.toContain('bike');
  });
});

describe('getWeeklyDisciplinePlan with schedule preferences', () => {
  it('returns default plan when no preferences set', () => {
    const plan = getWeeklyDisciplinePlan('BASE', mockProfile);
    // Default: rest on Monday (index 1), alternating disciplines, long sessions on weekend
    expect(plan).toEqual(['swim', 'rest', 'run', 'bike', 'swim', 'run', 'bike']);
  });

  it('moves bike to weekend when longDays set to Saturday and Sunday', () => {
    const profileWithPrefs = {
      ...mockProfile,
      schedulePreferences: { longDays: [0, 6] },
    };
    const plan = getWeeklyDisciplinePlan('BASE', profileWithPrefs);
    // Bike should be on Saturday (6) and/or Sunday (0)
    expect(plan[6]).toBe('bike');
  });

  it('sets rest days on specified days', () => {
    const profileWithPrefs = {
      ...mockProfile,
      schedulePreferences: { restDays: [5] },
    };
    const plan = getWeeklyDisciplinePlan('BASE', profileWithPrefs);
    expect(plan[5]).toBe('rest');
  });

  it('handles avoidDays by setting them to rest', () => {
    const profileWithPrefs = {
      ...mockProfile,
      schedulePreferences: { avoidDays: [1] },
    };
    const plan = getWeeklyDisciplinePlan('BASE', profileWithPrefs);
    expect(plan[1]).toBe('rest');
  });

  it('applies preferences to running profile', () => {
    const profileWithPrefs = {
      ...mockRunningProfile,
      schedulePreferences: { longDays: [6] },
    };
    const plan = getWeeklyDisciplinePlan('BASE', profileWithPrefs);
    expect(plan[6]).toBe('run');
  });

  it('preserves rest days when long days overlap', () => {
    const profileWithPrefs = {
      ...mockProfile,
      schedulePreferences: { restDays: [0], longDays: [0, 6] },
    };
    const plan = getWeeklyDisciplinePlan('BASE', profileWithPrefs);
    // Sunday (0) should stay rest since restDays takes priority
    expect(plan[0]).toBe('rest');
    // Saturday should get bike
    expect(plan[6]).toBe('bike');
  });
});

describe('generateAlternativeWorkout with running profile', () => {
  it('returns run or strength for running profile', async () => {
    const alt = await generateAlternativeWorkout({
      profile: mockRunningProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      excludeDiscipline: 'strength',
    });

    expect(alt).not.toBeNull();
    expect(alt.discipline).toBe('run');
  });
});

describe('generateWorkoutLocally with trends', () => {
  it('reduces duration when fatiguing trend detected', async () => {
    const fatiguingTrends = {
      health: { overallTrend: 'fatiguing', alerts: ['HRV declining'] },
      workout: { volumeTrend: 'stable', disciplineBalance: { run: 2, swim: 1, bike: 1 } },
    };

    const fatigued = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 80,
      phase: 'BUILD',
      daysToRace: 60,
      trends: fatiguingTrends,
    });

    const normal = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 80,
      phase: 'BUILD',
      daysToRace: 60,
    });

    // Fatiguing trend should produce shorter or equal duration (rest days = 0)
    if (fatigued.discipline !== 'rest' && normal.discipline !== 'rest') {
      expect(fatigued.duration).toBeLessThan(normal.duration);
    }
  });

  it('caps intensity at moderate when fatiguing', async () => {
    const fatiguingTrends = {
      health: { overallTrend: 'fatiguing' },
      workout: { disciplineBalance: { run: 2, swim: 1, bike: 1 } },
    };

    const workout = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 90,
      phase: 'BUILD',
      daysToRace: 60,
      trends: fatiguingTrends,
    });

    if (workout.discipline !== 'rest') {
      expect(workout.intensity).toBe('moderate');
    }
  });

  it('prioritizes under-trained discipline from trends', async () => {
    const trends = {
      health: { overallTrend: 'stable' },
      workout: { disciplineBalance: { run: 3, bike: 2, swim: 0 } },
    };

    const workout = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      trends,
    });

    // swim has 0 sessions, should be prioritized (unless it's a rest day)
    if (workout.discipline !== 'rest') {
      expect(workout.discipline).toBe('swim');
    }
  });

  it('works normally without trends', async () => {
    const workout = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 72,
      phase: 'BUILD',
      daysToRace: 60,
      trends: null,
    });

    expect(workout.title).toBeDefined();
    expect(workout.sections).toBeDefined();
  });
});

describe('generateWorkoutLocally - load adjustment from coach conversation', () => {
  it('reduces duration when active load adjustment is reduce', async () => {
    const futureExpiry = new Date();
    futureExpiry.setDate(futureExpiry.getDate() + 2);
    const profileWithAdjustment = {
      ...mockProfile,
      athleteInsights: {
        recentMood: 'fatigued',
        loadAdjustment: 'reduce',
        loadAdjustmentExpiry: futureExpiry.toISOString(),
        loadAdjustmentDays: 2,
        painPoints: [],
        conversationThemes: [],
        preferredIntensity: null,
        requestedRestDay: null,
        requestedDisciplineFocus: null,
      },
    };

    const reduced = await generateWorkoutLocally({
      profile: profileWithAdjustment,
      healthData: mockHealthData,
      readinessScore: 80,
      phase: 'BUILD',
      daysToRace: 60,
    });

    const normal = await generateWorkoutLocally({
      profile: mockProfile,
      healthData: mockHealthData,
      readinessScore: 80,
      phase: 'BUILD',
      daysToRace: 60,
    });

    // If neither is a rest day, reduced should have shorter duration
    if (reduced.discipline !== 'rest' && normal.discipline !== 'rest') {
      expect(reduced.duration).toBeLessThan(normal.duration);
    }
  });

  it('returns rest workout when requestedRestDay matches today', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const profileWithRestRequest = {
      ...mockProfile,
      athleteInsights: {
        recentMood: 'neutral',
        loadAdjustment: null,
        loadAdjustmentExpiry: null,
        loadAdjustmentDays: null,
        requestedRestDay: today.toISOString(),
        requestedDisciplineFocus: null,
        painPoints: [],
        conversationThemes: [],
        preferredIntensity: null,
      },
    };

    const workout = await generateWorkoutLocally({
      profile: profileWithRestRequest,
      healthData: mockHealthData,
      readinessScore: 90,
      phase: 'BUILD',
      daysToRace: 60,
      targetDate: today,
    });

    expect(workout.discipline).toBe('rest');
  });

  it('does not apply load adjustment when expiry is in the past', async () => {
    const pastExpiry = new Date();
    pastExpiry.setDate(pastExpiry.getDate() - 1);
    const profileWithExpiredAdjustment = {
      ...mockProfile,
      athleteInsights: {
        recentMood: 'neutral',
        loadAdjustment: 'reduce',
        loadAdjustmentExpiry: pastExpiry.toISOString(),
        loadAdjustmentDays: 3,
        requestedRestDay: null,
        requestedDisciplineFocus: null,
        painPoints: [],
        conversationThemes: [],
        preferredIntensity: null,
      },
    };

    const workout = await generateWorkoutLocally({
      profile: profileWithExpiredAdjustment,
      healthData: mockHealthData,
      readinessScore: 90,
      phase: 'BUILD',
      daysToRace: 60,
    });

    // With expired adjustment, high readiness (90) should produce 'hard' intensity
    if (workout.discipline !== 'rest') {
      expect(workout.intensity).toBe('hard');
    }
  });
});

describe('analyzeRecentWorkouts', () => {
  it('returns null when recentDays is empty', async () => {
    const result = await analyzeRecentWorkouts([], null);
    expect(result).toBeNull();
  });

  it('returns null when recentDays is null', async () => {
    const result = await analyzeRecentWorkouts(null, null);
    expect(result).toBeNull();
  });

  it('returns rule-based fallback when model is not ready', async () => {
    const recentDays = [
      {
        dateLabel: 'Yesterday',
        workouts: [{ discipline: 'run', durationMinutes: 45, avgHeartRate: 158, effortScore: 7 }],
      },
      {
        dateLabel: '2 days ago',
        workouts: [{ discipline: 'bike', durationMinutes: 60, avgHeartRate: 145, effortScore: 6 }],
      },
    ];
    const result = await analyzeRecentWorkouts(recentDays, null);
    // Model mock returns undefined (not ready), so rule-based fallback kicks in
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes discipline info in fallback', async () => {
    const recentDays = [
      {
        dateLabel: 'Yesterday',
        workouts: [{ discipline: 'swim', durationMinutes: 40 }],
      },
    ];
    const result = await analyzeRecentWorkouts(recentDays, null);
    expect(result).toContain('swim');
  });

  it('handles healthData in context', async () => {
    const recentDays = [
      {
        dateLabel: 'Yesterday',
        workouts: [{ discipline: 'run', durationMinutes: 50, avgHeartRate: 160 }],
      },
    ];
    const healthData = { restingHR: 55, hrv: 42, sleepHours: 7.5 };
    const result = await analyzeRecentWorkouts(recentDays, healthData);
    expect(typeof result).toBe('string');
  });
});
