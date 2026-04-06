/**
 * read_health_data Skill Executor — thin wrapper.
 * Health data queries fall through to the AI model via chatService.
 */

export async function preview() {
  return { fallbackToHandler: true };
}

export async function commit() {
  // No-op
}
