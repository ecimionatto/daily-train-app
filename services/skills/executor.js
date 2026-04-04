/**
 * Skill Executor Engine — orchestrates parse → route → preview → confirm → commit.
 *
 * Central entry point for skill-based handling. The ChatContext passes messages
 * through here; if a skill handles the message, the executor returns a structured
 * result. If not, the caller falls back to existing chatService handlers.
 */

import { findSkillByTrigger } from './registry';

const EXECUTORS = {
  setSchedule: () => require('./setSchedule'),
  swapWorkout: () => require('./swapWorkout'),
  adjustLoad: () => require('./adjustLoad'),
  updatePlan: () => require('./updatePlan'),
  readHealth: () => require('./readHealth'),
  trendRecommendation: () => require('./trendRecommendation'),
};

/**
 * Execute a skill's preview phase (does NOT persist changes).
 *
 * @param {string} executorName - Executor key from skill registry
 * @param {string} userMessage - Raw athlete message
 * @param {Object} context - Full app context (profile, weekPlan, callbacks, etc.)
 * @returns {Object|null} Preview result or null if executor not found
 */
export async function executeSkillPreview(executorName, userMessage, context) {
  const loader = EXECUTORS[executorName];
  if (!loader) return null;
  const executorModule = loader();
  if (!executorModule?.preview) return null;
  return executorModule.preview(userMessage, context);
}

/**
 * Execute a skill's commit phase (persists changes after confirmation).
 *
 * @param {Object} pendingAction - Action object from preview phase (contains executor, updatedProfile, etc.)
 * @param {Object} context - Full app context
 * @returns {string|null} Confirmation message or null
 */
export async function commitSkill(pendingAction, context) {
  const loader = EXECUTORS[pendingAction.executor];
  if (!loader) return null;
  const executorModule = loader();
  if (!executorModule?.commit) return null;
  return executorModule.commit(pendingAction, context);
}

/**
 * Classify a yes/no confirmation from the athlete.
 *
 * @param {string} message - Raw athlete message
 * @returns {'yes'|'no'|'ambiguous'}
 */
export function classifyConfirmation(message) {
  const lower = message.toLowerCase().trim();
  const yes = [
    'yes',
    'yeah',
    'yep',
    'sure',
    'ok',
    'okay',
    'go ahead',
    'do it',
    'confirm',
    'looks good',
    'perfect',
    "let's do it",
    'apply',
    'save',
  ];
  const no = ['no', 'nah', 'nope', 'cancel', 'never mind', 'forget it', "don't", 'stop'];
  if (yes.some((w) => lower.includes(w))) return 'yes';
  if (no.some((w) => lower.includes(w))) return 'no';
  return 'ambiguous';
}

/**
 * Route intent category through skill system.
 * Returns the skill if found, null otherwise.
 *
 * @param {string} category - Intent category from classifyMessage
 * @returns {Object|null} Skill definition or null
 */
export function resolveSkill(category) {
  return findSkillByTrigger(category);
}
