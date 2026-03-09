import { calculateReadiness, mapWorkoutType, fetchCompletedWorkouts } from '../services/healthKit';

describe('calculateReadiness', () => {
  it('returns null when data is null', () => {
    expect(calculateReadiness(null)).toBeNull();
  });

  it('returns baseline 50 when all metrics are missing', () => {
    expect(calculateReadiness({})).toBe(50);
  });

  it('returns high score for excellent metrics', () => {
    const data = { hrv: 85, restingHR: 46, sleepHours: 8.5 };
    const score = calculateReadiness(data);
    expect(score).toBe(100);
  });

  it('returns low score for poor metrics', () => {
    const data = { hrv: 20, restingHR: 70, sleepHours: 5 };
    const score = calculateReadiness(data);
    expect(score).toBe(55);
  });

  it('handles partial data', () => {
    const data = { hrv: 60 };
    const score = calculateReadiness(data);
    expect(score).toBe(75);
  });
});

describe('mapWorkoutType', () => {
  it('maps swimming to swim', () => {
    expect(mapWorkoutType(46)).toBe('swim');
  });

  it('maps cycling to bike', () => {
    expect(mapWorkoutType(13)).toBe('bike');
  });

  it('maps running to run', () => {
    expect(mapWorkoutType(37)).toBe('run');
  });

  it('maps walking to run', () => {
    expect(mapWorkoutType(52)).toBe('run');
  });

  it('maps functional strength to strength', () => {
    expect(mapWorkoutType(50)).toBe('strength');
  });

  it('maps traditional strength to strength', () => {
    expect(mapWorkoutType(20)).toBe('strength');
  });

  it('returns other for unknown activity types', () => {
    expect(mapWorkoutType(999)).toBe('other');
    expect(mapWorkoutType(0)).toBe('other');
  });
});

describe('fetchCompletedWorkouts', () => {
  it('returns an array from HealthKit mock', async () => {
    const workouts = await fetchCompletedWorkouts(7);

    expect(Array.isArray(workouts)).toBe(true);
  });

  it('returns workouts with correct shape when HealthKit has data', async () => {
    const AppleHealthKit = require('react-native-health').default;
    const mockSamples = [
      {
        id: 'hk_1',
        activityId: 37,
        startDate: '2026-03-07T06:00:00.000Z',
        endDate: '2026-03-07T07:00:00.000Z',
        calories: 500,
        distance: 10,
        sourceName: 'Apple Watch',
      },
      {
        id: 'hk_2',
        activityId: 46,
        startDate: '2026-03-06T06:00:00.000Z',
        endDate: '2026-03-06T06:45:00.000Z',
        calories: 350,
        distance: 1.8,
        sourceName: 'Apple Watch',
      },
    ];
    AppleHealthKit.getSamples.mockImplementationOnce((_, cb) => cb(null, mockSamples));

    const workouts = await fetchCompletedWorkouts(7);

    expect(workouts).toHaveLength(2);
    expect(workouts[0].discipline).toBe('run');
    expect(workouts[0].durationMinutes).toBe(60);
    expect(workouts[0].source).toBe('Apple Watch');
    expect(workouts[1].discipline).toBe('swim');
    expect(workouts[1].durationMinutes).toBe(45);
  });

  it('maps workout activity types correctly in results', async () => {
    const AppleHealthKit = require('react-native-health').default;
    const mockSamples = [
      {
        id: 'hk_3',
        activityId: 13,
        startDate: '2026-03-05T06:00:00.000Z',
        endDate: '2026-03-05T07:30:00.000Z',
        calories: 700,
        distance: 35,
        sourceName: 'Garmin',
      },
    ];
    AppleHealthKit.getSamples.mockImplementationOnce((_, cb) => cb(null, mockSamples));

    const workouts = await fetchCompletedWorkouts(7);

    expect(workouts[0].discipline).toBe('bike');
    expect(workouts[0].distanceMeters).toBe(35000);
    expect(workouts[0].source).toBe('Garmin');
  });

  it('returns empty array when HealthKit errors', async () => {
    const AppleHealthKit = require('react-native-health').default;
    AppleHealthKit.getSamples.mockImplementationOnce((_, cb) => cb(new Error('fail'), null));

    const workouts = await fetchCompletedWorkouts(7);

    expect(workouts).toEqual([]);
  });
});
