/**
 * trend_recommendation Skill Executor
 *
 * Analyzes recent training trends and health data to generate actionable
 * plan modification recommendations. Uses existing trendAnalysis and
 * workoutScoring functions — no LLM inference required.
 *
 * Follows preview/confirm flow:
 *   1. Analyze trends (completed vs prescribed, discipline balance, health)
 *   2. Generate structured recommendations
 *   3. Preview — show recommendations with plan diff
 *   4. Commit — apply approved changes
 */

import { analyzeWorkoutTrends, analyzeHealthTrends } from '../trendAnalysis';
import { analyzeDisciplineGaps } from '../workoutScoring';
import { getWeeklyDisciplinePlan, countDisciplineTouches } from '../localModel';
import { DAY_NAMES, formatPlanDiff } from './setSchedule';

/**
 * Generate structured recommendations from trend data.
 *
 * @param {Object} workoutTrends - From analyzeWorkoutTrends
 * @param {Object} healthTrends - From analyzeHealthTrends
 * @param {Object} disciplineGaps - From analyzeDisciplineGaps
 * @param {string[]} currentPlan - Current 7-day plan
 * @param {Object} profile - Athlete profile
 * @returns {Array<{ type, action, reason, scheduleChange? }>}
 */
function generateRecommendations(
  workoutTrends,
  healthTrends,
  disciplineGaps,
  currentPlan,
  profile
) {
  const recommendations = [];

  // Discipline rebalance: missed disciplines
  if (disciplineGaps?.underTrained) {
    for (const disc of disciplineGaps.underTrained) {
      const gap = disciplineGaps.gaps?.[disc] || 1;
      const swapCandidate = findSwapCandidate(currentPlan, disc, profile);
      if (swapCandidate) {
        recommendations.push({
          type: 'discipline_rebalance',
          action: 'swap',
          reason: `You missed ${gap} ${disc} session${gap > 1 ? 's' : ''} recently. Consider adding ${disc} on ${DAY_NAMES[swapCandidate.day]}.`,
          scheduleChange: { day: swapCandidate.day, from: swapCandidate.current, to: disc },
        });
      }
    }
  }

  // Volume spike warning
  if (workoutTrends?.volumeTrend === 'increasing') {
    const hasSpike = (workoutTrends.alerts || []).some((a) => a.includes('spiked'));
    if (hasSpike) {
      recommendations.push({
        type: 'volume_adjustment',
        action: 'reduce',
        reason:
          'Training volume spiked 30%+ this week. Consider a lighter week to avoid injury risk.',
      });
    }
  }

  // Health-based recovery
  if (healthTrends?.overallTrend === 'fatiguing') {
    const alerts = (healthTrends.alerts || []).join('; ');
    recommendations.push({
      type: 'recovery',
      action: 'add_rest',
      reason: `Health metrics trending down (${alerts || 'fatigue signals detected'}). Consider adding an extra rest day or reducing intensity.`,
    });
  }

  // Consistency recognition
  if (workoutTrends?.thisWeekSessions >= 5) {
    recommendations.push({
      type: 'recognition',
      action: 'none',
      reason: `Strong consistency — ${workoutTrends.thisWeekSessions} sessions completed this week.`,
    });
  }

  return recommendations;
}

/**
 * Find a day in the plan that could be swapped for an under-represented discipline.
 *
 * @param {string[]} plan - Current 7-day plan
 * @param {string} targetDisc - Discipline that needs more representation
 * @param {Object} profile - Athlete profile
 * @returns {{ day: number, current: string }|null}
 */
function findSwapCandidate(plan, targetDisc, profile) {
  const counts = countDisciplineTouches(plan);
  const prefs = profile?.schedulePreferences || {};
  const protectedDays = new Set([...(prefs.restDays || []), ...(prefs.avoidDays || [])]);

  for (let day = 0; day < 7; day++) {
    if (protectedDays.has(day)) continue;
    const current = plan[day];
    if (current === 'rest' || current.includes('+') || current === 'brick') continue;
    if (current === targetDisc) continue;
    // Only swap from over-represented disciplines
    if (counts[current] > (profile?.weeklyHours === '5-7' ? 2 : 3)) {
      return { day, current };
    }
  }
  return null;
}

/**
 * Preview — analyze trends and generate recommendations with plan diff.
 */
export async function preview(userMessage, context) {
  const { athleteProfile, phase, weekPlan, completedWorkouts, workoutHistory, healthData } =
    context;

  const workouts = completedWorkouts?.length ? completedWorkouts : workoutHistory || [];

  // Run existing analysis functions
  const workoutTrends = analyzeWorkoutTrends(workouts);
  const healthTrends = healthData ? analyzeHealthTrends(healthData) : null;
  const disciplineGaps = analyzeDisciplineGaps(workouts);

  const recommendations = generateRecommendations(
    workoutTrends,
    healthTrends,
    disciplineGaps,
    weekPlan,
    athleteProfile
  );

  if (recommendations.length === 0) {
    return {
      directResponse:
        'Your training is well balanced. No adjustments needed right now. Keep up the consistency!',
    };
  }

  // Build schedule changes from actionable recommendations
  const scheduleChanges = {};
  for (const rec of recommendations) {
    if (rec.scheduleChange) {
      // Convert swap to schedule preference format
      // For now, use the first actionable recommendation
      if (!scheduleChanges.strengthDays && rec.scheduleChange.to === 'strength') {
        scheduleChanges.strengthDays = [rec.scheduleChange.day];
      }
    }
  }

  // Compute plan diff if there are schedule changes
  let diff = null;
  let updatedProfile = athleteProfile;
  if (Object.keys(scheduleChanges).length > 0) {
    const existing = athleteProfile.schedulePreferences || {};
    updatedProfile = {
      ...athleteProfile,
      schedulePreferences: { ...existing, ...scheduleChanges },
    };
    const proposedPlan = getWeeklyDisciplinePlan(phase, updatedProfile);
    diff = formatPlanDiff(weekPlan, proposedPlan);
  }

  // Format recommendations as text
  const recText = recommendations.map((r, i) => `${i + 1}. ${r.reason}`).join('\n');

  const hasActionable = recommendations.some((r) => r.scheduleChange);

  if (!hasActionable || !diff || diff.table === 'No changes detected.') {
    return {
      directResponse: `Training analysis:\n${recText}`,
    };
  }

  return {
    diff,
    recommendations,
    updatedProfile,
    executor: 'trendRecommendation',
  };
}

/**
 * Commit — apply approved schedule changes from trend recommendations.
 */
export async function commit(pendingAction, context) {
  const { onProfileUpdate } = context;
  if (!onProfileUpdate) {
    return 'Unable to save changes — profile update not available.';
  }
  await onProfileUpdate(pendingAction.updatedProfile);

  const count = pendingAction.recommendations?.filter((r) => r.scheduleChange).length || 0;
  return `Applied ${count} training adjustment${count !== 1 ? 's' : ''}. Your plan has been updated based on recent trends.`;
}
