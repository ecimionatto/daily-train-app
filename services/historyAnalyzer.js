/**
 * historyAnalyzer.js — 30-day training history analysis engine.
 * Pure functions. No side effects, no AsyncStorage, no LLM calls.
 * Takes completed workout data in, returns structured analysis out.
 */

import { WEEKLY_TARGETS } from './trainingHeuristics';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISCIPLINES = ['swim', 'bike', 'run', 'strength'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get Monday-aligned week boundaries for the analysis window.
 * @param {number} daysBack - Number of days to look back
 * @returns {Array<{start: Date, end: Date}>} Array of week boundaries (Mon-Sun)
 */
export function getWeekBoundaries(daysBack = 30) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const windowStart = new Date(now.getTime() - daysBack * MS_PER_DAY);
  windowStart.setHours(0, 0, 0, 0);

  // Find the first Monday on or after windowStart
  const startDay = windowStart.getDay(); // 0=Sun..6=Sat
  const daysUntilMonday = startDay === 0 ? 1 : startDay === 1 ? 0 : 8 - startDay;
  const firstMonday = new Date(windowStart.getTime() + daysUntilMonday * MS_PER_DAY);
  firstMonday.setHours(0, 0, 0, 0);

  const weeks = [];
  let current = new Date(firstMonday);

  while (current.getTime() + 6 * MS_PER_DAY <= now.getTime()) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current.getTime() + 6 * MS_PER_DAY);
    weekEnd.setHours(23, 59, 59, 999);
    weeks.push({ start: weekStart, end: weekEnd });
    current = new Date(current.getTime() + 7 * MS_PER_DAY);
  }

  return weeks;
}

/**
 * Filter workouts within the analysis window.
 * @param {Array} workouts - Completed workout objects
 * @param {number} daysBack - Number of days to look back
 * @returns {Array} Filtered workouts within window
 */
function filterByWindow(workouts, daysBack) {
  if (!workouts || workouts.length === 0) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  return workouts.filter((w) => {
    if (!w.startDate) return false;
    return new Date(w.startDate) >= cutoff;
  });
}

/**
 * Detect day-of-week training pattern.
 * A day is "typical" if the athlete trained on that day in >= 50% of analyzed weeks.
 * @param {Array} workouts - Filtered workouts
 * @param {Array} weeks - Week boundaries
 * @returns {{trainingDays: number[], restDays: number[]}}
 */
function detectDayPattern(workouts, weeks) {
  if (weeks.length === 0) {
    return { trainingDays: [], restDays: [0, 1, 2, 3, 4, 5, 6] };
  }

  const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // per day-of-week

  weeks.forEach(({ start, end }) => {
    const daysWithWorkout = new Set();
    workouts.forEach((w) => {
      const d = new Date(w.startDate);
      if (d >= start && d <= end) {
        daysWithWorkout.add(d.getDay());
      }
    });
    daysWithWorkout.forEach((day) => {
      dayCounts[day] += 1;
    });
  });

  const threshold = weeks.length * 0.5;
  const trainingDays = [];
  const restDays = [];

  for (let i = 0; i < 7; i++) {
    if (dayCounts[i] >= threshold) {
      trainingDays.push(i);
    } else {
      restDays.push(i);
    }
  }

  return { trainingDays, restDays };
}

/**
 * Count and sum minutes by discipline.
 * @param {Array} workouts - Filtered workouts
 * @returns {{counts: Object, minutes: Object}}
 */
function countByDiscipline(workouts) {
  const counts = { swim: 0, bike: 0, run: 0, strength: 0 };
  const minutes = { swim: 0, bike: 0, run: 0, strength: 0 };

  workouts.forEach((w) => {
    const d = w.discipline;
    if (d && counts[d] !== undefined) {
      counts[d] += 1;
      minutes[d] += w.durationMinutes || 0;
    }
  });

  return { counts, minutes };
}

/**
 * Infer volume tier from average weekly minutes.
 * @param {number} avgMinutesPerWeek
 * @returns {'5-7' | '8-10' | '11-14' | '15+'}
 */
function inferVolumeTier(avgMinutesPerWeek) {
  if (avgMinutesPerWeek > 840) return '15+';
  if (avgMinutesPerWeek > 600) return '11-14';
  if (avgMinutesPerWeek >= 420) return '8-10';
  return '5-7';
}

/**
 * Calculate weekly consistency scores.
 * For each week, count sessions matching target disciplines / total target sessions.
 * @param {Array} workouts - Filtered workouts
 * @param {Array} weeks - Week boundaries
 * @param {Object} targets - WEEKLY_TARGETS for the inferred tier
 * @returns {number[]} Consistency percentages per week (0-100)
 */
