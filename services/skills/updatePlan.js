/**
 * update_training_plan Skill Executor — thin wrapper.
 * Delegates to existing handleProfileChange in chatService.js via fallback.
 * No confirmation required — executes directly.
 */

export async function preview() {
  return { fallbackToHandler: true };
}

export async function commit() {
  // No-op — non-confirmation skills commit during preview
}
