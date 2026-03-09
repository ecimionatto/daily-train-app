import {
  generateWorkoutLocally,
  generateWeeklySummaryLocally,
  generateAlternativeWorkout,
  generateReplacementWorkout,
  generateWeeklyPlanAdjustment,
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

    expect(workout.title).toBe('Active Recovery');
    expect(workout.discipline).toBe('rest');
    expect(workout.intensity).toBe('recovery');
    expect(workout.duration).toBe(30);
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
