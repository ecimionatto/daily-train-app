import {
  analyzeHealthTrends,
  analyzeWorkoutTrends,
  generateTrendSummary,
} from '../services/trendAnalysis';

describe('analyzeHealthTrends', () => {
  it('returns stable with insufficient data', () => {
    const result = analyzeHealthTrends([]);
    expect(result.overallTrend).toBe('stable');
    expect(result.alerts).toEqual([]);
  });

  it('returns stable with less than 3 data points', () => {
    const result = analyzeHealthTrends([
      { date: '2026-03-14', hrv: 50, restingHR: 60, sleepHours: 7 },
      { date: '2026-03-15', hrv: 52, restingHR: 59, sleepHours: 7.5 },
    ]);
    expect(result.overallTrend).toBe('stable');
  });

  it('detects improving trends when HRV up and RHR down', () => {
    const history = [];
    // Older week: lower HRV, higher RHR
    for (let i = 0; i < 7; i++) {
      history.push({
        date: `2026-03-0${i + 1}`,
        hrv: 35,
        restingHR: 68,
        sleepHours: 6,
      });
    }
    // Recent week: better metrics
    for (let i = 0; i < 7; i++) {
      history.push({
        date: `2026-03-0${i + 8}`,
        hrv: 55,
        restingHR: 55,
        sleepHours: 8,
      });
    }

    const result = analyzeHealthTrends(history);
    expect(result.overallTrend).toBe('recovering');
    expect(result.hrv.trend).toBe('improving');
    expect(result.restingHR.trend).toBe('improving');
    expect(result.sleep.trend).toBe('improving');
    expect(result.alerts).toHaveLength(0);
  });

  it('detects fatiguing trends when metrics decline', () => {
    const history = [];
    // Older week: good metrics
    for (let i = 0; i < 7; i++) {
      history.push({
        date: `2026-03-0${i + 1}`,
        hrv: 55,
        restingHR: 55,
        sleepHours: 8,
      });
    }
    // Recent week: worse metrics
    for (let i = 0; i < 7; i++) {
      history.push({
        date: `2026-03-0${i + 8}`,
        hrv: 35,
        restingHR: 68,
        sleepHours: 5.5,
      });
    }

    const result = analyzeHealthTrends(history);
    expect(result.overallTrend).toBe('fatiguing');
    expect(result.hrv.trend).toBe('declining');
    expect(result.restingHR.trend).toBe('declining');
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it('returns current values in trend data', () => {
    const history = [];
    for (let i = 0; i < 5; i++) {
      history.push({
        date: `2026-03-${String(i + 10).padStart(2, '0')}`,
        hrv: 50 + i,
        restingHR: 60,
        sleepHours: 7,
      });
    }
    const result = analyzeHealthTrends(history);
    expect(result.hrv.current).toBe(54);
    expect(result.hrv.avg7d).toBeCloseTo(52, 0);
  });
});

describe('analyzeWorkoutTrends', () => {
  it('returns defaults with no workouts', () => {
    const result = analyzeWorkoutTrends([]);
    expect(result.weeklyVolume).toBeNull();
    expect(result.disciplineBalance).toEqual({});
    expect(result.volumeTrend).toBe('stable');
  });

  it('returns defaults with null input', () => {
    const result = analyzeWorkoutTrends(null);
    expect(result.volumeTrend).toBe('stable');
  });

  it('calculates discipline balance', () => {
    const now = new Date();
    const workouts = [
      {
        discipline: 'run',
        durationMinutes: 45,
        startDate: new Date(now - 2 * 86400000).toISOString(),
      },
      {
        discipline: 'run',
        durationMinutes: 30,
        startDate: new Date(now - 3 * 86400000).toISOString(),
      },
      {
        discipline: 'swim',
        durationMinutes: 40,
        startDate: new Date(now - 4 * 86400000).toISOString(),
      },
    ];

    const result = analyzeWorkoutTrends(workouts, 7);
    expect(result.disciplineBalance.run).toBe(2);
    expect(result.disciplineBalance.swim).toBe(1);
  });

  it('detects missing disciplines', () => {
    const now = new Date();
    const workouts = [
      {
        discipline: 'run',
        durationMinutes: 45,
        startDate: new Date(now - 2 * 86400000).toISOString(),
      },
    ];

    const result = analyzeWorkoutTrends(workouts, 7);
    expect(result.alerts).toContain('No swim sessions in 7 days');
    expect(result.alerts).toContain('No bike sessions in 7 days');
  });

  it('calculates average effort by discipline', () => {
    const now = new Date();
    const workouts = [
      {
        discipline: 'run',
        durationMinutes: 45,
        effortScore: 6,
        startDate: new Date(now - 86400000).toISOString(),
      },
      {
        discipline: 'run',
        durationMinutes: 50,
        effortScore: 8,
        startDate: new Date(now - 2 * 86400000).toISOString(),
      },
    ];

    const result = analyzeWorkoutTrends(workouts, 7);
    expect(result.avgEffort.run).toBe(7);
  });

  it('detects volume increase', () => {
    const now = Date.now();
    const workouts = [];
    // Last week: 2 sessions of 30min = 60min
    for (let i = 8; i <= 9; i++) {
      workouts.push({
        discipline: 'run',
        durationMinutes: 30,
        startDate: new Date(now - i * 86400000).toISOString(),
      });
    }
    // This week: 5 sessions of 60min = 300min
    for (let i = 1; i <= 5; i++) {
      workouts.push({
        discipline: 'run',
        durationMinutes: 60,
        startDate: new Date(now - i * 86400000).toISOString(),
      });
    }

    const result = analyzeWorkoutTrends(workouts, 14);
    expect(result.volumeTrend).toBe('increasing');
    expect(result.alerts).toContain('Training volume spiked 30%+ — injury risk');
  });
});

describe('generateTrendSummary', () => {
  it('returns default message with no data', () => {
    const result = generateTrendSummary(null, null);
    expect(result).toBe('Insufficient data for trend analysis.');
  });

  it('includes health metrics when available', () => {
    const healthTrends = {
      hrv: { current: 52, avg7d: 50, trend: 'improving' },
      restingHR: { current: 58, avg7d: 59, trend: 'stable' },
      sleep: { current: 7.5, avg7d: 7.2, trend: 'improving' },
      overallTrend: 'recovering',
      alerts: [],
    };

    const result = generateTrendSummary(healthTrends, null);
    expect(result).toContain('HRV 52ms');
    expect(result).toContain('recovering');
  });

  it('includes volume and discipline balance', () => {
    const workoutTrends = {
      weeklyVolume: { thisWeek: 300, lastWeek: 250, trend: 'increasing' },
      disciplineBalance: { run: 3, swim: 1, bike: 2 },
      alerts: [],
    };

    const result = generateTrendSummary(null, workoutTrends);
    expect(result).toContain('Volume:');
    expect(result).toContain('Sessions:');
  });

  it('includes alerts from both sources', () => {
    const healthTrends = {
      overallTrend: 'fatiguing',
      alerts: ['HRV declining — possible fatigue accumulation'],
    };
    const workoutTrends = {
      alerts: ['No swim sessions in 14 days'],
    };

    const result = generateTrendSummary(healthTrends, workoutTrends);
    expect(result).toContain('Alerts:');
    expect(result).toContain('HRV declining');
    expect(result).toContain('No swim sessions');
  });
});
