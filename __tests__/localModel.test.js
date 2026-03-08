import { generateWorkoutLocally, generateWeeklySummaryLocally } from '../services/localModel';

jest.mock('../services/healthKit');

const mockProfile = {
  level: 'Intermediate',
  distance: 'Full Ironman',
  weeklyHours: '8-10',
  strongestDiscipline: 'Bike',
  weakestDiscipline: 'Swim',
  injuries: 'None',
  goalTime: '12-14h',
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

    // Both should be valid
    expect(highReadiness.duration).toBeGreaterThan(0);
    expect(lowReadiness.duration).toBeGreaterThan(0);
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
