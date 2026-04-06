import { calculateWeeklyConsistencyScore } from '../services/workoutScoring';
import { generateWeeklyTargets, selectTodaysDiscipline } from '../services/localModel';

// ---------------------------------------------------------------------------
// calculateWeeklyConsistencyScore
// ---------------------------------------------------------------------------
describe('calculateWeeklyConsistencyScore', () => {
  it('returns 0% when targets are null', () => {
    const result = calculateWeeklyConsistencyScore(null, []);
    expect(result.percentage).toBe(0);
    expect(result.byDiscipline).toEqual({});
    expect(result.keyWorkoutsHit).toBe(0);
    expect(result.totalKeyWorkouts).toBe(0);
  });

  it('returns 0% when no completions against valid targets', () => {
    const targets = {
      targets: {
        swim: { count: 3, totalMinutes: 150 },
        bike: { count: 3, totalMinutes: 210 },
        run: { count: 3, totalMinutes: 165 },
        strength: { count: 1, totalMinutes: 40 },
      },
    };
    const result = calculateWeeklyConsistencyScore(targets, []);
    expect(result.percentage).toBe(0);
    expect(result.totalKeyWorkouts).toBe(10);
    expect(result.keyWorkoutsHit).toBe(0);
    expect(result.byDiscipline.swim.pct).toBe(0);
  });

  it('calculates correct partial completion percentage', () => {
    const targets = {
      targets: {
        swim: { count: 3, totalMinutes: 150 },
        bike: { count: 3, totalMinutes: 210 },
        run: { count: 3, totalMinutes: 165 },
        strength: { count: 1, totalMinutes: 40 },
      },
    };
    const completed = [
      { discipline: 'swim' },
      { discipline: 'swim' },
      { discipline: 'bike' },
      { discipline: 'run' },
      { discipline: 'run' },
    ];
    const result = calculateWeeklyConsistencyScore(targets, completed);
    // 2 swim + 1 bike + 2 run + 0 strength = 5 / 10 = 50%
    expect(result.percentage).toBe(50);
    expect(result.keyWorkoutsHit).toBe(5);
    expect(result.byDiscipline.swim.pct).toBe(67); // 2/3
    expect(result.byDiscipline.bike.pct).toBe(33); // 1/3
    expect(result.byDiscipline.run.pct).toBe(67); // 2/3
    expect(result.byDiscipline.strength.pct).toBe(0);
  });

  it('returns 100% for full completion', () => {
    const targets = {
      targets: {
        swim: { count: 2, totalMinutes: 100 },
        bike: { count: 2, totalMinutes: 140 },
        run: { count: 2, totalMinutes: 110 },
        strength: { count: 0, totalMinutes: 0 },
      },
    };
    const completed = [
      { discipline: 'swim' },
      { discipline: 'swim' },
      { discipline: 'bike' },
      { discipline: 'bike' },
      { discipline: 'run' },
      { discipline: 'run' },
    ];
    const result = calculateWeeklyConsistencyScore(targets, completed);
    expect(result.percentage).toBe(100);
  });

  it('caps over-completion at 100%', () => {
    const targets = {
      targets: {
        swim: { count: 2, totalMinutes: 100 },
        bike: { count: 2, totalMinutes: 140 },
        run: { count: 2, totalMinutes: 110 },
        strength: { count: 0, totalMinutes: 0 },
      },
    };
    const completed = [
      { discipline: 'swim' },
      { discipline: 'swim' },
      { discipline: 'swim' }, // extra
      { discipline: 'bike' },
      { discipline: 'bike' },
      { discipline: 'run' },
      { discipline: 'run' },
      { discipline: 'run' }, // extra
    ];
    const result = calculateWeeklyConsistencyScore(targets, completed);
    expect(result.percentage).toBe(100);
    // byDiscipline.completed shows actual count (3), but pct is capped at 100
    expect(result.byDiscipline.swim.completed).toBe(3);
    expect(result.byDiscipline.swim.pct).toBe(100);
  });

  it('reports per-discipline breakdown correctly', () => {
    const targets = {
      targets: {
        swim: { count: 3, totalMinutes: 150 },
        bike: { count: 3, totalMinutes: 210 },
        run: { count: 4, totalMinutes: 220 },
        strength: { count: 1, totalMinutes: 40 },
      },
    };
    const completed = [
      { discipline: 'swim' },
      { discipline: 'swim' },
      { discipline: 'swim' },
      { discipline: 'bike' },
      { discipline: 'run' },
      { discipline: 'run' },
      { discipline: 'strength' },
    ];
    const result = calculateWeeklyConsistencyScore(targets, completed);
    expect(result.byDiscipline.swim).toEqual({ completed: 3, target: 3, pct: 100 });
    expect(result.byDiscipline.bike).toEqual({ completed: 1, target: 3, pct: 33 });
    expect(result.byDiscipline.run).toEqual({ completed: 2, target: 4, pct: 50 });
    expect(result.byDiscipline.strength).toEqual({ completed: 1, target: 1, pct: 100 });
  });
});