function calculateWeeklyConsistency(workouts, weeks, targets) {
  const totalTargetSessions = Object.values(targets).reduce((s, v) => s + v, 0);
  if (totalTargetSessions === 0) return weeks.map(() => 0);

  return weeks.map(({ start, end }) => {
    const weekWorkouts = workouts.filter((w) => {
      const d = new Date(w.startDate);
      return d >= start && d <= end;
    });

    // Count sessions per discipline (capped at target)
    const sessionsByDisc = { swim: 0, bike: 0, run: 0, strength: 0 };
    weekWorkouts.forEach((w) => {
      const d = w.discipline;
      if (d && sessionsByDisc[d] !== undefined) {
        sessionsByDisc[d] += 1;
      }
    });

    let completed = 0;
    DISCIPLINES.forEach((d) => {
      completed += Math.min(sessionsByDisc[d], targets[d] || 0);
    });

    const pct = Math.round((completed / totalTargetSessions) * 100);
    return Math.min(pct, 100);
  });
}

/**
 * Determine trend from consistency scores.
 * Compares first half vs second half average.
 * @param {number[]} weeklyConsistency
 * @returns {'improving' | 'declining' | 'stable'}
 */
function determineTrend(weeklyConsistency) {
  if (weeklyConsistency.length < 2) return 'stable';

  const mid = Math.floor(weeklyConsistency.length / 2);
  const firstHalf = weeklyConsistency.slice(0, mid);
  const secondHalf = weeklyConsistency.slice(mid);

  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  if (diff > 10) return 'improving';
  if (diff < -10) return 'declining';
  return 'stable';
}

/**
 * Calculate intensity distribution from effort scores.
 * effortScore <= 5 = easy, > 5 = hard.
 * @param {Array} workouts
 * @returns {{easyPct: number, hardPct: number}}
 */
function calculateIntensityDistribution(workouts) {
  const withEffort = workouts.filter((w) => w.effortScore !== null && w.effortScore !== undefined);

  if (withEffort.length === 0) {
    return { easyPct: 80, hardPct: 20 };
  }

  const easy = withEffort.filter((w) => w.effortScore <= 5).length;
  const hard = withEffort.length - easy;
  const total = withEffort.length;

  return {
    easyPct: Math.round((easy / total) * 100),
    hardPct: Math.round((hard / total) * 100),
  };
}

/**
 * Detect gaps (under-trained) and strengths (over-represented) disciplines.
 * @param {Object} disciplinePerWeek - Actual sessions per week per discipline
 * @param {Object} targets - WEEKLY_TARGETS for the inferred tier
 * @returns {{gaps: string[], strengths: string[]}}
 */
function detectGapsAndStrengths(disciplinePerWeek, targets) {
  const gaps = [];
  const strengths = [];

  DISCIPLINES.forEach((d) => {
    const actual = disciplinePerWeek[d] || 0;
    const target = targets[d] || 0;
    if (target > 0 && actual < target) {
      gaps.push(d);
    }
    if (target > 0 && actual > target * 1.5) {
      strengths.push(d);
    }
  });

  return { gaps, strengths };
}

/**
 * Analyze 30 days of training history from Apple Health data.
 *
 * @param {Array} completedWorkouts - Workout objects from fetchCompletedWorkouts()
 *   Each must have: { discipline, startDate, durationMinutes }
 *   Optional: { effortScore, avgHeartRate }
 * @param {number} daysBack - Analysis window in days (default 30)
 * @returns {Object} Structured training profile (see module JSDoc)
 */
