/**
 * Skill Registry — Anthropic-style skill definitions for on-device AI coach.
 *
 * Each skill follows a 3-level progressive disclosure:
 *   Level 1 (name + description): Always in system prompt — tells model WHEN to use it.
 *   Level 2 (instructions): Loaded when skill is activated — full workflow steps.
 *   Level 3 (references): Loaded on demand during execution.
 *
 * Skills are the authoritative runtime capabilities. agentConstitution.js
 * re-exports these for backward compatibility.
 */

export const SKILL_REGISTRY = [
  {
    name: 'set_schedule',
    description:
      'Update weekly training schedule preferences. Use when athlete says "move strength to Monday", "rest on Friday", "swim days to TTS", "long sessions on weekends", or any request to change which days they train specific disciplines.',
    triggers: ['schedule_preference'],
    confirmationRequired: true,
    executor: 'setSchedule',
    instructions: `## Workflow: Update Schedule Preference
### Step 1: Extract Intent
Parse the athlete's message to identify schedule changes.
Valid params: restDays, longDays, avoidDays, strengthDays (arrays of day indices 0=Sun..6=Sat), swimDays ("mwf"|"tts"), weekendPreference ("bike-sat-run-sun"|"run-sat-bike-sun").

### Step 2: Validate
- At least one valid param must be present
- Day indices must be 0-6
- swimDays must be "mwf" or "tts"
- weekendPreference must be "bike-sat-run-sun" or "run-sat-bike-sun"

### Step 3: Preview
- Compute current weekPlan from profile
- Compute proposed weekPlan with merged preferences
- Show diff: only changed days with discipline labels
- Show one-line explanation of what changes

### Step 4: Confirm
- Wait for athlete yes/no
- Yes: persist to profile, clear today's workout cache
- No: discard, acknowledge`,
    references: {
      dayMap: {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      },
    },
  },
  {
    name: 'swap_workout',
    description:
      'Replace today\'s workout with a different one. Use when athlete says "different workout", "can\'t do this", "something else", "swap today\'s workout", or requests an alternative session.',
    triggers: ['workout_swap', 'workout_modification'],
    confirmationRequired: false,
    executor: 'swapWorkout',
  },
  {
    name: 'adjust_load',
    description:
      'Temporarily reduce or increase training load for 3-7 days. Use when athlete mentions fatigue, injury, wanting easier or harder sessions, needing extra rest, or feeling overtrained.',
    triggers: ['load_adjustment'],
    confirmationRequired: false,
    executor: 'adjustLoad',
  },
  {
    name: 'update_training_plan',
    description:
      'Update race date, distance, or race type. Use when athlete says "change my race", "new race date", "switch to half ironman", "my race is on [date]".',
    triggers: ['profile_change'],
    confirmationRequired: false,
    executor: 'updatePlan',
  },
  {
    name: 'read_health_data',
    description:
      "Read athlete's health metrics and readiness score. Use when athlete asks about readiness, recovery, HRV, sleep quality, or heart rate trends.",
    triggers: ['readiness_inquiry', 'recovery'],
    confirmationRequired: false,
    executor: 'readHealth',
  },
  {
    name: 'trend_recommendation',
    description:
      'Analyze workout trends and health data to recommend plan adjustments. Use when athlete asks "how am I doing", "weekly review", "analyze my training", "am I on track", or triggered automatically on Sunday evening.',
    triggers: ['trend_analysis', 'weekly_review'],
    confirmationRequired: true,
    executor: 'trendRecommendation',
    instructions: `## Workflow: Trend-Based Plan Recommendation
### Step 1: Analyze
- Compare completed workouts (last 14 days) vs prescribed plan
- Check discipline balance (swim/bike/run counts)
- Check health trends (HRV, RHR, sleep)

### Step 2: Generate Recommendations
- Discipline gaps: suggest swaps to rebalance
- Volume spikes: suggest recovery
- Health decline: suggest rest day
- Each recommendation is a structured action

### Step 3: Preview
- Show recommendations with reasoning
- Show plan diff for actionable changes
- Wait for confirmation

### Step 4: Confirm
- Apply approved changes to schedule preferences
- Clear today's workout cache for regeneration`,
  },
];

/**
 * Level 1: Brief summaries for system prompt (always loaded).
 * Equivalent to YAML frontmatter description in Anthropic skill standard.
 */
export function buildSkillSummaries() {
  return SKILL_REGISTRY.map((s) => `- ${s.name}: ${s.description}`).join('\n');
}

/**
 * Level 2: Full instructions for an activated skill.
 */
export function getSkillInstructions(skillName) {
  const skill = SKILL_REGISTRY.find((s) => s.name === skillName);
  return skill?.instructions || null;
}

/**
 * Find a skill by its trigger intent category.
 */
export function findSkillByTrigger(category) {
  return SKILL_REGISTRY.find((s) => s.triggers.includes(category)) || null;
}
