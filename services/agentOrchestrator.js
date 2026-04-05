/**
 * Agent Orchestrator — routes athlete messages through LLM tool-calling.
 *
 * The Hammer 2.1 model receives tool schemas and decides which tool to call
 * based on the athlete's message. The orchestrator executes the selected skill
 * and returns the result (preview/confirm flow for destructive actions,
 * direct response for read-only actions).
 *
 * Falls back gracefully: if the model doesn't call a tool, returns the
 * text response. If the model isn't ready, throws ModelNotReadyError
 * for the caller to handle via existing keyword-based handlers.
 */

import { runToolInference } from './localModel';
import { COACH_TOOLS, TOOL_TO_EXECUTOR } from './toolSchemas';
import { executeSkillPreview, commitSkill, classifyConfirmation } from './skills/executor';
import { buildIdentitySection, COACH_CONSTRAINTS, COACH_KNOWLEDGE } from './agentConstitution';
import { sanitizeModelOutput } from './modelSanitizer';

/**
 * Process an athlete message through the agent loop.
 *
 * @param {string} userMessage - Athlete's message
 * @param {Object} context - Full app context (profile, weekPlan, callbacks, etc.)
 * @returns {string|Object|null} Response text, structured response, or null (fallback signal)
 */
export async function processMessage(userMessage, context) {
  // 1. Handle pending skill confirmation (yes/no to a preview)
  if (context.pendingAction) {
    return handleConfirmation(userMessage, context);
  }

  // 2. Build slim system prompt (no tool descriptions — they're passed structurally)
  const systemPrompt = buildAgentSystemPrompt(context);

  // 3. Run tool-calling inference
  const result = await runToolInference(systemPrompt, userMessage, COACH_TOOLS);

  // 4. If model called a tool → execute it
  if (result.toolCalls && result.toolCalls.length > 0) {
    return executeToolCall(result.toolCalls[0], userMessage, context);
  }

  // 5. No tool called → return text response (general coaching conversation)
  const text = result.text || null;
  return text ? sanitizeModelOutput(text) : null;
}

/**
 * Execute a tool call from the model.
 *
 * @param {Object} toolCall - Tool call from model ({ function: { name, arguments } })
 * @param {string} userMessage - Original athlete message
 * @param {Object} context - App context
 * @returns {string|Object|null} Response
 */
async function executeToolCall(toolCall, userMessage, context) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

  const executor = TOOL_TO_EXECUTOR[name];
  if (!executor) {
    // eslint-disable-next-line no-console
    console.warn(`[Agent] Unknown tool: ${name}`);
    return null;
  }

  // Execute skill preview with model-extracted args
  const preview = await executeSkillPreview(executor, userMessage, {
    ...context,
    extractedArgs: parsedArgs,
  });

  if (!preview) return null;

  // Skill signals fallback to existing handler
  if (preview.fallbackToHandler) return null;

  // Skill needs clarification
  if (preview.needsClarification) return preview.message;

  // Skill returned direct response (no confirmation needed)
  if (preview.directResponse) return preview.directResponse;

  // Skill returned a diff with confirmation required
  if (preview.diff) {
    const previewText = `Here's what would change:\n${preview.diff.table}\n${preview.diff.summary}\n\nShall I apply this?`;
    return { text: previewText, pendingAction: preview };
  }

  return null;
}

/**
 * Handle athlete's yes/no response to a pending skill action.
 */
async function handleConfirmation(userMessage, context) {
  const answer = classifyConfirmation(userMessage);
  if (answer === 'yes') {
    const msg = await commitSkill(context.pendingAction, context);
    return { text: msg, clearPending: true };
  }
  if (answer === 'no') {
    return { text: 'No changes made. Your plan stays as is.', clearPending: true };
  }
  return 'Would you like to apply the change? Just say yes or no.';
}

/**
 * Build a slim system prompt for the agent.
 *
 * Tool schemas are passed separately via the `tools` param in runToolInference,
 * so we don't describe them in text. This keeps the prompt under 1000 tokens,
 * leaving room for the model's reasoning and tool call output.
 *
 * ~800 tokens total: identity (~200) + constraints (~150) + knowledge (~300) + athlete (~150)
 */
function buildAgentSystemPrompt(context) {
  const identity = buildIdentitySection();
  const athleteContext = buildCompactAthleteContext(context);

  return `${identity}\n${COACH_CONSTRAINTS}\n${COACH_KNOWLEDGE}\n${athleteContext}`;
}

/**
 * Build compact athlete context for the system prompt.
 * Only includes non-null, relevant fields to save tokens.
 */
function buildCompactAthleteContext(context) {
  const parts = ['ATHLETE CONTEXT:'];
  const { athleteProfile, phase, daysToRace, readinessScore, todayWorkout, weekPlan } = context;

  if (athleteProfile) {
    if (athleteProfile.raceType) parts.push(`Race: ${athleteProfile.raceType}`);
    if (athleteProfile.distance) parts.push(`Distance: ${athleteProfile.distance}`);
    if (athleteProfile.weeklyHours) parts.push(`Hours/wk: ${athleteProfile.weeklyHours}`);
  }
  if (phase) parts.push(`Phase: ${phase}`);
  if (daysToRace != null) parts.push(`Days to race: ${daysToRace}`);
  if (readinessScore != null) parts.push(`Readiness: ${readinessScore}/100`);
  if (todayWorkout) {
    parts.push(`Today: ${todayWorkout.discipline} - ${todayWorkout.title || 'workout'}`);
  }
  if (context.weeklyTargets?.targets) {
    const t = context.weeklyTargets.targets;
    const c = context.weeklyConsistency?.byDiscipline || {};
    const targetStr = Object.entries(t)
      .map(([d, v]) => `${d[0].toUpperCase()}=${c[d]?.completed || 0}/${v.count}`)
      .join(' ');
    const pct = context.weeklyConsistency?.percentage ?? '?';
    parts.push(`Targets: ${targetStr} | ${pct}% consistency`);
  } else if (weekPlan) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const planStr = weekPlan.map((d, i) => `${days[i]}=${d}`).join(' ');
    parts.push(`Week: ${planStr}`);
  }

  return parts.join('\n');
}
