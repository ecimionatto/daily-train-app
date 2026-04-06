/**
 * analyzeHistory skill — Analyze 30 days of Apple Health data and propose
 * an adaptive training plan. Preview shows analysis + proposed targets.
 * Commit saves confirmed targets to athlete profile.
 *
 * Follows the preview/commit pattern from trendRecommendation.js.
 */

import { analyzeTrainingHistory, formatHistorySummary } from '../historyAnalyzer';
import { generateWeeklyTargets, runInference } from '../localModel';
import { sanitizeModelOutput } from '../modelSanitizer';
import { buildPlanProposalPrompt } from '../reasoningHarness';

const NARRATION_SYSTEM = 'You are DTrain, an on-device triathlon coach. Narrate concisely.';

/**
 * Format targets as a readable diff table.
 * @param {Object} weeklyTargets - Output of generateWeeklyTargets()
 * @returns {string} Formatted target lines
 */
function formatTargetsDiff(weeklyTargets) {
  if (!weeklyTargets?.targets) return 'No targets available.';
  return Object.entries(weeklyTargets.targets)
    .map(
      ([disc, data]) =>
        `${disc.charAt(0).toUpperCase() + disc.slice(1)}: ${data.count}x/week (${data.totalMinutes}min)`
    )
    .join('\n');
}

/**
 * Preview — analyze history, generate targets, narrate with AI fallback.
 * Returns a confirmation-required response with proposed plan changes.
 */
export async function preview(userMessage, context) {
  const { athleteProfile, phase, completedWorkouts } = context;

  // 1. Analyze history (deterministic)
  const analysis = analyzeTrainingHistory(completedWorkouts || [], 30);

  // 2. Generate targets (deterministic)
  const weeklyTargets = generateWeeklyTargets(phase || 'BASE', athleteProfile, analysis);

  // 3. Build narration prompt
  const prompt = buildPlanProposalPrompt(analysis, weeklyTargets?.targets || {}, phase || 'BASE');

  // 4. Get AI narration (optional — falls back to formatted summary)
  let narration;
  try {
    const raw = await runInference(NARRATION_SYSTEM, prompt);
    narration = sanitizeModelOutput(raw);
  } catch {
    // Fallback to deterministic summary
  }
  narration = narration || formatHistorySummary(analysis);

  // 5. Return preview (confirmation required)
  return {
    diff: {
      table: formatTargetsDiff(weeklyTargets),
      summary: narration,
    },
    proposedTargets: weeklyTargets,
    updatedProfile: {
      ...athleteProfile,
      lastAnalysis: analysis,
      lastAnalysisDate: new Date().toISOString(),
    },
    executor: 'analyzeHistory',
  };
}

/**
 * Commit — save confirmed targets and analysis to athlete profile.
 */
export async function commit(pendingAction, context) {
  const { onProfileUpdate } = context;
  if (onProfileUpdate && pendingAction.updatedProfile) {
    await onProfileUpdate(pendingAction.updatedProfile);
  }
  return 'Plan confirmed and saved. Your weekly targets are now active.';
}
