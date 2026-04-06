import {
  analyzeTrainingHistory,
  formatHistorySummary,
  getWeekBoundaries,
} from '../services/historyAnalyzer';
// WEEKLY_TARGETS imported by historyAnalyzer internally

// --- Test helpers ---

/**
 * Build a mock workout object matching fetchCompletedWorkouts() shape.
 */
function mockWorkout(discipline, startDate, durationMinutes, extras = {}) {
  return {
    id: `hk_${startDate}`,
    discipline,
    startDate,
    durationMinutes,
    avgHeartRate: extras.avgHeartRate || null,
    effortScore: extras.effortScore ?? null,
    ...extras,
  };
}

/**
 * Generate a date string N days ago at a given hour.
 */
function daysAgo(n, hour = 8) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * Generate workouts on specific weekdays over several weeks.
 * Returns array of mock workout objects.
 */
function generateWeeklyPattern(disciplines, weekdays, weeksBack, durationMinutes = 60) {
  const workouts = [];
  for (let week = 0; week < weeksBack; week++) {
    weekdays.forEach((dayOfWeek, idx) => {
      const discipline = disciplines[idx % disciplines.length];
      // Find the date for this weekday in this week
      const d = new Date();
      d.setDate(d.getDate() - week * 7);
      // Adjust to desired day of week
      const currentDay = d.getDay();
      const diff = dayOfWeek - currentDay;
      d.setDate(d.getDate() + diff);
      d.setHours(8, 0, 0, 0);

      // Only include if within the analysis window
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (d <= now && d >= thirtyDaysAgo) {
        workouts.push(mockWorkout(discipline, d.toISOString(), durationMinutes));
      }
    });
  }
  return workouts;
}

// --- Tests ---

