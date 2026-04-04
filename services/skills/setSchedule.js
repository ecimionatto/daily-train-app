/**
 * set_schedule Skill Executor
 *
 * Follows the 4-step Anthropic workflow:
 *   1. Extract intent (AI structured extraction with keyword fallback)
 *   2. Validate extracted params
 *   3. Preview — compute plan diff WITHOUT persisting
 *   4. Commit — persist after athlete confirms
 */

import { getWeeklyDisciplinePlan, validatePlanConstraints } from '../localModel';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Step 1: Extract schedule change intent from athlete message.
 * Uses keyword-based parsing (reliable on-device; no model dependency).
 *
 * @param {string} message - Raw athlete message
 * @returns {Object} Parsed intents (restDays, strengthDays, swimDays, weekendPreference, etc.)
 */
function extractIntent(message) {
  const lower = message.toLowerCase();
  const days = parseDaysFromMessage(lower);
  const intents = {};

  // Rest day intents
  const restKeywords = [
    'rest on',
    'day off',
    'no training',
    'rest day',
    'avoid training',
    'move rest',
    'change rest',
  ];
  if (restKeywords.some((kw) => lower.includes(kw))) {
    intents.restDays = days;
  }

  // Long session intents
  const longKeywords = [
    'long session',
    'long run',
    'long ride',
    'long swim',
    'endurance on',
    'long on',
    'long workout',
  ];
  if (longKeywords.some((kw) => lower.includes(kw))) {
    intents.longDays = days;
  }

  // Avoid day intents
  const avoidKeywords = ['avoid', 'skip', 'no workout', 'free on'];
  if (avoidKeywords.some((kw) => lower.includes(kw))) {
    intents.avoidDays = days;
  }

  // Strength day intents (broad matching for natural phrasings)
  const strengthKeywords = [
    'strength on',
    'strength to',
    'move strength',
    'move my strength',
    'change strength',
    'change my strength',
    'strength training on',
    'strength training to',
    'strength workout on',
    'strength workout to',
    'weights on',
    'weights to',
    'move weights',
    'move my weights',
    'gym on',
    'gym to',
    'gym day',
    'lifting on',
    'lifting to',
    'strength day',
    'strength session',
  ];
  if (strengthKeywords.some((kw) => lower.includes(kw))) {
    intents.strengthDays = days;
  }

  // Weekend preference
  const weekendSwapKeywords = [
    'bike saturday',
    'bike on saturday',
    'run saturday',
    'run on saturday',
    'bike sunday',
    'bike on sunday',
    'run sunday',
    'run on sunday',
    'swap weekend',
    'flip weekend',
  ];
  for (const kw of weekendSwapKeywords) {
    if (lower.includes(kw)) {
      if (
        lower.includes('run saturday') ||
        lower.includes('run on saturday') ||
        lower.includes('bike sunday') ||
        lower.includes('bike on sunday')
      ) {
        intents.weekendPreference = 'run-sat-bike-sun';
      } else {
        intents.weekendPreference = 'bike-sat-run-sun';
      }
      break;
    }
  }

  // Swim day preference
  const swimDayKeywords = [
    'swim monday',
    'swim wednesday',
    'swim friday',
    'swim mon',
    'swim wed',
    'swim fri',
    'swim tuesday',
    'swim thursday',
    'swim tue',
    'swim thu',
    'swim on monday',
    'swim on tuesday',
    'swim on wednesday',
    'swim on thursday',
    'swim on friday',
    'move swim',
    'change swim days',
    'swim days',
  ];
  if (swimDayKeywords.some((kw) => lower.includes(kw))) {
    if (
      lower.includes('tue') ||
      lower.includes('thu') ||
      lower.includes('tuesday') ||
      lower.includes('thursday')
    ) {
      intents.swimDays = 'tts';
    } else if (
      lower.includes('mon') ||
      lower.includes('wed') ||
      lower.includes('fri') ||
      lower.includes('monday') ||
      lower.includes('wednesday') ||
      lower.includes('friday')
    ) {
      intents.swimDays = 'mwf';
    }
  }

  return intents;
}

/**
 * Parse day references from message text.
 * Returns array of day indices (0=Sunday, 6=Saturday).
 */
function parseDaysFromMessage(lower) {
  const found = [];

  if (lower.includes('weekend')) {
    found.push(0, 6);
  }
  if (lower.includes('weekday')) {
    found.push(1, 2, 3, 4, 5);
  }

  for (const [name, index] of Object.entries(DAY_MAP)) {
    if (lower.includes(name) && !found.includes(index)) {
      found.push(index);
    }
  }

  return found;
}

