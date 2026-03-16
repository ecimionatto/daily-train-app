/**
 * Trend analysis service — pure functions for analyzing health and workout trends.
 * No side effects, no AsyncStorage.
 */

/**
 * Analyze health metric trends over a time window.
 * Returns rolling averages, direction, and alerts.
 */
export function analyzeHealthTrends(healthHistory) {
  if (!healthHistory || healthHistory.length < 3) {
    return { hrv: null, restingHR: null, sleep: null, overallTrend: 'stable', alerts: [] };
  }

  const sorted = [...healthHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent7 = sorted.slice(-7);
  const older7 = sorted.slice(-14, -7);

  const hrvTrend = computeMetricTrend(recent7, older7, 'hrv', 'higher_better');
  const rhrTrend = computeMetricTrend(recent7, older7, 'restingHR', 'lower_better');
  const sleepTrend = computeMetricTrend(recent7, older7, 'sleepHours', 'higher_better');

  const alerts = [];
  if (hrvTrend.trend === 'declining') alerts.push('HRV declining — possible fatigue accumulation');
  if (rhrTrend.trend === 'declining') alerts.push('Resting HR elevated — recovery may be impaired');
  if (sleepTrend.trend === 'declining') alerts.push('Sleep trending down — prioritize rest');

  const trendScores = [hrvTrend, rhrTrend, sleepTrend].filter((t) => t !== null);
  const decliningCount = trendScores.filter((t) => t.trend === 'declining').length;
  const improvingCount = trendScores.filter((t) => t.trend === 'improving').length;

  let overallTrend = 'stable';
  if (decliningCount >= 2) overallTrend = 'fatiguing';
  else if (improvingCount >= 2) overallTrend = 'recovering';

  return {
    hrv: hrvTrend,
    restingHR: rhrTrend,
    sleep: sleepTrend,
    overallTrend,
    alerts,
  };
}

/**
 * Analyze workout trends over a time window.
 * Returns volume, discipline balance, effort, and intensity trends.
 */
export function analyzeWorkoutTrends(completedWorkouts, daysBack = 14) {
  if (!completedWorkouts || completedWorkouts.length === 0) {
    return {
      weeklyVolume: null,
      disciplineBalance: {},
      avgEffort: {},
      intensityTrend: 'stable',
      volumeTrend: 'stable',
      alerts: [],
    };
  }

  const now = Date.now();
  const cutoff = now - daysBack * 24 * 60 * 60 * 1000;
  const recent = completedWorkouts.filter(
    (w) => w.startDate && new Date(w.startDate).getTime() >= cutoff
  );

  const thisWeekCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = recent.filter((w) => new Date(w.startDate).getTime() >= thisWeekCutoff);
  const lastWeek = recent.filter(
    (w) =>
      new Date(w.startDate).getTime() >= cutoff && new Date(w.startDate).getTime() < thisWeekCutoff
  );

  const thisWeekMinutes = sumMinutes(thisWeek);
  const lastWeekMinutes = sumMinutes(lastWeek);

  const disciplineBalance = {};
  const effortByDiscipline = {};
  recent.forEach((w) => {
    const d = w.discipline || 'other';
    disciplineBalance[d] = (disciplineBalance[d] || 0) + 1;
    if (w.effortScore) {
      if (!effortByDiscipline[d]) effortByDiscipline[d] = [];
      effortByDiscipline[d].push(w.effortScore);
    }
  });

  const avgEffort = {};
  Object.entries(effortByDiscipline).forEach(([d, scores]) => {
    avgEffort[d] = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10;
  });

  let volumeTrend = 'stable';
  if (lastWeekMinutes > 0) {
    const ratio = thisWeekMinutes / lastWeekMinutes;
    if (ratio > 1.2) volumeTrend = 'increasing';
    else if (ratio < 0.8) volumeTrend = 'decreasing';
  }

  const thisWeekEfforts = thisWeek.map((w) => w.effortScore).filter(Boolean);
  const lastWeekEfforts = lastWeek.map((w) => w.effortScore).filter(Boolean);
  const thisAvgEffort = thisWeekEfforts.length > 0 ? avg(thisWeekEfforts) : null;
  const lastAvgEffort = lastWeekEfforts.length > 0 ? avg(lastWeekEfforts) : null;

  let intensityTrend = 'stable';
  if (thisAvgEffort && lastAvgEffort) {
    if (thisAvgEffort > lastAvgEffort + 1) intensityTrend = 'increasing';
    else if (thisAvgEffort < lastAvgEffort - 1) intensityTrend = 'decreasing';
  }

  const alerts = [];
  if (volumeTrend === 'increasing' && thisWeekMinutes > lastWeekMinutes * 1.3) {
    alerts.push('Training volume spiked 30%+ — injury risk');
  }

  const triDisciplines = ['swim', 'bike', 'run'];
  triDisciplines.forEach((d) => {
    const count = disciplineBalance[d] || 0;
    if (count === 0 && daysBack >= 7) {
      alerts.push(`No ${d} sessions in ${daysBack} days`);
    }
  });

  return {
    weeklyVolume: {
      thisWeek: thisWeekMinutes,
      lastWeek: lastWeekMinutes,
      trend: volumeTrend,
    },
    disciplineBalance,
    avgEffort,
    intensityTrend,
    volumeTrend,
    alerts,
  };
}

/**
 * Generate a human-readable trend summary for coach context.
 */
export function generateTrendSummary(healthTrends, workoutTrends) {
  const parts = [];

  if (healthTrends) {
    const healthParts = [];
    if (healthTrends.hrv?.current) {
      healthParts.push(`HRV ${healthTrends.hrv.current}ms (${healthTrends.hrv.trend})`);
    }
    if (healthTrends.restingHR?.current) {
      healthParts.push(
        `RHR ${healthTrends.restingHR.current}bpm (${healthTrends.restingHR.trend})`
      );
    }
    if (healthTrends.sleep?.current) {
      healthParts.push(`Sleep ${healthTrends.sleep.current}h (${healthTrends.sleep.trend})`);
    }
    if (healthParts.length > 0) {
      parts.push(`Health: ${healthParts.join(', ')}. Overall: ${healthTrends.overallTrend}.`);
    }
  }

  if (workoutTrends?.weeklyVolume) {
    const vol = workoutTrends.weeklyVolume;
    parts.push(
      `Volume: ${Math.round(vol.thisWeek / 60)}h this week vs ${Math.round(vol.lastWeek / 60)}h last week (${vol.trend}).`
    );
  }

  if (workoutTrends?.disciplineBalance) {
    const balance = Object.entries(workoutTrends.disciplineBalance)
      .map(([d, c]) => `${d}: ${c}`)
      .join(', ');
    parts.push(`Sessions: ${balance}.`);
  }

  const allAlerts = [...(healthTrends?.alerts || []), ...(workoutTrends?.alerts || [])];
  if (allAlerts.length > 0) {
    parts.push(`Alerts: ${allAlerts.join('; ')}.`);
  }

  return parts.join(' ') || 'Insufficient data for trend analysis.';
}

// --- Internal Helpers ---

function computeMetricTrend(recent, older, key, direction) {
  const recentVals = recent.map((d) => d[key]).filter((v) => v !== null && v !== undefined);
  const olderVals = older.map((d) => d[key]).filter((v) => v !== null && v !== undefined);

  if (recentVals.length === 0) return null;

  const current = recentVals[recentVals.length - 1];
  const avg7d = avg(recentVals);
  const avg14d = olderVals.length > 0 ? avg([...olderVals, ...recentVals]) : avg7d;

  let trend = 'stable';
  if (olderVals.length > 0) {
    const olderAvg = avg(olderVals);
    const diff = avg7d - olderAvg;
    const threshold = olderAvg * 0.05; // 5% change threshold

    if (direction === 'higher_better') {
      if (diff > threshold) trend = 'improving';
      else if (diff < -threshold) trend = 'declining';
    } else {
      if (diff < -threshold) trend = 'improving';
      else if (diff > threshold) trend = 'declining';
    }
  }

  return {
    current: Math.round(current * 10) / 10,
    avg7d: Math.round(avg7d * 10) / 10,
    avg14d: Math.round(avg14d * 10) / 10,
    trend,
  };
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function sumMinutes(workouts) {
  return workouts.reduce((sum, w) => sum + (w.durationMinutes || 0), 0);
}