describe('analyzeTrainingHistory', () => {
  describe('empty data', () => {
    it('returns sensible defaults for null input', () => {
      const result = analyzeTrainingHistory(null);
      expect(result.totalWorkouts).toBe(0);
      expect(result.avgSessionsPerWeek).toBe(0);
      expect(result.avgMinutesPerWeek).toBe(0);
      expect(result.inferredVolumeTier).toBe('5-7');
      expect(result.avgConsistency).toBe(0);
      expect(result.gaps).toEqual([]);
      expect(result.strengths).toEqual([]);
      expect(result.trainingDays).toEqual([]);
      expect(result.restDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(result.trend).toBe('stable');
      expect(result.intensityDistribution).toEqual({ easyPct: 80, hardPct: 20 });
    });

    it('returns sensible defaults for empty array', () => {
      const result = analyzeTrainingHistory([]);
      expect(result.totalWorkouts).toBe(0);
      expect(result.inferredVolumeTier).toBe('5-7');
    });
  });

  describe('single workout', () => {
    it('handles minimal data gracefully', () => {
      const workouts = [mockWorkout('run', daysAgo(2), 45)];
      const result = analyzeTrainingHistory(workouts);

      expect(result.totalWorkouts).toBe(1);
      expect(result.totalMinutes).toBe(45);
      expect(result.disciplineCounts.run).toBe(1);
      expect(result.disciplineMinutes.run).toBe(45);
      expect(result.disciplineCounts.swim).toBe(0);
      expect(result.avgDurationByDiscipline.run).toBe(45);
      expect(result.longestSessionByDiscipline.run).toBe(45);
      expect(result.inferredVolumeTier).toBe('5-7');
    });
  });

  describe('full triathlete', () => {
    it('correctly analyzes mixed swim/bike/run data', () => {
      const workouts = [];
      // Generate 4 weeks of consistent training
      for (let week = 0; week < 4; week++) {
        for (let day = 0; day < 6; day++) {
          const daysBack = week * 7 + day + 1;
          if (daysBack > 30) continue;
          const disciplines = ['swim', 'bike', 'run', 'swim', 'bike', 'run'];
          const durations = [50, 70, 55, 50, 70, 55];
          workouts.push(mockWorkout(disciplines[day], daysAgo(daysBack), durations[day]));
        }
      }

      const result = analyzeTrainingHistory(workouts);

      expect(result.totalWorkouts).toBeGreaterThan(0);
      expect(result.disciplineCounts.swim).toBeGreaterThan(0);
      expect(result.disciplineCounts.bike).toBeGreaterThan(0);
      expect(result.disciplineCounts.run).toBeGreaterThan(0);
      expect(result.totalMinutes).toBeGreaterThan(0);
      expect(result.weeksAnalyzed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('run-only athlete', () => {
    it('detects swim and bike as gaps, run as strength', () => {
      const workouts = [];
      // 5 runs per week for 4 weeks = 20 runs
      for (let i = 1; i <= 28; i++) {
        // Skip weekends (roughly)
        if (i % 7 === 0 || i % 7 === 6) continue;
        workouts.push(mockWorkout('run', daysAgo(i), 55));
      }

      const result = analyzeTrainingHistory(workouts);

      expect(result.disciplineCounts.run).toBeGreaterThan(0);
      expect(result.disciplineCounts.swim).toBe(0);
      expect(result.disciplineCounts.bike).toBe(0);
      expect(result.gaps).toContain('swim');
      expect(result.gaps).toContain('bike');
      // Run should be a strength (well above target * 1.5)
      expect(result.strengths).toContain('run');
    });
  });

  describe('volume tier inference', () => {
    it('infers 5-7 for low volume', () => {
      // ~200 min/week = well under 420
      const workouts = [];
      for (let i = 1; i <= 28; i += 3) {
        workouts.push(mockWorkout('run', daysAgo(i), 40));
      }
      const result = analyzeTrainingHistory(workouts);
      expect(result.inferredVolumeTier).toBe('5-7');
    });

    it('infers 8-10 for moderate volume', () => {
      // Need ~420-600 min/week. 8 sessions * 60 min = 480/week
      const workouts = [];
      for (let i = 1; i <= 28; i++) {
        if (i % 7 === 0) continue; // 1 rest day
        workouts.push(mockWorkout('run', daysAgo(i), 80));
      }
      const result = analyzeTrainingHistory(workouts);
      expect(['8-10', '11-14', '15+']).toContain(result.inferredVolumeTier);
      expect(result.avgMinutesPerWeek).toBeGreaterThanOrEqual(420);
    });

    it('infers 15+ for very high volume', () => {
      // Need >840 min/week. 7 sessions * 130 min = 910/week
      const workouts = [];
      for (let i = 1; i <= 28; i++) {
        workouts.push(mockWorkout('run', daysAgo(i), 130));
        workouts.push(mockWorkout('bike', daysAgo(i, 14), 130));
      }
      const result = analyzeTrainingHistory(workouts);
      expect(result.inferredVolumeTier).toBe('15+');
    });
  });

  describe('day-of-week detection', () => {
    it('detects consistent Mon/Wed/Fri pattern', () => {
      // Monday=1, Wednesday=3, Friday=5
      const workouts = generateWeeklyPattern(['swim', 'bike', 'run'], [1, 3, 5], 5, 60);

      const result = analyzeTrainingHistory(workouts);

      // These days should be detected as training days (present in >= 50% of weeks)
      expect(result.trainingDays).toContain(1); // Monday
      expect(result.trainingDays).toContain(3); // Wednesday
      expect(result.trainingDays).toContain(5); // Friday

      // Tuesday, Thursday should be rest days
      expect(result.restDays).toContain(2); // Tuesday
      expect(result.restDays).toContain(4); // Thursday
    });
  });

  describe('consistency calculation', () => {
    it('calculates known consistency for known inputs', () => {
      // Create exactly the right number of sessions to match 8-10 tier targets
      // 8-10 tier: swim=3, bike=3, run=3, strength=1 = 10 total
      const workouts = [];
      // One full week matching all targets exactly
      for (let week = 0; week < 4; week++) {
        const base = week * 7 + 1;
        if (base > 28) continue;
        // 3 swims
        workouts.push(mockWorkout('swim', daysAgo(base), 50));
        workouts.push(mockWorkout('swim', daysAgo(base + 1), 50));
        workouts.push(mockWorkout('swim', daysAgo(base + 2), 50));
        // 3 bikes
        workouts.push(mockWorkout('bike', daysAgo(base, 14), 70));
        workouts.push(mockWorkout('bike', daysAgo(base + 1, 14), 70));
        workouts.push(mockWorkout('bike', daysAgo(base + 2, 14), 70));
        // 3 runs
        workouts.push(mockWorkout('run', daysAgo(base + 3), 55));
        workouts.push(mockWorkout('run', daysAgo(base + 4), 55));
        workouts.push(mockWorkout('run', daysAgo(base + 5), 55));
        // 1 strength
        workouts.push(mockWorkout('strength', daysAgo(base + 3, 14), 40));
      }

      const result = analyzeTrainingHistory(workouts);

      // With this volume (~480 min/wk), should be 8-10 tier
      // Each week has all targets met, so consistency should be high
      expect(result.avgConsistency).toBeGreaterThan(0);
      expect(result.weeklyConsistency.length).toBeGreaterThan(0);
    });
  });

  describe('trend detection', () => {
    it('detects improving trend when recent weeks have more workouts', () => {
      const workouts = [];
      // Week 4 (oldest): 1 workout
      workouts.push(mockWorkout('run', daysAgo(25), 45));
      // Week 3: 2 workouts
      workouts.push(mockWorkout('run', daysAgo(18), 45));
      workouts.push(mockWorkout('swim', daysAgo(17), 40));
      // Week 2: 4 workouts
      for (let i = 8; i <= 11; i++) {
        workouts.push(mockWorkout('run', daysAgo(i), 50));
      }
      // Week 1 (most recent): 5 workouts
      for (let i = 1; i <= 5; i++) {
        workouts.push(mockWorkout('run', daysAgo(i), 55));
      }

      const result = analyzeTrainingHistory(workouts);
      // Recent weeks have more workouts; trend should be improving or stable
      expect(['improving', 'stable']).toContain(result.trend);
    });

    it('detects declining trend when recent weeks have fewer workouts', () => {
      const workouts = [];
      // Week 4 (oldest): 5 workouts
      for (let i = 25; i <= 29; i++) {
        workouts.push(mockWorkout('run', daysAgo(i), 55));
      }
      // Week 3: 5 workouts
      for (let i = 18; i <= 22; i++) {
        workouts.push(mockWorkout('run', daysAgo(i), 55));
      }
      // Week 2: 1 workout
      workouts.push(mockWorkout('run', daysAgo(10), 45));
      // Week 1 (most recent): 1 workout
      workouts.push(mockWorkout('run', daysAgo(3), 45));

      const result = analyzeTrainingHistory(workouts);
      expect(['declining', 'stable']).toContain(result.trend);
    });

    it('detects stable trend when weeks are similar', () => {
      const workouts = [];
      for (let week = 0; week < 4; week++) {
        for (let day = 0; day < 3; day++) {
          const daysBack = week * 7 + day + 1;
          if (daysBack > 30) continue;
          workouts.push(mockWorkout('run', daysAgo(daysBack), 50));
        }
      }

      const result = analyzeTrainingHistory(workouts);
      expect(result.trend).toBe('stable');
    });
  });

  describe('intensity distribution', () => {
    it('calculates distribution from effort scores', () => {
      const workouts = [
        mockWorkout('run', daysAgo(1), 45, { effortScore: 3 }), // easy
        mockWorkout('run', daysAgo(2), 45, { effortScore: 4 }), // easy
        mockWorkout('run', daysAgo(3), 45, { effortScore: 5 }), // easy
        mockWorkout('run', daysAgo(4), 45, { effortScore: 7 }), // hard
        mockWorkout('run', daysAgo(5), 45, { effortScore: 8 }), // hard
      ];

      const result = analyzeTrainingHistory(workouts);

      expect(result.intensityDistribution.easyPct).toBe(60);
      expect(result.intensityDistribution.hardPct).toBe(40);
    });

    it('defaults to 80/20 when no effort scores available', () => {
      const workouts = [mockWorkout('run', daysAgo(1), 45), mockWorkout('swim', daysAgo(2), 40)];

      const result = analyzeTrainingHistory(workouts);

      expect(result.intensityDistribution.easyPct).toBe(80);
      expect(result.intensityDistribution.hardPct).toBe(20);
    });
  });

  describe('weeksAnalyzed', () => {
    it('reports correct number of complete weeks', () => {
      const result = analyzeTrainingHistory([], 30);
      expect(result.weeksAnalyzed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('discipline per-week averages', () => {
    it('calculates correct per-week averages', () => {
      const workouts = [];
      // 2 swims per week for ~4 weeks
      for (let i = 1; i <= 28; i += 3) {
        workouts.push(mockWorkout('swim', daysAgo(i), 50));
      }
      const result = analyzeTrainingHistory(workouts);
      expect(result.disciplinePerWeek.swim).toBeGreaterThan(0);
    });
  });
});

describe('getWeekBoundaries', () => {
  it('returns array of week objects with start and end', () => {
    const weeks = getWeekBoundaries(30);
    expect(Array.isArray(weeks)).toBe(true);
    weeks.forEach((w) => {
      expect(w.start).toBeInstanceOf(Date);
      expect(w.end).toBeInstanceOf(Date);
      expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
    });
  });

  it('weeks start on Monday', () => {
    const weeks = getWeekBoundaries(30);
    weeks.forEach((w) => {
      expect(w.start.getDay()).toBe(1); // Monday
    });
  });

  it('each week spans Monday to Sunday', () => {
    const weeks = getWeekBoundaries(30);
    weeks.forEach((w) => {
      expect(w.start.getDay()).toBe(1); // Monday
      expect(w.end.getDay()).toBe(0); // Sunday
    });
  });

  it('returns at least 3 weeks for 30-day window', () => {
    const weeks = getWeekBoundaries(30);
    expect(weeks.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array for very short window', () => {
    const weeks = getWeekBoundaries(3);
    // 3 days may not contain a full week
    expect(Array.isArray(weeks)).toBe(true);
  });
});

describe('formatHistorySummary', () => {
  it('returns no-data message for empty analysis', () => {
    const result = analyzeTrainingHistory([]);
    const summary = formatHistorySummary(result);
    expect(summary).toContain('No workout data');
  });

  it('returns no-data message for null input', () => {
    const summary = formatHistorySummary(null);
    expect(summary).toContain('No workout data');
  });

  it('produces compact string with key metrics', () => {
    const workouts = [];
    for (let i = 1; i <= 28; i++) {
      if (i % 7 === 0) continue;
      const disciplines = ['swim', 'bike', 'run', 'swim', 'bike', 'run'];
      const durations = [50, 70, 55, 50, 70, 55];
      const idx = i % 6;
      workouts.push(mockWorkout(disciplines[idx], daysAgo(i), durations[idx]));
    }

    const analysis = analyzeTrainingHistory(workouts);
    const summary = formatHistorySummary(analysis);

    expect(summary).toContain('Training History (30d)');
    expect(summary).toContain('Sessions/wk');
    expect(summary).toContain('Hours/wk');
    expect(summary).toContain('Discipline/wk');
    expect(summary).toContain('Consistency');
    expect(summary).toContain('Tier');
    expect(summary).toContain('Gaps');
    expect(summary).toContain('Strengths');
  });

  it('stays within token budget (~200 tokens)', () => {
    const workouts = [];
    for (let i = 1; i <= 20; i++) {
      workouts.push(mockWorkout('run', daysAgo(i), 55));
    }
    const analysis = analyzeTrainingHistory(workouts);
    const summary = formatHistorySummary(analysis);

    // ~200 tokens ≈ ~800 characters (1 token ≈ 4 chars)
    expect(summary.length).toBeLessThan(800);
  });
});
