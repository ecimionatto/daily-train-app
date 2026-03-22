/**
 * backupService.js — Remote Backup & Restore Interface (Phase 2)
 *
 * This module defines the contract for the future paid cloud backup feature.
 * All functions are no-op stubs. Phase 2 will replace the implementation
 * without changing the public API surface.
 *
 * PAID FEATURE SCOPE (Phase 2):
 * - Remote storage of athleteProfile, workoutHistory, chatConversation
 * - Restore to new device with a single sign-in
 * - More sophisticated AI coach tips powered by server-side context (longer
 *   history, population comparisons, periodisation analytics)
 * - Premium subscription gate: check `isBackupEnabled()` before all calls
 *
 * BACKEND CHOICES (decide in Phase 2 — keep this file backend-agnostic):
 *   Option A: Supabase (Postgres + Auth + Storage, open source)
 *   Option B: Firebase (Firestore + Auth, fully managed)
 *   Option C: Custom REST API + JWT auth
 *
 * DATA KEYS to sync (mirrors AsyncStorage keys):
 *   - 'athleteProfile'    → athlete preferences, HR profile, plan config
 *   - 'workoutHistory'    → AI-generated workout log
 *   - 'chatConversation'  → coach conversation history
 *   (completedWorkouts are NOT stored remotely — they live in Apple Health)
 *
 * RESTORE FLOW:
 *   1. User signs in on new device
 *   2. App calls restoreFromCloud(userId) → returns all keys
 *   3. App writes each key to AsyncStorage (overwriting any local data)
 *   4. App triggers a full reload (profile, health data, workouts)
 */

// ---------------------------------------------------------------------------
// SUBSCRIPTION STATE
// ---------------------------------------------------------------------------

/**
 * Check whether the user has an active paid backup subscription.
 * Phase 2: validate against remote subscription API / App Store receipt.
 *
 * @returns {Promise<boolean>}
 */
export async function isBackupEnabled() {
  // Stub: always false until Phase 2 subscription is implemented
  return false;
}

// ---------------------------------------------------------------------------
// BACKUP
// ---------------------------------------------------------------------------

/**
 * Back up athlete data to remote storage.
 * Called automatically after saveProfile, saveWorkoutHistory, etc.
 * No-op if backup is not enabled.
 *
 * @param {{ athleteProfile: object, workoutHistory: Array, chatConversation: Array }} data
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function backupToCloud(_data) {
  // Stub: Phase 2 will POST data to backend, keyed by authenticated userId
  return { success: false, error: 'Backup not enabled — Phase 2 feature' };
}

/**
 * Trigger an incremental backup of a single key.
 * More efficient than a full backup for frequent updates.
 *
 * @param {string} key - AsyncStorage key name
 * @param {*} value - Serialisable value to back up
 * @returns {Promise<{ success: boolean }>}
 */
export async function backupKey(_key, _value) {
  // Stub
  return { success: false };
}

// ---------------------------------------------------------------------------
// RESTORE
// ---------------------------------------------------------------------------

/**
 * Restore all backed-up data for a given user from remote storage.
 * Returns a map of AsyncStorage key → value for the caller to persist.
 *
 * USAGE in AppContext (Phase 2):
 *   const restored = await restoreFromCloud(userId);
 *   if (restored) {
 *     await AsyncStorage.multiSet(Object.entries(restored));
 *     await loadProfile(); // reload from AsyncStorage
 *   }
 *
 * @param {string} userId - Authenticated user ID
 * @returns {Promise<Record<string, string> | null>} Restored key→value pairs, or null
 */
export async function restoreFromCloud(_userId) {
  // Stub: Phase 2 will fetch from backend using userId
  return null;
}

// ---------------------------------------------------------------------------
// ACCOUNT
// ---------------------------------------------------------------------------

/**
 * Sign in / authenticate the user for cloud backup.
 * Phase 2: implement with chosen auth provider (Sign In with Apple preferred).
 *
 * @param {{ provider: 'apple' | 'email', credentials?: object }} options
 * @returns {Promise<{ userId: string | null, error?: string }>}
 */
export async function signInForBackup(_options) {
  // Stub
  return { userId: null, error: 'Authentication not implemented yet' };
}

/**
 * Sign out and clear the remote session.
 * Local AsyncStorage data is NOT cleared.
 *
 * @returns {Promise<void>}
 */
export async function signOutFromBackup() {
  // Stub
}

/**
 * Get the current backup status for display in the UI.
 *
 * @returns {Promise<{ enabled: boolean, lastBackup: string | null, userId: string | null }>}
 */
export async function getBackupStatus() {
  return { enabled: false, lastBackup: null, userId: null };
}