/**
 * Step 2: Validate extracted intents.
 *
 * @param {Object} intents
 * @returns {{ valid: boolean, reason?: string }}
 */
function validate(intents) {
  if (!intents || Object.keys(intents).length === 0) {
    return { valid: false, reason: 'no_intent' };
  }

  for (const [key, val] of Object.entries(intents)) {
    if (Array.isArray(val)) {
      if (val.length === 0) return { valid: false, reason: 'no_days' };
      if (val.some((d) => d < 0 || d > 6)) return { valid: false, reason: 'invalid_day' };
    }
    if (key === 'swimDays' && !['mwf', 'tts'].includes(val)) {
      return { valid: false, reason: 'invalid_swim_days' };
    }
    if (key === 'weekendPreference' && !['bike-sat-run-sun', 'run-sat-bike-sun'].includes(val)) {
      return { valid: false, reason: 'invalid_weekend_preference' };
    }
  }

  return { valid: true };
}

/**
 * Format a human-readable plan diff.
 *
 * @param {string[]} current - Current 7-day plan (Sun=0..Sat=6)
 * @param {string[]} proposed - Proposed 7-day plan
 * @returns {{ table: string, summary: string }}
 */
export function formatPlanDiff(current, proposed) {
  const changes = [];
  for (let i = 0; i < 7; i++) {
    if (current[i] !== proposed[i]) {
      changes.push(`${DAY_NAMES[i]}: ${current[i]} → ${proposed[i]}`);
    }
  }
  if (changes.length === 0) {
    return { table: 'No changes detected.', summary: '' };
  }
  return {
    table: changes.join(' | '),
    summary: `${changes.length} day${changes.length > 1 ? 's' : ''} adjusted.`,
  };
}

/**
 * Step 3: Preview — compute the plan diff WITHOUT persisting.
 *
 * @param {string} userMessage
 * @param {Object} context - Must include athleteProfile, phase, weekPlan
 * @returns {Object} Preview result with diff, intents, updatedProfile, proposedPlan
 */
export async function preview(userMessage, context) {
  const { athleteProfile, phase, weekPlan } = context;

  // Use model-extracted args if available (from agent tool-calling), else keyword parsing
  const intents = context.extractedArgs || extractIntent(userMessage);
  const validation = validate(intents);

  if (!validation.valid) {
    return {
      needsClarification: true,
      message:
        "Could you specify which days? For example: 'move strength to Monday' or 'rest on Friday'.",
    };
  }

  const currentPlan = weekPlan;
  const existing = athleteProfile.schedulePreferences || {};
  const mergedPreferences = { ...existing, ...intents };
  const updatedProfile = {
    ...athleteProfile,
    schedulePreferences: mergedPreferences,
  };

  const proposedPlan = getWeeklyDisciplinePlan(phase, updatedProfile);
  const planValidation = validatePlanConstraints(proposedPlan, athleteProfile);
  const diff = formatPlanDiff(currentPlan, proposedPlan);

  if (diff.table === 'No changes detected.') {
    return {
      needsClarification: false,
      directResponse: 'Your schedule already matches that configuration. No changes needed!',
    };
  }

  // If constraints are violated after auto-repair in applySchedulePreferences,
  // include a note about what was adjusted
  const reasoning = [];
  if (!planValidation.valid) {
    for (const v of planValidation.violations) {
      if (v.type === 'undercount') {
        reasoning.push(`${v.discipline}: only ${v.actual}x (need ${v.required}x)`);
      } else if (v.type === 'consecutive') {
        reasoning.push(
          `${v.discipline} back-to-back on ${DAY_NAMES[v.day - 1]}-${DAY_NAMES[v.day]}`
        );
      }
    }
  }

  return {
    diff,
    intents,
    updatedProfile,
    proposedPlan,
    executor: 'setSchedule',
    reasoning,
  };
}

/**
 * Step 4: Commit — persist the schedule change after confirmation.
 *
 * @param {Object} pendingAction - Contains updatedProfile from preview phase
 * @param {Object} context - Must include onProfileUpdate callback
 * @returns {string} Confirmation message
 */
export async function commit(pendingAction, context) {
  const { onProfileUpdate } = context;
  if (!onProfileUpdate) {
    return 'Unable to save changes — profile update not available.';
  }
  await onProfileUpdate(pendingAction.updatedProfile);
  return 'Schedule updated! Your training plan has been adjusted. Check the Plan screen to see your new weekly layout.';
}
