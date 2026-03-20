import {
  calculateReadiness,
  mapWorkoutType,
  fetchCompletedWorkouts,
  calculatePace,
  calculateEffortScore,
  deduplicateWorkouts,
} from '../services/healthKit';

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

  it('maps walking to other (filtered out as non-triathlon)', () => {
    expect(mapWorkoutType(52)).toBe('other');
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
    const AppleHealthKit = require('react-native-health');
    // Native HealthKit response uses 'start'/'end' fields, distance in miles
    const mockSamples = [
      {
        id: 'hk_1',
        activityId: 37,
        start: '2026-03-07T06:00:00.000Z',
        end: '2026-03-07T07:00:00.000Z',
        calories: 500,
        distance: 6.2,
        sourceName: 'Apple Watch',
      },
      {
        id: 'hk_2',
        activityId: 46,
        start: '2026-03-06T06:00:00.000Z',
        end: '2026-03-06T06:45:00.000Z',
        calories: 350,
        distance: 1.1,
        sourceName: 'Apple Watch',
      },
    ];
    AppleHealthKit.getSamples.mockImplementationOnce((_, cb) => cb(null, mockSamples));

    const workouts = await fetchCompletedWorkouts(7);

    expect(workouts).toHaveLength(2);
    // Sorted chronologically ascending: swim (Mar 6) before run (Mar 7)
    expect(workouts[0].discipline).toBe('swim');
    expect(workouts[0].durationMinutes).toBe(45);
    expect(workouts[0].source).toBe('Apple Watch');
    expect(workouts[1].discipline).toBe('run');
    expect(workouts[1].durationMinutes).toBe(60);
  });

  it('maps workout activity types correctly in results', async () => {
    const AppleHealthKit = require('react-native-health');
    // Native HealthKit response: distance in miles
    const mockSamples = [
      {
        id: 'hk_3',
        activityId: 13,
        start: '2026-03-05T06:00:00.000Z',
        end: '2026-03-05T07:30:00.000Z',
        calories: 700,
        distance: 21.75,
        sourceName: 'Garmin',
      },
    ];
    AppleHealthKit.getSamples.mockImplementationOnce((_, cb) => cb(null, mockSamples));

    const workouts = await fetchCompletedWorkouts(7);

    expect(workouts[0].discipline).toBe('bike');
    expect(workouts[0].distanceMeters).toBe(Math.round(21.75 * 1609.34));
    expect(workouts[0].source).toBe('Garmin');
  });

  it('returns empty array when HealthKit errors', async () => {
    const AppleHealthKit = require('react-native-health');
    AppleHealthKit.getSamples.mockImplementationOnce((_, cb) => cb(new Error('fail'), null));

    const workouts = await fetchCompletedWorkouts(7);

    expect(workouts).toEqual([]);
  });
});

describe('calculatePace', () => {
  it('returns pace in min/km for valid inputs', () => {
    // 10km in 50 minutes = 5.0 min/km
    const pace = calculatePace(10000, 50);
    expect(pace).toBe(5.0);
  });

  it('returns null when distance is zero', () => {
    expect(calculatePace(0, 30)).toBeNull();
  });

  it('returns null when distance is null', () => {
    expect(calculatePace(null, 30)).toBeNull();
  });

  it('returns null when duration is zero', () => {
    expect(calculatePace(5000, 0)).toBeNull();
  });

  it('calculates correct pace for a 5k in 25 min', () => {
    const pace = calculatePace(5000, 25);
    expect(pace).toBe(5.0);
  });
});

describe('calculateEffortScore', () => {
  it('returns effort score on 1-10 scale', () => {
    // avgHR=150, restingHR=60, maxHR=190 → HRR = (150-60)/(190-60) = 69.2%
    const effort = calculateEffortScore(150, 60, 190);
    expect(effort).toBeGreaterThanOrEqual(1);
    expect(effort).toBeLessThanOrEqual(10);
  });

  it('returns higher score for harder effort', () => {
    const easy = calculateEffortScore(120, 60, 190);
    const hard = calculateEffortScore(175, 60, 190);
    expect(hard).toBeGreaterThan(easy);
  });

  it('returns null when parameters are missing', () => {
    expect(calculateEffortScore(null, 60, 190)).toBeNull();
    expect(calculateEffortScore(150, null, 190)).toBeNull();
    expect(calculateEffortScore(150, 60, null)).toBeNull();
  });

  it('clamps to 1-10 range', () => {
    // Very low effort
    const low = calculateEffortScore(62, 60, 190);
    expect(low).toBeGreaterThanOrEqual(1);

    // Max effort
    const max = calculateEffortScore(190, 60, 190);
    expect(max).toBeLessThanOrEqual(10);
  });

  it('maps walking to other (filtered out as non-triathlon)', () => {
    expect(mapWorkoutType(52)).toBe('other');
  });

  it('maps hiking to other (filtered out as non-triathlon)', () => {
    expect(mapWorkoutType(35)).toBe('other');
  });
});

describe('deduplicateWorkouts', () => {
  const base = {
    id: 'hk_1',
    discipline: 'run',
    startDate: '2026-03-18T07:00:00.000Z',
    endDate: '2026-03-18T08:00:00.000Z',
    durationMinutes: 60,
    calories: 500,
    avgHeartRate: 155,
    maxHeartRate: 175,
  };

  it('returns single workout unchanged', () => {
    const result = deduplicateWorkouts([base]);
    expect(result).toHaveLength(1);
    expect(result[0].discipline).toBe('run');
  });

  it('keeps workouts with different disciplines separate', () => {
    const swim = { ...base, id: 'hk_2', discipline: 'swim' };
    const result = deduplicateWorkouts([base, swim]);
    expect(result).toHaveLength(2);
  });

  it('keeps workouts on different days separate', () => {
    const nextDay = {
      ...base,
      id: 'hk_2',
      startDate: '2026-03-19T07:00:00.000Z',
      endDate: '2026-03-19T08:00:00.000Z',
    };
    const result = deduplicateWorkouts([base, nextDay]);
    expect(result).toHaveLength(2);
  });

  it('merges duplicate workouts within 30min start and 3min duration', () => {
    const dup = {
      ...base,
      id: 'hk_2',
      startDate: '2026-03-18T07:10:00.000Z',
      endDate: '2026-03-18T08:10:00.000Z',
      durationMinutes: 60,
      calories: 200,
    };
    const result = deduplicateWorkouts([base, dup]);
    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(700); // summed
  });

  it('keeps workouts with duration diff > 3min separate', () => {
    const different = {
      ...base,
      id: 'hk_2',
      durationMinutes: 65, // 5 min diff — should NOT merge
    };
    const result = deduplicateWorkouts([base, different]);
    expect(result).toHaveLength(2);
  });

  it('keeps start time earliest when merging', () => {
    const later = {
      ...base,
      id: 'hk_2',
      startDate: '2026-03-18T07:05:00.000Z',
      endDate: '2026-03-18T08:05:00.000Z',
    };
    const result = deduplicateWorkouts([later, base]);
    // base has earlier start (07:00), later has later start (07:05)
    expect(result[0].startDate).toBe(base.startDate);
  });

  it('takes max heart rate when merging', () => {
    const higher = { ...base, id: 'hk_2', avgHeartRate: 165, maxHeartRate: 185 };
    const result = deduplicateWorkouts([base, higher]);
    expect(result[0].avgHeartRate).toBe(165);
    expect(result[0].maxHeartRate).toBe(185);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateWorkouts([])).toEqual([]);
  });
});
