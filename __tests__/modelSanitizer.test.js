/**
 * Tests for the shared model output sanitizer.
 *
 * Validates that all forms of model garbage (JSON, ChatML tokens,
 * code blocks, tool schemas, garbled output) are caught and rejected,
 * while valid natural language passes through.
 */

import { sanitizeModelOutput } from '../services/modelSanitizer';

describe('sanitizeModelOutput', () => {
  // --- Valid natural language passes through ---
  it('passes through normal coaching text', () => {
    const text = 'Great work on your Zone 2 run today. Keep building that aerobic base!';
    expect(sanitizeModelOutput(text)).toBe(text);
  });

  it('passes through multi-sentence response', () => {
    const text =
      "Your readiness is at 72, which is solid for a BUILD phase. Today's Zone 2 run should feel comfortable. Focus on keeping your heart rate below 150bpm.";
    expect(sanitizeModelOutput(text)).toBe(text);
  });

  it('passes through response with numbers and special chars', () => {
    const text =
      "You've completed 4/5 sessions this week — 80% compliance. Your Z2 HR averaged 142bpm, right on target.";
    expect(sanitizeModelOutput(text)).toBe(text);
  });

  // --- JSON rejected ---
  it('rejects raw JSON object', () => {
    expect(
      sanitizeModelOutput('{"name": "set_schedule", "arguments": {"strengthDays": [1]}}')
    ).toBeNull();
  });

  it('rejects raw JSON array', () => {
    expect(sanitizeModelOutput('[{"day": 1, "discipline": "swim"}]')).toBeNull();
  });

  // --- ChatML tokens stripped ---
  it('strips ChatML tokens and returns clean text', () => {
    const text = '<|im_start|>assistant\nYour run looks great today.<|im_end|>';
    expect(sanitizeModelOutput(text)).toBe('Your run looks great today.');
  });

  it('rejects if only ChatML tokens remain', () => {
    expect(sanitizeModelOutput('<|im_start|>assistant<|im_end|>')).toBeNull();
  });

  it('strips endoftext token', () => {
    const text = 'Keep up the consistency!<|endoftext|>';
    expect(sanitizeModelOutput(text)).toBe('Keep up the consistency!');
  });

  // --- Code blocks stripped ---
  it('strips code blocks and rejects if nothing left', () => {
    expect(sanitizeModelOutput('```json\n{"name": "set_schedule"}\n```')).toBeNull();
  });

  it('strips code blocks but keeps surrounding text', () => {
    const text =
      'Here is the update:\n```json\n{"key": "val"}\n```\nLet me know if you want to proceed.';
    const result = sanitizeModelOutput(text);
    expect(result).toContain('Let me know');
    expect(result).not.toContain('```');
  });

  // --- Tool call patterns rejected ---
  it('rejects tool_call tags', () => {
    expect(
      sanitizeModelOutput('<tool_call>\n{"name": "adjust_load", "arguments": {}}\n</tool_call>')
    ).toBeNull();
  });

  it('rejects tool schema fragments', () => {
    expect(
      sanitizeModelOutput('"type": "function", "function": {"name": "set_schedule"}')
    ).toBeNull();
  });

  it('rejects response containing tool name as JSON', () => {
    expect(
      sanitizeModelOutput('{"name": "swap_workout", "arguments": {"reason": "tired"}}')
    ).toBeNull();
  });

  // --- Code patterns rejected ---
  it('rejects function declarations', () => {
    expect(sanitizeModelOutput('function handleSwap() { return true; }')).toBeNull();
  });

  it('rejects const declarations', () => {
    expect(sanitizeModelOutput('const result = await runInference(prompt);')).toBeNull();
  });

  it('rejects arrow functions', () => {
    expect(sanitizeModelOutput('const fn = () => { return data; }')).toBeNull();
  });

  it('rejects import statements', () => {
    expect(sanitizeModelOutput("import { tools } from './toolSchemas';")).toBeNull();
  });

  it('rejects console.log', () => {
    expect(sanitizeModelOutput('console.log("debug output here")')).toBeNull();
  });

  // --- Edge cases ---
  it('returns null for null input', () => {
    expect(sanitizeModelOutput(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(sanitizeModelOutput(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeModelOutput('')).toBeNull();
  });

  it('returns null for very short text', () => {
    expect(sanitizeModelOutput('ok')).toBeNull();
  });

  it('returns null for garbled output (mostly symbols)', () => {
    expect(sanitizeModelOutput('` ` ` ` ` ` ` ` `')).toBeNull();
  });

  it('returns null for whitespace-only after cleaning', () => {
    expect(sanitizeModelOutput('<|im_end|>   <|im_start|>system')).toBeNull();
  });
});
