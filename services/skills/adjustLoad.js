/**
 * adjust_load Skill Executor — thin wrapper.
 * Delegates to existing handleLoadAdjustment in chatService.js via fallback.
 * No confirmation required — executes directly.
 */

export async function preview() {
  return { fallbackToHandler: true };
}

export async function commit() {
  // No-op — non-confirmation skills commit during preview
}
