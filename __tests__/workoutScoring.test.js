import {
  calculateCompletionScore,
  findYesterdayWorkouts,
  findYesterdayCompletedWorkouts,
  calculateDailyComplianceScore,
  calculateRecentComplianceScore,
  calculateRecentActivityScore,
  calculateRacePreparationScore,
  calculateOverallReadiness,
  getCompletionFeedback,
  analyzeDisciplineGaps,
} from '../services/workoutScoring';

describe('calculateCompletionScore', () => {
  it('returns null for null input', () => {
    expect(calculateCompletionScore(null)).toBeNull();
  });

  it('returns 100 for rest day workout', () => {
    expect(calculateCompletionScore({ discipline: 'rest', completedSets: 0, totalSets: 0 })).toBe(
      100
    );
  });

  it('returns null when totalSets is 0', () => {
    expect(
      calculateCompletionScore({ discipline: 'run', completedSets: 0, totalSets: 0 })
    ).toBeNull();
  });

  it('calculates correct percentage', () => {
    expect(calculateCompletionScore({ completedSets: 5, totalSets: 6 })).toBe(83);
    expect(calculateCompletionScore({ completedSets: 6, totalSets: 6 })).toBe(100);
    expect(calculateCompletionScore({ completedSets: 1, totalSets: 4 })).toBe(25);
  });
});

describe('findYesterdayWorkouts', () => {
  it('returns empty array for null history', () => {
    expect(findYesterdayWorkouts(null)).toEqual([]);
    expect(findYesterdayWorkouts([])).toEqual([]);
  });

  it('finds workouts completed yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const history = [
      { completedAt: yesterday.toISOString(), title: 'Swim' },
      { completedAt: new Date().toISOString(), title: 'Today Run' },
    ];

    const result = findYesterdayWorkouts(history);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Swim');
  });

  it('returns empty when no workouts match yesterday', () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const history = [{ completedAt: twoDaysAgo.toISOString(), title: 'Old Ride' }];
    expect(findYesterdayWorkouts(history)).toEqual([]);
  });
});

describe('calculateRecentComplianceScore', () => {
  it('returns null for empty history', () => {
    expect(calculateRecentComplianceScore([])).toBeNull();
    expect(calculateRecentComplianceScore(null)).toBeNull();
  });

  it('averages completion scores from recent workouts', () => {
    const now = new Date();
    const history = [
      { completedAt: now.toISOString(), completedSets: 6, totalSets: 6 },
      { completedAt: now.toISOString(), completedSets: 4, totalSets: 6 },
    ];
    const score = calculateRecentComplianceScore(history, 7);
    expect(score).toBe(84); // (100 + 67) / 2 = 83.5 rounded to 84
  });

  it('ignores workouts older than daysBack', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);

    const history = [{ completedAt: old.toISOString(), completedSets: 1, totalSets: 6 }];
    expect(calculateRecentComplianceScore(history, 7)).toBeNull();
  });
});

describe('calculateRacePreparationScore', () => {
  it('returns a score between 0 and 100', () => {
    const score = calculateRacePreparationScore('BUILD', 90, 80);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores higher for appropriate phase', () => {
    const correctPhase = calculateRacePreparationScore('PEAK', 50, 80);
    const wrongPhase = calculateRacePreparationScore('BASE', 50, 80);
    expect(correctPhase).toBeGreaterThan(wrongPhase);
  });

  it('handles null daysToRace', () => {
    const score = calculateRacePreparationScore('BUILD', null, 70);
    expect(score).toBeGreaterThan(0);
  });

  it('handles null compliance', () => {
    const score = calculateRacePreparationScore('BUILD', 60, null);
    expect(score).toBeGreaterThan(0);
  });
});

describe('calculateOverallReadiness', () => {
  it('correctly weights components (40/35/25)', () => {
    const result = calculateOverallReadiness(100, 100, 100);
    expect(result).toBe(100);
  });

  it('uses defaults of 40 for null components (unknown ≠ neutral)', () => {
    // All null → 40*0.4 + 40*0.35 + 40*0.25 = 40
    const result = calculateOverallReadiness(null, null, null);
    expect(result).toBe(40);
  });

  it('weights health at 40%', () => {
    const highHealth = calculateOverallReadiness(100, 50, 50);
    const lowHealth = calculateOverallReadiness(0, 50, 50);
    expect(highHealth - lowHealth).toBe(40);
  });

  it('clamps between 0 and 100', () => {
    expect(calculateOverallReadiness(0, 0, 0)).toBe(0);
    expect(calculateOverallReadiness(100, 100, 100)).toBe(100);
  });
});

describe('getCompletionFeedback', () => {
  it('returns "No data" for null', () => {
    const feedback = getCompletionFeedback(null);
    expect(feedback.label).toBe('No data');
  });

  it('returns "Crushed it!" for 90+', () => {
    expect(getCompletionFeedback(95).label).toBe('Crushed it!');
    expect(getCompletionFeedback(100).label).toBe('Crushed it!');
  });

  it('returns "Solid session" for 75-89', () => {
    expect(getCompletionFeedback(75).label).toBe('Solid session');
    expect(getCompletionFeedback(89).label).toBe('Solid session');
  });

  it('returns "Room to push harder" for 50-74', () => {
    expect(getCompletionFeedback(50).label).toBe('Room to push harder');
    expect(getCompletionFeedback(74).label).toBe('Room to push harder');
  });

  it('returns "Consistency is key" for below 50', () => {
    expect(getCompletionFeedback(30).label).toBe('Consistency is key');
    expect(getCompletionFeedback(0).label).toBe('Consistency is key');
  });
});