export function analyzeTrainingHistory(completedWorkouts, daysBack = 30) {
  const filtered = filterByWindow(completedWorkouts, daysBack);
  const weeks = getWeekBoundaries(daysBack);
  const weeksAnalyzed = Math.max(weeks.length, 1);

  // Empty data defaults
  if (filtered.length === 0) {
    return buildEmptyResult(weeksAnalyzed);
  }

  // Day-of-week pattern
  const { trainingDays, restDays } = detectDayPattern(filtered, weeks);

  // Discipline breakdown
  const { counts: disciplineCounts, minutes: disciplineMinutes } = countByDiscipline(filtered);

  // Per-week averages
  const disciplinePerWeek = {};
  DISCIPLINES.forEach((d) => {
    disciplinePerWeek[d] = Math.round((disciplineCounts[d] / weeksAnalyzed) * 10) / 10;
  });

  // Session characteristics
  const avgDurationByDiscipline = {};
  const longestSessionByDiscipline = {};
  DISCIPLINES.forEach((d) => {
    const discWorkouts = filtered.filter((w) => w.discipline === d);
    if (discWorkouts.length > 0) {
      const totalMin = discWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0);
      avgDurationByDiscipline[d] = Math.round(totalMin / discWorkouts.length);
      longestSessionByDiscipline[d] = Math.max(...discWorkouts.map((w) => w.durationMinutes || 0));
    } else {
      avgDurationByDiscipline[d] = 0;
      longestSessionByDiscipline[d] = 0;
    }
  });

  // Volume
  const totalWorkouts = filtered.length;
  const totalMinutes = filtered.reduce((s, w) => s + (w.durationMinutes || 0), 0);
  const avgSessionsPerWeek = Math.round((totalWorkouts / weeksAnalyzed) * 10) / 10;
  const avgMinutesPerWeek = Math.round(totalMinutes / weeksAnalyzed);

  // Volume tier
  const inferredVolumeTierValue = inferVolumeTier(avgMinutesPerWeek);
  const targets = WEEKLY_TARGETS[inferredVolumeTierValue];

  // Consistency
  const weeklyConsistency = calculateWeeklyConsistency(filtered, weeks, targets);
  const avgConsistency =
    weeklyConsistency.length > 0
      ? Math.round(weeklyConsistency.reduce((s, v) => s + v, 0) / weeklyConsistency.length)
      : 0;
  const trend = determineTrend(weeklyConsistency);

  // Intensity
  const intensityDistribution = calculateIntensityDistribution(filtered);

  // Gaps and strengths
  const { gaps, strengths } = detectGapsAndStrengths(disciplinePerWeek, targets);

  return {
    trainingDays,
    restDays,
    avgSessionsPerWeek,
    avgMinutesPerWeek,
    disciplineCounts,
    disciplineMinutes,
    disciplinePerWeek,
    avgDurationByDiscipline,
    longestSessionByDiscipline,
    weeklyConsistency,
    avgConsistency,
    trend,
    intensityDistribution,
    inferredVolumeTier: inferredVolumeTierValue,
    gaps,
    strengths,
    totalWorkouts,
    totalMinutes,
    weeksAnalyzed,
  };
}

/**
 * Build empty/default result for zero-workout scenarios.
 * @param {number} weeksAnalyzed
 * @returns {Object}
 */
function buildEmptyResult(weeksAnalyzed) {
  const zeroDisciplines = { swim: 0, bike: 0, run: 0, strength: 0 };
  return {
    trainingDays: [],
    restDays: [0, 1, 2, 3, 4, 5, 6],
    avgSessionsPerWeek: 0,
    avgMinutesPerWeek: 0,
    disciplineCounts: { ...zeroDisciplines },
    disciplineMinutes: { ...zeroDisciplines },
    disciplinePerWeek: { ...zeroDisciplines },
    avgDurationByDiscipline: { ...zeroDisciplines },
    longestSessionByDiscipline: { ...zeroDisciplines },
    weeklyConsistency: [],
    avgConsistency: 0,
    trend: 'stable',
    intensityDistribution: { easyPct: 80, hardPct: 20 },
    inferredVolumeTier: '5-7',
    gaps: [],
    strengths: [],
    totalWorkouts: 0,
    totalMinutes: 0,
    weeksAnalyzed,
  };
}

/**
 * Format analysis result into a compact string for AI system prompt injection.
 * Target: ~200 tokens max.
 *
 * @param {Object} analysis - Result from analyzeTrainingHistory()
 * @returns {string} Compact summary string
 */
export function formatHistorySummary(analysis) {
  if (!analysis || analysis.totalWorkouts === 0) {
    return 'Training History (30d): No workout data available.';
  }

  const hoursPerWeek = (analysis.avgMinutesPerWeek / 60).toFixed(1);

  // Build day pattern string
  const trainingDayNames = analysis.trainingDays.map((d) => DAY_NAMES[d]).join('/');
  const restDayNames = analysis.restDays.map((d) => DAY_NAMES[d]).join('/');
  const patternStr = trainingDayNames
    ? `Pattern: ${trainingDayNames}, rest ${restDayNames}`
    : 'Pattern: irregular';

  // Discipline per week
  const dp = analysis.disciplinePerWeek;
  const discStr = `S=${dp.swim} B=${dp.bike} R=${dp.run} STR=${dp.strength}`;

  // Consistency + trend
  const consistencyStr = `${analysis.avgConsistency}% (${analysis.trend})`;

  // Gaps and strengths
  const gapStr = analysis.gaps.length > 0 ? analysis.gaps.join(', ') : 'none';
  const strengthStr = analysis.strengths.length > 0 ? analysis.strengths.join(', ') : 'none';

  return [
    `Training History (30d):`,
    `Sessions/wk: ${analysis.avgSessionsPerWeek} | Hours/wk: ${hoursPerWeek} | ${patternStr}`,
    `Discipline/wk: ${discStr}`,
    `Consistency: ${consistencyStr} | Tier: ${analysis.inferredVolumeTier}hrs`,
    `Gaps: ${gapStr} | Strengths: ${strengthStr}`,
  ].join('\n');
}
