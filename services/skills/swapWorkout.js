/**
 * swap_workout Skill Executor — thin wrapper.
 * Delegates to existing handleWorkoutSwap in chatService.js via fallback.
 * No confirmation required — executes directly.
 */

/**
 * Preview returns a fallback signal so chatService uses its existing handler.
 */
export async function preview() {
  return { fallbackToHandler: true };
}

export async function commit() {
  // No-op — non-confirmation skills commit during preview
}
