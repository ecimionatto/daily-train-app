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
  if (hrvTrend?.trend === 'declining') alerts.push('HRV declining — possible fatigue accumulation');
  if (rhrTrend?.trend === 'declining')
    alerts.push('Resting HR elevated — recovery may be impaired');
  if (sleepTrend?.trend === 'declining') alerts.push('Sleep trending down — prioritize rest');

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

// ---------------------------------------------------------------------------
// PACE INSIGHTS & ACHIEVEMENT DETECTION
// ---------------------------------------------------------------------------

const PACE_DISCIPLINES = ['run'];
const DISTANCE_DISCIPLINES = ['run', 'bike', 'swim'];

/**
 * Format pace in min/km as "M:SS /km".
 */
function formatPace(minPerKm) {
  if (!minPerKm || minPerKm <= 0) return null;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')} /km`;
}

/**
 * Scan completedWorkouts and derive pace PRs, distance PRs, and streak info.
 *
 * Returns an object with:
 * - pacePRs:       { run: { value, date, formatted } }  — best (lowest) pace per discipline
 * - distancePRs:   { run, bike, swim }  — longest distance in metres
 * - longestSession: { discipline, durationMinutes, date }
 * - consistencyStreak: number of consecutive days with any workout (from most recent backwards)
 * - recentPRs:     array of PRs set in the last 30 days (for congratulations)
 */
export function detectPaceAchievements(completedWorkouts) {
  if (!completedWorkouts || completedWorkouts.length === 0) {
    return {
      pacePRs: {},
      distancePRs: {},
      longestSession: null,
      consistencyStreak: 0,
      recentPRs: [],
    };
  }

  const sorted = [...completedWorkouts].sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );

  const pacePRs = {};
  const distancePRs = {};
  let longestSession = null;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentPRs = [];

  sorted.forEach((w) => {
    const disc = w.discipline;
    const wDate = w.startDate ? new Date(w.startDate) : null;

    // Pace PRs (lower = faster = better) — run only (pace is meaningful for running)
    if (PACE_DISCIPLINES.includes(disc) && w.avgPace && w.avgPace > 0) {
      const prev = pacePRs[disc];
      if (!prev || w.avgPace < prev.value) {
        pacePRs[disc] = { value: w.avgPace, date: wDate, formatted: formatPace(w.avgPace) };
        if (wDate && wDate.getTime() >= thirtyDaysAgo) {
          recentPRs.push({
            type: 'pace',
            discipline: disc,
            formatted: formatPace(w.avgPace),
            date: wDate,
          });
        }
      }
    }

    // Distance PRs (longer = better)
    if (DISTANCE_DISCIPLINES.includes(disc) && w.distanceMeters && w.distanceMeters > 0) {
      const prev = distancePRs[disc];
      if (!prev || w.distanceMeters > prev.value) {
        distancePRs[disc] = {
          value: w.distanceMeters,
          date: wDate,
          km: Math.round(w.distanceMeters / 100) / 10,
        };
        if (wDate && wDate.getTime() >= thirtyDaysAgo) {
          recentPRs.push({
            type: 'distance',
            discipline: disc,
            formatted: `${Math.round(w.distanceMeters / 100) / 10} km`,
            date: wDate,
          });
        }
      }
    }

    // Longest single session (by duration)
    if (!longestSession || (w.durationMinutes || 0) > (longestSession.durationMinutes || 0)) {
      longestSession = { discipline: disc, durationMinutes: w.durationMinutes, date: wDate };
    }
  });

  // Consistency streak — count consecutive days (backwards from today) with at least one workout
  const workoutDates = new Set(
    sorted.map((w) => w.startDate && new Date(w.startDate).toDateString()).filter(Boolean)
  );
  let streak = 0;
  const check = new Date();
  check.setHours(0, 0, 0, 0);
  while (workoutDates.has(check.toDateString())) {
    streak += 1;
    check.setDate(check.getDate() - 1);
  }

  return { pacePRs, distancePRs, longestSession, consistencyStreak: streak, recentPRs };
}

/**
 * Format achievement data into a compact text block for coach system prompt injection.
 * Kept ≤ 150 chars per line to preserve token budget.
 *
 * @param {{ pacePRs, distancePRs, longestSession, consistencyStreak, recentPRs }} achievements
 * @returns {string}
 */
export function formatAchievementsForCoach(achievements) {
  if (!achievements) return '';

  const lines = [];

  if (achievements.consistencyStreak >= 3) {
    lines.push(
      `Consistency streak: ${achievements.consistencyStreak} days in a row — congratulate this.`
    );
  }

  Object.entries(achievements.pacePRs).forEach(([disc, pr]) => {
    if (pr?.formatted) {
      lines.push(`Best ${disc} pace (all-time): ${pr.formatted}`);
    }
  });

  Object.entries(achievements.distancePRs).forEach(([disc, dr]) => {
    if (dr?.km) {
      lines.push(`Longest ${disc} (all-time): ${dr.km} km`);
    }
  });

  if (achievements.recentPRs.length > 0) {
    const prLabels = achievements.recentPRs
      .slice(-3) // cap at 3 to save tokens
      .map((p) => `${p.discipline} ${p.type} PR (${p.formatted})`)
      .join(', ');
    lines.push(`RECENT PRs (last 30 days — acknowledge and congratulate): ${prLabels}`);
  }

  if (lines.length === 0) return '';
  return `ATHLETE ACHIEVEMENTS:\n${lines.join('\n')}`;
}
