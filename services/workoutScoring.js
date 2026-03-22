/**
 * Workout scoring and readiness calculation service.
 * Pure functions — no AsyncStorage, no side effects.
 */

/**
 * Calculate completion score for a completed workout.
 * Returns 0-100 or null if no valid data.
 */
export function calculateCompletionScore(completedWorkout) {
  if (!completedWorkout) return null;
  if (completedWorkout.discipline === 'rest') return 100;
  const { completedSets, totalSets } = completedWorkout;
  if (!totalSets || totalSets === 0) return null;
  return Math.round((completedSets / totalSets) * 100);
}

/**
 * Find workouts completed yesterday from history.
 */
export function findYesterdayWorkouts(workoutHistory) {
  if (!workoutHistory || workoutHistory.length === 0) return [];
  const yesterday = getYesterdayDateString();
  return workoutHistory.filter((w) => {
    if (!w.completedAt) return false;
    return new Date(w.completedAt).toDateString() === yesterday;
  });
}

/**
 * Get yesterday's date as a Date.toDateString() format.
 */
export function getYesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toDateString();
}

/**
 * Average completion score over the last N days.
 * Returns 0-100 or null if no history.
 */
export function calculateRecentComplianceScore(workoutHistory, daysBack = 7) {
  if (!workoutHistory || workoutHistory.length === 0) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  const recent = workoutHistory.filter((w) => {
    if (!w.completedAt) return false;
    return new Date(w.completedAt) >= cutoff;
  });

  if (recent.length === 0) return null;

  const scores = recent.map((w) => calculateCompletionScore(w)).filter((s) => s !== null);

  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

/**
 * Score how well the athlete's training aligns with their race timeline.
 * Returns 0-100.
 */
export function calculateRacePreparationScore(phase, daysToRace, complianceScore) {
  let phaseScore = 0;
  let consistencyScore = 0;
  let timeBufferScore = 0;

  // Phase appropriateness (0-40)
  phaseScore = getPhaseAppropriateness(phase, daysToRace);

  // Consistency from compliance (0-35)
  const compliance = complianceScore ?? 50;
  consistencyScore = Math.round((compliance / 100) * 35);

  // Time buffer (0-25)
  timeBufferScore = getTimeBufferScore(daysToRace);

  return clamp(phaseScore + consistencyScore + timeBufferScore, 0, 100);
}

function getPhaseAppropriateness(phase, daysToRace) {
  if (daysToRace === null || daysToRace === undefined) return 20;
  const weeksOut = Math.ceil(daysToRace / 7);

  const idealPhase = getIdealPhase(weeksOut);
  if (phase === idealPhase) return 40;

  const phaseOrder = ['RACE_WEEK', 'TAPER', 'PEAK', 'BUILD', 'BASE'];
  const actualIdx = phaseOrder.indexOf(phase);
  const idealIdx = phaseOrder.indexOf(idealPhase);
  const distance = Math.abs(actualIdx - idealIdx);
  return Math.max(40 - distance * 12, 10);
}

function getIdealPhase(weeksOut) {
  if (weeksOut < 2) return 'RACE_WEEK';
  if (weeksOut < 6) return 'TAPER';
  if (weeksOut < 12) return 'PEAK';
  if (weeksOut < 20) return 'BUILD';
  return 'BASE';
}

function getTimeBufferScore(daysToRace) {
  if (daysToRace === null || daysToRace === undefined) return 15;
  if (daysToRace < 7) return 5;
  if (daysToRace < 30) return 15;
  if (daysToRace < 90) return 20;
  return 25;
}

/**
 * Composite readiness: health (40%) + compliance (35%) + race prep (25%).
 * Returns 0-100.
 *
 * Null defaults are 40 (not 50) — unknown state should not inflate the score.
 * A user with no data gets ~40/100, signalling "insufficient data" rather than "neutral".
 */
export function calculateOverallReadiness(healthReadiness, complianceScore, racePreparationScore) {
  const health = healthReadiness ?? 40;
  const compliance = complianceScore ?? 40;
  const racePrep = racePreparationScore ?? 40;

  const overall = Math.round(health * 0.4 + compliance * 0.35 + racePrep * 0.25);
  return clamp(overall, 0, 100);
}

/**
 * Human-readable feedback for a completion score.
 */
export function getCompletionFeedback(completionScore) {
  if (completionScore === null || completionScore === undefined) {
    return { label: 'No data', message: 'No workout yesterday' };
  }
  if (completionScore >= 90) {
    return { label: 'Crushed it!', message: 'Outstanding execution yesterday. Keep it up!' };
  }
  if (completionScore >= 75) {
    return { label: 'Solid session', message: 'Good work getting through the key sets.' };
  }
  if (completionScore >= 50) {
    return {
      label: 'Room to push harder',
      message: 'You showed up — now aim to finish more sets.',
    };
  }
  return {
    label: 'Consistency is key',
    message: 'Every session counts. Try to complete more tomorrow.',
  };
}

/**
 * Find completed workouts from Apple Health that occurred yesterday.
 */
export function findYesterdayCompletedWorkouts(completedWorkouts) {
  if (!completedWorkouts || completedWorkouts.length === 0) return [];
  const yesterday = getYesterdayDateString();
  return completedWorkouts.filter((w) => {
    if (!w.startDate) return false;
    return new Date(w.startDate).toDateString() === yesterday;
  });
}

/**
 * Find completed workouts from Apple Health across the last N days including today.
 * Returns workouts grouped by date: [{ dateLabel, dateString, workouts }]
 */
export function findRecentCompletedWorkouts(completedWorkouts, daysBack = 3) {
  if (!completedWorkouts || completedWorkouts.length === 0) return [];

  const days = [];
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dateString = d.toDateString();
    const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`;
    const workouts = completedWorkouts.filter(
      (w) => w.startDate && new Date(w.startDate).toDateString() === dateString
    );
    if (workouts.length > 0) {
      days.push({ dateLabel: label, dateString, workouts });
    }
  }
  return days;
}

/**
 * Score how well yesterday's Apple Health activity matched the prescribed workout.
 * Compares discipline match and duration ratio.
 * Returns 0-100 or null if no data.
 */
export function calculateDailyComplianceScore(prescribedWorkout, completedWorkouts) {
  if (!prescribedWorkout) return null;
  if (prescribedWorkout.discipline === 'rest') {
    return !completedWorkouts || completedWorkouts.length === 0 ? 100 : 80;
  }
  if (!completedWorkouts || completedWorkouts.length === 0) return null;

  const matching = completedWorkouts.filter((w) => w.discipline === prescribedWorkout.discipline);

  if (matching.length === 0) return 20;

  const totalMinutes = matching.reduce((sum, w) => sum + (w.durationMinutes || 0), 0);
  const prescribedMinutes = prescribedWorkout.duration || 60;
  const durationRatio = Math.min(totalMinutes / prescribedMinutes, 1.5);

  const disciplineScore = 50;
  const durationScore = Math.round(durationRatio * 50);

  return clamp(disciplineScore + durationScore, 0, 100);
}

/**
 * Score recent activity from Apple Health over the last N days.
 * Considers session count and discipline variety.
 * Returns 0-100 or null if no data.
 */
export function calculateRecentActivityScore(completedWorkouts, daysBack = 7) {
  if (!completedWorkouts || completedWorkouts.length === 0) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  const recent = completedWorkouts.filter((w) => {
    if (!w.startDate) return false;
    return new Date(w.startDate) >= cutoff;
  });

  if (recent.length === 0) return null;

  const expectedSessions = Math.round((daysBack / 7) * 5);
  const sessionScore = Math.min(recent.length / expectedSessions, 1) * 60;

  const disciplines = new Set(recent.map((w) => w.discipline).filter(Boolean));
  const varietyScore = Math.min(disciplines.size / 3, 1) * 40;

  return clamp(Math.round(sessionScore + varietyScore), 0, 100);
}

/**
 * Analyze which disciplines are under-trained based on Apple Health data.
 * Returns an object with counts, gaps, and underTrained disciplines.
 */
export function analyzeDisciplineGaps(completedWorkouts, requiredDisciplines, daysBack = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  const recent = (completedWorkouts || []).filter((w) => {
    if (!w.startDate) return false;
    return new Date(w.startDate) >= cutoff;
  });

  const counts = {};
  (requiredDisciplines || []).forEach((d) => {
    counts[d] = 0;
  });
  recent.forEach((w) => {
    if (w.discipline && counts[w.discipline] !== undefined) {
      counts[w.discipline] += 1;
    }
  });

  const gaps = {};
  const underTrained = [];
  const activeDisciplines = (requiredDisciplines || []).filter(
    (d) => d !== 'rest' && d !== 'strength'
  );

  activeDisciplines.forEach((d) => {
    const expected = Math.round((daysBack / 7) * 2);
    const actual = counts[d] || 0;
    const deficit = expected - actual;
    if (deficit > 0) {
      gaps[d] = deficit;
      underTrained.push(d);
    }
  });

  return { counts, gaps, underTrained };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
