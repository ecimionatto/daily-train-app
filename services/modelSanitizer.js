/**
 * Model output sanitizer — strips leaked tokens, code, and raw JSON.
 *
 * On-device models (especially tool-calling models like Hammer 2.1)
 * sometimes emit ChatML tokens, raw JSON tool calls, code blocks,
 * or schema fragments instead of natural language. This module catches
 * those artifacts and returns null (triggering fallback) rather than
 * showing garbage to the user.
 *
 * Applied at every model output boundary:
 * - agentOrchestrator.js (tool-calling text responses)
 * - chatService.js (text-only inference fallback)
 */

/**
 * Sanitize raw model text output.
 *
 * @param {string} text - Raw model text output
 * @returns {string|null} Cleaned text, or null if not natural language
 */
export function sanitizeModelOutput(text) {
  if (!text || typeof text !== 'string') return null;

  // Strip ChatML tokens
  let cleaned = text
    .replace(/<\|im_start\|>[^\n]*/g, '')
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\|endoftext\|>/g, '')
    .replace(/<\|end\|>/g, '')
    .trim();

  // Strip code blocks (```...```) and all backtick markers (`, ``, ```)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '').trim();
  cleaned = cleaned.replace(/`{1,3}/g, '').trim();

  // Strip markdown headers (# ## ###) — keep the text
  cleaned = cleaned.replace(/^#{1,3}\s+/gm, '').trim();

  // Strip leaked system prompt instructions (model echoing its constraints)
  // Bracket-enclosed instructions first (before individual patterns break bracket content)
  cleaned = cleaned
    .replace(/\[[^\]]*(?:under|below)\s+\d+\s+words[^\]]*\]/g, '')
    .replace(/\b[Kk]eep\s+(?:response|it)\s+(?:under|below)\s+\d+\s+words\.?/g, '')
    .replace(/\b[Kk]eep\s+it\s+under\s+\d+\s+words\.?/g, '')
    .replace(/\bNEVER\s+fabricate\b[^.]*\./g, '')
    .trim();

  // Strip tool_call tags and contents
  cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

  // Reject if the response is raw JSON (starts with { or [)
  if (/^\s*[{[]/.test(cleaned)) return null;

  // Reject if it looks like a tool call or schema
  if (/"type"\s*:\s*"function"/.test(cleaned)) return null;
  if (/"function"\s*:\s*\{/.test(cleaned)) return null;
  if (/tool_call/.test(cleaned)) return null;
  if (
    /"name"\s*:\s*"(set_schedule|swap_workout|adjust_load|update_plan|analyze_trends)"/.test(
      cleaned
    )
  )
    return null;

  // Reject if it looks like code
  if (/^(function|const|let|var|import|export)\s/.test(cleaned)) return null;
  if (/=>\s*\{/.test(cleaned)) return null;
  if (/console\.(log|warn|error)/.test(cleaned)) return null;

  // Reject if too short after cleaning (model produced only tokens/whitespace)
  if (cleaned.length < 5) return null;

  // Reject if mostly non-word characters (garbled output)
  const words = cleaned.split(/\s+/).filter((w) => /[a-zA-Z]{2,}/.test(w));
  if (words.length < 3) return null;

  return cleaned;
}