describe('findYesterdayCompletedWorkouts', () => {
  it('returns empty array for null input', () => {
    expect(findYesterdayCompletedWorkouts(null)).toEqual([]);
    expect(findYesterdayCompletedWorkouts([])).toEqual([]);
  });

  it('finds workouts from Apple Health with startDate yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const workouts = [
      { startDate: yesterday.toISOString(), discipline: 'swim', durationMinutes: 45 },
      { startDate: new Date().toISOString(), discipline: 'run', durationMinutes: 60 },
    ];

    const result = findYesterdayCompletedWorkouts(workouts);
    expect(result).toHaveLength(1);
    expect(result[0].discipline).toBe('swim');
  });
});

describe('calculateDailyComplianceScore', () => {
  it('returns null when no data', () => {
    expect(calculateDailyComplianceScore(null, [])).toBeNull();
    expect(calculateDailyComplianceScore({ discipline: 'run', duration: 60 }, null)).toBeNull();
  });

  it('returns 100 for rest day with no completed workouts', () => {
    const score = calculateDailyComplianceScore({ discipline: 'rest', duration: 0 }, []);
    expect(score).toBe(100);
  });

  it('returns 80 for rest day when athlete worked out anyway', () => {
    const score = calculateDailyComplianceScore({ discipline: 'rest', duration: 0 }, [
      { discipline: 'run', durationMinutes: 30 },
    ]);
    expect(score).toBe(80);
  });

  it('returns 20 when no matching discipline found', () => {
    const score = calculateDailyComplianceScore({ discipline: 'swim', duration: 60 }, [
      { discipline: 'run', durationMinutes: 60 },
    ]);
    expect(score).toBe(20);
  });

  it('scores based on duration ratio for matching discipline', () => {
    const score = calculateDailyComplianceScore({ discipline: 'run', duration: 60 }, [
      { discipline: 'run', durationMinutes: 60 },
    ]);
    expect(score).toBe(100); // 50 (discipline match) + 50 (100% duration)
  });
});

describe('calculateRecentActivityScore', () => {
  it('returns null for empty workouts', () => {
    expect(calculateRecentActivityScore([])).toBeNull();
    expect(calculateRecentActivityScore(null)).toBeNull();
  });

  it('scores based on session count and discipline variety', () => {
    const now = new Date();
    const workouts = [
      { startDate: now.toISOString(), discipline: 'swim' },
      { startDate: now.toISOString(), discipline: 'bike' },
      { startDate: now.toISOString(), discipline: 'run' },
    ];
    const score = calculateRecentActivityScore(workouts, 7);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('ignores workouts older than daysBack', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const workouts = [{ startDate: old.toISOString(), discipline: 'run' }];
    expect(calculateRecentActivityScore(workouts, 7)).toBeNull();
  });
});

describe('analyzeDisciplineGaps', () => {
  it('identifies under-trained disciplines', () => {
    const now = new Date();
    const workouts = [
      { startDate: now.toISOString(), discipline: 'run' },
      { startDate: now.toISOString(), discipline: 'run' },
      { startDate: now.toISOString(), discipline: 'run' },
      { startDate: now.toISOString(), discipline: 'run' },
    ];
    const result = analyzeDisciplineGaps(workouts, ['swim', 'bike', 'run', 'strength', 'rest'], 14);
    expect(result.underTrained).toContain('swim');
    expect(result.underTrained).toContain('bike');
    expect(result.underTrained).not.toContain('run');
  });

  it('returns empty gaps when all disciplines covered', () => {
    const now = new Date();
    const workouts = [
      { startDate: now.toISOString(), discipline: 'swim' },
      { startDate: now.toISOString(), discipline: 'swim' },
      { startDate: now.toISOString(), discipline: 'swim' },
      { startDate: now.toISOString(), discipline: 'swim' },
      { startDate: now.toISOString(), discipline: 'bike' },
      { startDate: now.toISOString(), discipline: 'bike' },
      { startDate: now.toISOString(), discipline: 'bike' },
      { startDate: now.toISOString(), discipline: 'bike' },
      { startDate: now.toISOString(), discipline: 'run' },
      { startDate: now.toISOString(), discipline: 'run' },
      { startDate: now.toISOString(), discipline: 'run' },
      { startDate: now.toISOString(), discipline: 'run' },
    ];
    const result = analyzeDisciplineGaps(workouts, ['swim', 'bike', 'run', 'strength', 'rest'], 14);
    expect(result.underTrained).toEqual([]);
  });

  it('handles empty workouts', () => {
    const result = analyzeDisciplineGaps([], ['swim', 'bike', 'run'], 14);
    expect(result.underTrained).toContain('swim');
    expect(result.underTrained).toContain('bike');
    expect(result.underTrained).toContain('run');
  });
});