// ---------------------------------------------------------------------------
// selectTodaysDiscipline
// ---------------------------------------------------------------------------
describe('selectTodaysDiscipline', () => {
  const baseTargets = {
    targets: {
      swim: { count: 3, totalMinutes: 150 },
      bike: { count: 3, totalMinutes: 210 },
      run: { count: 3, totalMinutes: 165 },
      strength: { count: 1, totalMinutes: 40 },
    },
    suggestedSchedule: ['run', 'swim+bike', 'swim+run', 'strength', 'run', 'swim+bike', 'brick'],
  };

  it('returns rest when all targets are met', () => {
    const completed = [
      { discipline: 'swim' },
      { discipline: 'swim' },
      { discipline: 'swim' },
      { discipline: 'bike' },
      { discipline: 'bike' },
      { discipline: 'bike' },
      { discipline: 'run' },
      { discipline: 'run' },
      { discipline: 'run' },
      { discipline: 'strength' },
    ];
    expect(selectTodaysDiscipline(baseTargets, completed, 3)).toBe('rest');
  });

  it('picks the most urgent discipline when one is behind', () => {
    // swim: 0/3, bike: 3/3, run: 3/3, strength: 1/1 → swim has biggest gap
    const completed = [
      { discipline: 'bike' },
      { discipline: 'bike' },
      { discipline: 'bike' },
      { discipline: 'run' },
      { discipline: 'run' },
      { discipline: 'run' },
      { discipline: 'strength' },
    ];
    // dayOfWeek = 4 (Thursday), no suggested match for swim on Thu → picks most urgent
    const result = selectTodaysDiscipline(baseTargets, completed, 4);
    expect(result).toBe('swim');
  });

  it('picks most urgent when multiple disciplines are behind', () => {
    // swim: 1/3 (gap 2), bike: 2/3 (gap 1), run: 0/3 (gap 3) → run is most urgent
    const completed = [
      { discipline: 'swim' },
      { discipline: 'bike' },
      { discipline: 'bike' },
      { discipline: 'strength' },
    ];
    // dayOfWeek = 4 (Thursday), suggested is 'run' → matches gap
    const result = selectTodaysDiscipline(baseTargets, completed, 4);
    expect(result).toBe('run');
  });

  it('returns rest when readiness is below 40', () => {
    const result = selectTodaysDiscipline(baseTargets, [], 1, { readinessScore: 30 });
    expect(result).toBe('rest');
  });

  it('uses suggested schedule hint when discipline has gaps', () => {
    // dayOfWeek = 1 (Monday), suggested = 'swim+bike'
    // swim and bike both have gaps
    const result = selectTodaysDiscipline(baseTargets, [], 1);
    expect(result).toBe('swim+bike');
  });

  it('excludes strength on weekends', () => {
    const strengthOnlyTargets = {
      targets: {
        swim: { count: 0, totalMinutes: 0 },
        bike: { count: 0, totalMinutes: 0 },
        run: { count: 0, totalMinutes: 0 },
        strength: { count: 2, totalMinutes: 80 },
      },
      suggestedSchedule: ['rest', 'strength', 'rest', 'strength', 'rest', 'rest', 'rest'],
    };
    // Saturday (6) — strength excluded on weekends
    expect(selectTodaysDiscipline(strengthOnlyTargets, [], 6)).toBe('rest');
    // Sunday (0) — strength excluded on weekends
    expect(selectTodaysDiscipline(strengthOnlyTargets, [], 0)).toBe('rest');
    // Monday (1) — strength allowed on weekdays
    expect(selectTodaysDiscipline(strengthOnlyTargets, [], 1)).toBe('strength');
  });

  it('returns rest when weeklyTargets is null', () => {
    expect(selectTodaysDiscipline(null, [], 3)).toBe('rest');
  });
});

// ---------------------------------------------------------------------------
// generateWeeklyTargets
// ---------------------------------------------------------------------------
describe('generateWeeklyTargets', () => {
  const baseProfile = { weeklyHours: '8-10' };

  it('returns correct structure', () => {
    const result = generateWeeklyTargets('BASE', baseProfile);
    expect(result).toHaveProperty('weekStartDate');
    expect(result).toHaveProperty('targets');
    expect(result).toHaveProperty('phase', 'BASE');
    expect(result).toHaveProperty('totalSessions');
    expect(result).toHaveProperty('suggestedSchedule');
    expect(result).toHaveProperty('isDeloadWeek', false);
    expect(result).toHaveProperty('consistency', null);
    expect(result.targets).toHaveProperty('swim');
    expect(result.targets).toHaveProperty('bike');
    expect(result.targets).toHaveProperty('run');
    expect(result.targets).toHaveProperty('strength');
    expect(result.targets.swim).toHaveProperty('count');
    expect(result.targets.swim).toHaveProperty('totalMinutes');
  });

  it('produces different counts for different volume tiers', () => {
    const low = generateWeeklyTargets('BASE', { weeklyHours: '5-7' });
    const high = generateWeeklyTargets('BASE', { weeklyHours: '15+' });
    expect(low.totalSessions).toBeLessThan(high.totalSessions);
    expect(low.targets.swim.count).toBeLessThan(high.targets.swim.count);
  });

  it('applies phase volumeMult to totalMinutes', () => {
    const base = generateWeeklyTargets('BASE', baseProfile);
    const peak = generateWeeklyTargets('PEAK', baseProfile);
    // PEAK volumeMult (1.1) > BASE volumeMult (0.9) → more total minutes
    expect(peak.targets.swim.totalMinutes).toBeGreaterThan(base.targets.swim.totalMinutes);
  });

  it('returns a 7-element suggestedSchedule', () => {
    const result = generateWeeklyTargets('BUILD', baseProfile);
    expect(result.suggestedSchedule).toHaveLength(7);
  });

  it('defaults to 8-10 tier when profile has no weeklyHours', () => {
    const result = generateWeeklyTargets('BASE', {});
    const explicit = generateWeeklyTargets('BASE', { weeklyHours: '8-10' });
    expect(result.totalSessions).toBe(explicit.totalSessions);
  });

  it('strength totalMinutes ignores volumeMult', () => {
    const base = generateWeeklyTargets('BASE', baseProfile);
    const peak = generateWeeklyTargets('PEAK', baseProfile);
    // Strength minutes should be the same regardless of phase
    expect(base.targets.strength.totalMinutes).toBe(peak.targets.strength.totalMinutes);
  });
});
