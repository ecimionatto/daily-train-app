/**
 * Reasoning Harness — Structured prompt templates for on-device AI.
 *
 * The Hammer 2.1 1.5B model is strong at tool-calling but weak at
 * multi-step reasoning. These templates pre-compute all analysis
 * deterministically and present the model with a structured decision
 * frame where it only narrates results in a coaching voice.
 *
 * Each builder returns a string for use with runInference().
 * Token budgets: plan proposal ~400, weekly check-in ~250, daily discipline ~200.
 */

/**
 * Build prompt for narrating a plan proposal after history analysis.
 * ~400 tokens. Model explains plan in 3-4 sentences, asks for confirmation.
 *
 * @param {Object} analysis - Output of analyzeTrainingHistory()
 * @param {Object} proposedTargets - targets object from generateWeeklyTargets().targets
 * @param {string} phase - Training phase (BASE, BUILD, PEAK, TAPER, RACE_WEEK)
 * @returns {string} Prompt string
 */
export function buildPlanProposalPrompt(analysis, proposedTargets, phase) {
  const hoursPerWeek = analysis.avgMinutesPerWeek
    ? (analysis.avgMinutesPerWeek / 60).toFixed(1)
    : '?';
  const disc = analysis.disciplinePerWeek || {};
  const gaps = (analysis.gaps || []).join(', ') || 'none';
  const strengths = (analysis.strengths || []).join(', ') || 'none';

  const targetLines = Object.entries(proposedTargets)
    .map(([d, v]) => `${d}: ${v.count}x/wk (${v.totalMinutes}min)`)
    .join(', ');

  return `HISTORY (pre-computed):
Sessions/wk: ${analysis.avgSessionsPerWeek || 0} | Hours/wk: ${hoursPerWeek}
Discipline/wk: Swim=${disc.swim || 0} Bike=${disc.bike || 0} Run=${disc.run || 0} Str=${disc.strength || 0}
Consistency: ${analysis.avgConsistency || 0}% (${analysis.trend || 'unknown'})
Gaps: ${gaps} | Strengths: ${strengths}

PROPOSED PLAN:
Phase: ${phase} | ${targetLines}

TASK: Explain this plan to the athlete in 3-4 sentences. Mention what you observed in their history, the proposed targets, and ask if they'd like to confirm.`;
}

/**
 * Build prompt for weekly check-in narration.
 * ~250 tokens. Model gives 2-sentence progress update.
 *
 * @param {Object} consistency - Output of calculateWeeklyConsistencyScore()
 * @param {number|null} readiness - Overall readiness score 0-100
 * @returns {string} Prompt string
 */
export function buildWeeklyCheckInPrompt(consistency, readiness) {
  if (!consistency)
    return 'WEEK: No data available.\n\nTASK: Tell the athlete you need more training data to provide a weekly update.';

  const discLines = Object.entries(consistency.byDiscipline || {})
    .map(([d, v]) => `${d[0].toUpperCase()}=${v.completed}/${v.target}`)
    .join(' ');

  return `WEEK PROGRESS:
${discLines}
Consistency: ${consistency.percentage}% | Key sessions: ${consistency.keyWorkoutsHit}/${consistency.totalKeyWorkouts}
Readiness: ${readiness ?? '?'}/100

TASK: Give a 2-sentence weekly update. If consistency <70% encourage and suggest priority discipline. If >85% congratulate. Reference specific numbers.`;
}

/**
 * Build prompt for daily discipline selection explanation.
 * ~200 tokens. Model explains today's recommended focus in 1-2 sentences.
 *
 * @param {Object} remaining - Remaining sessions needed per discipline { swim: 1, bike: 2, ... }
 * @param {string} dayName - Day of week name (e.g., "Monday")
 * @param {string} discipline - Selected discipline for today
 * @param {number|null} readiness - Readiness score 0-100
 * @returns {string} Prompt string
 */
export function buildDailyDisciplinePrompt(remaining, dayName, discipline, readiness) {
  const remainingLines = Object.entries(remaining || {})
    .filter(([, v]) => v > 0)
    .map(([d, v]) => `${d}: ${v} left`)
    .join(', ');

  return `REMAINING THIS WEEK: ${remainingLines || 'all targets met'}
TODAY: ${dayName} | RECOMMENDED: ${discipline} | READINESS: ${readiness ?? '?'}/100

TASK: Explain today's recommended workout focus in 1-2 sentences. Reference why this discipline was chosen based on remaining targets and readiness.`;
}
