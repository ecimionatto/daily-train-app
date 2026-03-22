import { Platform } from 'react-native';

let AppleHealthKit = null;

// HealthKit status tracking
let healthKitStatus = { initialized: false, error: null, available: false };

// Only import on iOS
if (Platform.OS === 'ios') {
  try {
    AppleHealthKit = require('react-native-health');
    if (AppleHealthKit && typeof AppleHealthKit.initHealthKit === 'function') {
      healthKitStatus.available = true;
      // eslint-disable-next-line no-console
      console.log('[HealthKit] Library loaded successfully');
    } else {
      healthKitStatus.error = 'react-native-health loaded but missing initHealthKit';
      // eslint-disable-next-line no-console
      console.log('[HealthKit] Library loaded but API missing:', Object.keys(AppleHealthKit || {}));
      AppleHealthKit = null;
    }
  } catch (e) {
    healthKitStatus.error = 'react-native-health library not available';
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Library not available:', e.message);
  }
}

/**
 * Get the current HealthKit initialization status.
 * Returns { initialized, error, available } for UI display.
 */
export function getHealthKitStatus() {
  return { ...healthKitStatus };
}

const HEALTH_PERMISSIONS = {
  permissions: {
    read: [
      'HeartRateVariability',
      'RestingHeartRate',
      'SleepAnalysis',
      'Workout',
      'HeartRate',
      'Vo2Max',
    ],
    write: ['Workout'],
  },
};

export async function initHealthKit() {
  if (!AppleHealthKit) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Not available on this platform');
    return false;
  }

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(HEALTH_PERMISSIONS, (err) => {
      if (err) {
        healthKitStatus = { ...healthKitStatus, initialized: false, error: String(err) };
        // eslint-disable-next-line no-console
        console.log('[HealthKit] Init failed:', err);
        resolve(false);
      } else {
        healthKitStatus = { ...healthKitStatus, initialized: true, error: null };
        // eslint-disable-next-line no-console
        console.log('[HealthKit] Initialized successfully');
        resolve(true);
      }
    });
  });
}

export async function fetchHealthData() {
  if (!AppleHealthKit) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Not available — no health data');
    return null;
  }

  try {
    const initialized = await initHealthKit();
    if (!initialized) {
      // eslint-disable-next-line no-console
      console.log('[HealthKit] Init failed — no health data');
      return null;
    }

    const [restingHR, hrv, sleep, vo2Max] = await Promise.all([
      getRestingHeartRate(),
      getHRV(),
      getSleepAnalysis(),
      getVO2Max(),
    ]);

    // eslint-disable-next-line no-console
    console.log('[HealthKit] Health data fetched:', { restingHR, hrv, sleepHours: sleep, vo2Max });
    return { restingHR, hrv, sleepHours: sleep, vo2Max };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Failed to fetch health data:', e.message || e);
    return null;
  }
}

/**
 * Diagnostic: run several HealthKit queries for RHR and return raw results.
 * Used to identify whether the issue is permissions, data format, or missing data.
 * Returns a plain object summarising each query's outcome.
 */
export async function diagnoseRHR() {
  if (!AppleHealthKit) return { error: 'HealthKit not available on this platform' };

  const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [samples, single, rawHR, hrv] = await Promise.all([
    // Test 1 — getRestingHeartRateSamples (array API)
    new Promise((resolve) => {
      AppleHealthKit.getRestingHeartRateSamples(
        { startDate, limit: 3, ascending: false },
        (err, data) => resolve({ api: 'getRestingHeartRateSamples', err: err || null, data })
      );
    }),
    // Test 2 — getRestingHeartRate (single-value API)
    new Promise((resolve) => {
      AppleHealthKit.getRestingHeartRate({ startDate, limit: 1, ascending: false }, (err, data) =>
        resolve({ api: 'getRestingHeartRate', err: err || null, data })
      );
    }),
    // Test 3 — raw HeartRate samples as fallback
    new Promise((resolve) => {
      AppleHealthKit.getHeartRateSamples(
        {
          startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          limit: 3,
          ascending: false,
        },
        (err, data) => resolve({ api: 'getHeartRateSamples', err: err || null, data })
      );
    }),
    // Test 4 — HRV
    new Promise((resolve) => {
      AppleHealthKit.getHeartRateVariabilitySamples(
        { startDate, limit: 3, ascending: false },
        (err, data) => resolve({ api: 'getHeartRateVariabilitySamples', err: err || null, data })
      );
    }),
  ]);

  return { samples, single, rawHR, hrv };
}

export async function fetchHealthHistory(days = 14) {
  if (!AppleHealthKit) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Not available — no health history');
    return [];
  }

  try {
    const initialized = await initHealthKit();
    if (!initialized) {
      // eslint-disable-next-line no-console
      console.log('[HealthKit] Init failed — no health history');
      return [];
    }

    const history = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const startDate = new Date(date.setHours(0, 0, 0, 0)).toISOString();
      const endDate = new Date(date.setHours(23, 59, 59, 999)).toISOString();

      const [rhr, hrvVal, sleepVal] = await Promise.all([
        getRestingHeartRateForDate(startDate, endDate),
        getHRVForDate(startDate, endDate),
        getSleepForDate(startDate, endDate),
      ]);

      history.push({
        date: startDate,
        restingHR: rhr,
        hrv: hrvVal,
        sleepHours: sleepVal,
      });
    }
    // eslint-disable-next-line no-console
    console.log(`[HealthKit] Fetched ${history.length} days of health history`);
    return history;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Failed to fetch health history:', e.message || e);
    return [];
  }
}

function getRestingHeartRate() {
  return new Promise((resolve) => {
    // RHR is a daily aggregate value written by Apple Watch.
    // Look back 60 days to maximise the chance of finding a recent reading.
    // Use getRestingHeartRateSamples (array API) — the single-value API has
    // inconsistent behavior across react-native-health versions.
    const options = {
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      limit: 1,
      ascending: false,
    };
    AppleHealthKit.getRestingHeartRateSamples(options, (err, results) => {
      // eslint-disable-next-line no-console
      console.log('[HealthKit] RHR result:', err, results);
      if (err || !results?.length) {
        resolve(null);
      } else {
        resolve(Math.round(results[0].value));
      }
    });
  });
}

function getHRV() {
  return new Promise((resolve) => {
    // HRV is measured overnight by Apple Watch (SDNN / RMSSD).
    // Look back 90 days and require explicit endDate — some native builds
    // ignore ascending:false without a bounded range.
    const options = {
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
      limit: 1,
      ascending: false,
    };
    AppleHealthKit.getHeartRateVariabilitySamples(options, (err, results) => {
      // eslint-disable-next-line no-console
      console.log('[HealthKit] HRV result:', err, results);
      if (err || !results?.length) {
        resolve(null);
      } else {
        // Native module returns value in seconds (SDNN) — convert to ms
        const raw = results[0].value;
        const valueMs = raw < 1 ? Math.round(raw * 1000) : Math.round(raw);
        // 0ms is not physiologically meaningful — treat as missing data
        resolve(valueMs > 0 ? valueMs : null);
      }
    });
  });
}

// iOS 16+ uses granular sleep stages. Sum all stages that represent actual sleep.
const SLEEP_STAGE_VALUES = new Set([
  'ASLEEP', // pre-iOS 16
  'CORE', // iOS 16+ light/core sleep
  'DEEP', // iOS 16+ deep sleep
  'REM', // iOS 16+ REM sleep
]);

function getSleepAnalysis() {
  return new Promise((resolve) => {
    // Look back 36 hours to catch late-night + early-morning sessions
    const options = {
      startDate: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
    };
    AppleHealthKit.getSleepSamples(options, (err, results) => {
      if (err || !results?.length) {
        resolve(null);
      } else {
        // Sum only actual sleep stages (not INBED/AWAKE) to get true sleep time
        let totalMs = 0;
        results.forEach((s) => {
          if (SLEEP_STAGE_VALUES.has(s.value)) {
            totalMs += new Date(s.endDate) - new Date(s.startDate);
          }
        });
        const hours = totalMs / (1000 * 60 * 60);
        resolve(hours > 0 ? Math.round(hours * 10) / 10 : null);
      }
    });
  });
}

function getVO2Max() {
  return new Promise((resolve) => {
    const options = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      limit: 1,
      ascending: false,
    };
    AppleHealthKit.getVo2MaxSamples(options, (err, results) => {
      if (err || !results?.length) {
        resolve(null);
      } else {
        resolve(Math.round(results[0].value * 10) / 10);
      }
    });
  });
}

function getRestingHeartRateForDate(startDate, endDate) {
  return new Promise((resolve) => {
    AppleHealthKit.getRestingHeartRateSamples(
      { startDate, endDate, limit: 1, ascending: false },
      (err, results) => {
        resolve(err || !results?.length ? null : Math.round(results[0].value));
      }
    );
  });
}

function getHRVForDate(startDate, endDate) {
  return new Promise((resolve) => {
    AppleHealthKit.getHeartRateVariabilitySamples(
      { startDate, endDate, limit: 1 },
      (err, results) => {
        resolve(err || !results?.length ? null : Math.round(results[0].value));
      }
    );
  });
}

function getSleepForDate(startDate, endDate) {
  return new Promise((resolve) => {
    AppleHealthKit.getSleepSamples({ startDate, endDate }, (err, results) => {
      if (err || !results?.length) {
        resolve(null);
      } else {
        let totalMs = 0;
        results.forEach((s) => {
          if (s.value === 'ASLEEP' || s.value === 'INBED') {
            totalMs += new Date(s.endDate) - new Date(s.startDate);
          }
        });
        resolve(Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10);
      }
    });
  });
}

/**
 * Readiness score algorithm (0-100).
 * Inputs: HRV (SDNN ms), resting HR (bpm), sleep hours.
 *
 * Design principles:
 * - Baseline 35: unknown state is below neutral — we need data to confirm readiness.
 * - Missing metric = 0 contribution: can't confirm readiness without measurement.
 * - Max score 100 requires exceptional values across ALL three metrics (rare).
 * - Typical well-recovered athlete lands 70-85; elite days push 85-95.
 *
 * Component budgets:  HRV 0-30 | RHR 0-25 | Sleep 0-15  →  max 105 → capped 100.
 */
export function calculateReadiness(data) {
  if (!data) return null;
  // No signal at all — cannot score
  if (data.hrv == null && data.restingHR == null && data.sleepHours == null) return null;

  let score = 35; // baseline: unknown/unconfirmed state

  // HRV (0-30 pts) — autonomic recovery indicator (SDNN ms)
  // Sports-science reference ranges for trained endurance athletes.
  // NULL = unknown recovery → 0 pts (can't confirm readiness).
  if (data.hrv != null) {
    if (data.hrv >= 100)
      score += 30; // exceptional — very well recovered
    else if (data.hrv >= 75)
      score += 23; // excellent
    else if (data.hrv >= 55)
      score += 16; // good
    else if (data.hrv >= 40)
      score += 9; // below average / moderate fatigue
    else score += 3; // low — significant fatigue signal
  }

  // Resting HR (0-25 pts) — chronically low = fitness; acutely elevated = fatigue
  // NULL = 0 pts.
  if (data.restingHR != null) {
    if (data.restingHR <= 44) score += 25;
    else if (data.restingHR <= 50) score += 20;
    else if (data.restingHR <= 56) score += 14;
    else if (data.restingHR <= 62) score += 7;
    else if (data.restingHR <= 70) score += 2;
    // > 70 bpm → 0 pts: significant concern
  }

  // Sleep (0-15 pts) — quantity (HealthKit doesn't expose quality score)
  // NULL = 0 pts.
  if (data.sleepHours != null) {
    if (data.sleepHours >= 8.5) score += 15;
    else if (data.sleepHours >= 7.5) score += 12;
    else if (data.sleepHours >= 7) score += 9;
    else if (data.sleepHours >= 6.5) score += 5;
    else if (data.sleepHours >= 6) score += 2;
    // < 6 hrs → 0 pts: sleep debt
  }

  return Math.min(100, Math.max(0, score));
}

// --- Apple Health Workout Reading ---

/**
 * Map HKWorkoutActivityType numeric codes to app discipline strings.
 */
const HEALTHKIT_WORKOUT_TYPE_MAP = {
  46: 'swim', // HKWorkoutActivityTypeSwimming
  13: 'bike', // HKWorkoutActivityTypeCycling
  37: 'run', // HKWorkoutActivityTypeRunning
  50: 'strength', // HKWorkoutActivityTypeFunctionalStrengthTraining
  20: 'strength', // HKWorkoutActivityTypeTraditionalStrengthTraining
  // walks, hikes, and other non-triathlon activities are intentionally excluded
};

const SUPPORTED_DISCIPLINES = new Set(['run', 'bike', 'swim', 'strength']);

/**
 * Map a HealthKit workout activity type to an app discipline.
 */
export function mapWorkoutType(hkActivityType) {
  return HEALTHKIT_WORKOUT_TYPE_MAP[hkActivityType] || 'other';
}

function mapWorkoutSample(sample) {
  // HealthKit native response uses 'start'/'end', not 'startDate'/'endDate'
  // Distance is in miles from the native module
  const startDate = sample.start || sample.startDate;
  const endDate = sample.end || sample.endDate;
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const durationMinutes = startMs && endMs ? Math.round((endMs - startMs) / 60000) : null;
  const distanceMeters = sample.distance ? Math.round(sample.distance * 1609.34) : null;

  // Apple Watch stores workout-level HR statistics on the HKWorkout record.
  // react-native-health surfaces this as maxHeartRate (bpm) when available.
  // This is the hardware-recorded peak — more accurate than periodic HR samples.
  const maxHeartRate = sample.maxHeartRate ? Math.round(sample.maxHeartRate) : null;

  return {
    id: sample.id || `hk_${startDate}`,
    discipline: mapWorkoutType(sample.activityId),
    activityName: sample.activityName || null,
    startDate,
    endDate,
    durationMinutes,
    calories: sample.calories ? Math.round(sample.calories) : null,
    distanceMeters,
    maxHeartRate,
    source: sample.sourceName || 'Apple Health',
  };
}

function getWorkoutSamples(startDate, endDate) {
  return new Promise((resolve) => {
    AppleHealthKit.getSamples({ startDate, endDate, type: 'Workout' }, (err, results) => {
      if (err || !results) {
        resolve([]);
      } else {
        resolve(results.map(mapWorkoutSample));
      }
    });
  });
}

// --- Heart Rate & Workout Enrichment ---

function getHeartRateSamples(startDate, endDate) {
  return new Promise((resolve) => {
    if (!AppleHealthKit || typeof AppleHealthKit.getHeartRateSamples !== 'function') {
      resolve([]);
      return;
    }
    AppleHealthKit.getHeartRateSamples({ startDate, endDate, ascending: true }, (err, results) => {
      if (err || !results) {
        resolve([]);
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * Fetch heart rate stats for a specific workout time window.
 *
 * HealthKit getHeartRateSamples returns ALL samples in the window — including
 * passive background readings (60-80 bpm) Apple Watch takes every few minutes.
 * Including those drags the workout average far below actual exercise HR.
 *
 * Fix: keep only samples at or above the exercise floor (100 bpm). If nothing
 * clears the floor (e.g. a genuine rest/yoga session), fall back to all samples
 * so we still return something rather than null.
 */
export async function fetchHeartRateForWorkout(startDate, endDate) {
  const samples = await getHeartRateSamples(startDate, endDate);
  if (!samples || samples.length === 0) return { avgHeartRate: null, maxHeartRate: null };

  const allValues = samples.map((s) => s.value).filter((v) => v > 0);
  if (allValues.length === 0) return { avgHeartRate: null, maxHeartRate: null };

  const EXERCISE_FLOOR_BPM = 100;
  const exerciseValues = allValues.filter((v) => v >= EXERCISE_FLOOR_BPM);
  const values = exerciseValues.length > 0 ? exerciseValues : allValues;

  const avg = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const max = Math.round(Math.max(...values));
  return { avgHeartRate: avg, maxHeartRate: max };
}

/**
 * Calculate pace in min/km from distance (meters) and duration (minutes).
 * Only meaningful for run/walk/hike disciplines.
 */
export function calculatePace(distanceMeters, durationMinutes) {
  if (!distanceMeters || !durationMinutes || distanceMeters <= 0) return null;
  const distanceKm = distanceMeters / 1000;
  return Math.round((durationMinutes / distanceKm) * 100) / 100;
}

/**
 * Calculate effort score (1-10) based on heart rate reserve.
 * Uses Karvonen formula: %HRR = (avgHR - restingHR) / (maxHR - restingHR)
 */
export function calculateEffortScore(avgHeartRate, restingHR, estimatedMaxHR) {
  if (!avgHeartRate || !restingHR || !estimatedMaxHR) return null;
  if (estimatedMaxHR <= restingHR) return null;

  const hrReservePercent = ((avgHeartRate - restingHR) / (estimatedMaxHR - restingHR)) * 100;
  if (hrReservePercent < 30) return 1;
  if (hrReservePercent < 40) return 2;
  if (hrReservePercent < 50) return 3;
  if (hrReservePercent < 60) return 4;
  if (hrReservePercent < 65) return 5;
  if (hrReservePercent < 70) return 6;
  if (hrReservePercent < 75) return 7;
  if (hrReservePercent < 80) return 8;
  if (hrReservePercent < 90) return 9;
  return 10;
}

/**
 * Enrich a workout with heart rate, pace, and effort data.
 */
async function enrichWorkoutWithDetails(workout, restingHR, age) {
  const { avgHeartRate, maxHeartRate } = await fetchHeartRateForWorkout(
    workout.startDate,
    workout.endDate
  );

  const paceableDisciplines = ['run', 'walk', 'hike'];
  const avgPace = paceableDisciplines.includes(workout.discipline)
    ? calculatePace(workout.distanceMeters, workout.durationMinutes)
    : null;

  const estimatedMaxHR = age ? 220 - age : 190;
  const effortScore = calculateEffortScore(avgHeartRate, restingHR || 60, estimatedMaxHR);

  return { ...workout, avgHeartRate, maxHeartRate, avgPace, effortScore };
}

/**
 * Merge duplicate workout entries with the same discipline, date, and similar
 * duration/start time. Handles double-logging from watch + iPhone.
 */
export function deduplicateWorkouts(workouts) {
  const groups = [];

  for (const w of workouts) {
    const wDate = w.startDate ? new Date(w.startDate).toDateString() : null;
    const wStart = w.startDate ? new Date(w.startDate).getTime() : null;
    const wDur = w.durationMinutes || 0;

    const existing = groups.find((g) => {
      if (g.discipline !== w.discipline) return false;
      const gDate = g.startDate ? new Date(g.startDate).toDateString() : null;
      if (gDate !== wDate) return false;
      const gStart = g.startDate ? new Date(g.startDate).getTime() : null;
      const startDiff = gStart && wStart ? Math.abs(gStart - wStart) / 60000 : 999;
      const durDiff = Math.abs((g.durationMinutes || 0) - wDur);
      return startDiff <= 30 && durDiff <= 3;
    });

    if (existing) {
      // Merge into existing group: keep earliest start, latest end, sum calories, max HR
      if (wStart && new Date(existing.startDate).getTime() > wStart) {
        existing.startDate = w.startDate;
      }
      if (w.endDate && (!existing.endDate || new Date(existing.endDate) < new Date(w.endDate))) {
        existing.endDate = w.endDate;
      }
      existing.calories = (existing.calories || 0) + (w.calories || 0);
      if (w.avgHeartRate && (!existing.avgHeartRate || w.avgHeartRate > existing.avgHeartRate)) {
        existing.avgHeartRate = w.avgHeartRate;
      }
      if (w.maxHeartRate && (!existing.maxHeartRate || w.maxHeartRate > existing.maxHeartRate)) {
        existing.maxHeartRate = w.maxHeartRate;
      }
      if (w.avgPace && existing.avgPace) {
        existing.avgPace = (existing.avgPace + w.avgPace) / 2;
      }
      // Recompute duration from merged start/end
      if (existing.startDate && existing.endDate) {
        existing.durationMinutes = Math.round(
          (new Date(existing.endDate) - new Date(existing.startDate)) / 60000
        );
      }
    } else {
      groups.push({ ...w });
    }
  }

  return groups;
}

/**
 * Fetch completed workouts from Apple Health for the last N days.
 * Filters to triathlon-relevant disciplines, deduplicates, and enriches
 * recent workouts (last 7 days) with heart rate and effort data.
 */
/**
 * Scan the last N days of workouts to find the athlete's historical max heart rate.
 *
 * Strategy:
 * 1. Fetch all workout samples (raw, without enrichment) for the date range.
 * 2. For the top 10 most recent triathlon-relevant workouts, fetch HR samples
 *    and take the maximum across all of them.
 * 3. Returns null if HealthKit is not available or data is insufficient.
 *
 * @param {number} daysBack - How many days to look back (default 180 = 6 months)
 * @returns {Promise<number|null>} Max heart rate in bpm, or null
 */
export async function fetchMaxWorkoutHeartRate(daysBack = 180) {
  try {
    const initialized = await initHealthKit();
    if (!initialized) return null;

    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();

    const rawWorkouts = await getWorkoutSamples(startDate, endDate);
    const relevant = rawWorkouts.filter((w) => SUPPORTED_DISCIPLINES.has(w.discipline));

    if (relevant.length === 0) return null;

    // Strategy 1 — use the max HR Apple Watch embedded in the HKWorkout record.
    // This is the hardware peak, captured at native sampling rate by watchOS.
    const metadataMaxValues = relevant
      .map((w) => w.maxHeartRate)
      .filter((v) => v !== null && v > 100);

    if (metadataMaxValues.length > 0) {
      return Math.max(...metadataMaxValues);
    }

    // Strategy 2 — react-native-health build doesn't expose workout maxHeartRate;
    // fall back to querying per-workout HR samples.
    // Scan ALL relevant workouts (not just 10) to find the true 6-month peak.
    const perWorkoutMaxValues = await Promise.all(
      relevant.map(async (w) => {
        if (!w.startDate || !w.endDate) return null;
        const { maxHeartRate } = await fetchHeartRateForWorkout(w.startDate, w.endDate);
        return maxHeartRate;
      })
    );

    const valid = perWorkoutMaxValues.filter((v) => v !== null && v > 100);
    if (valid.length === 0) return null;

    return Math.max(...valid);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] fetchMaxWorkoutHeartRate failed:', e.message || e);
    return null;
  }
}

/**
 * Compute an HR profile from 6 months of workout history and the current resting HR,
 * then persist it into the athlete profile via saveProfile.
 *
 * Called ONLY on:
 *   - Initial onboarding completion
 *   - Training plan reset
 *
 * Never called on routine app boot — stored values are used directly.
 *
 * @param {object} athleteProfile - Current profile object
 * @param {Function} saveProfile - AppContext saveProfile function
 * @returns {Promise<object>} Updated profile with hrProfile set
 */
export async function computeAndSaveHRProfile(athleteProfile, saveProfile) {
  try {
    const [maxHR, healthData] = await Promise.all([
      fetchMaxWorkoutHeartRate(180),
      fetchHealthData(),
    ]);

    const restingHR = healthData?.restingHR || athleteProfile?.hrProfile?.restingHR || null;

    if (!maxHR && !restingHR) {
      // Insufficient data — leave hrProfile unset so PlanSettings prompts user
      return athleteProfile;
    }

    const hrProfile = {
      maxHR: maxHR || athleteProfile?.hrProfile?.maxHR || null,
      restingHR: restingHR || athleteProfile?.hrProfile?.restingHR || null,
      source: maxHR ? 'workout_history' : 'resting_hr_only',
      computedAt: new Date().toISOString(),
    };

    const updated = { ...athleteProfile, hrProfile };
    await saveProfile(updated);
    return updated;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] computeAndSaveHRProfile failed:', e.message || e);
    return athleteProfile;
  }
}

export async function fetchCompletedWorkouts(daysBack = 14, enrichOptions = {}) {
  if (!AppleHealthKit) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Skipping workout fetch — not available');
    return [];
  }

  try {
    const initialized = await initHealthKit();
    if (!initialized) {
      // eslint-disable-next-line no-console
      console.log('[HealthKit] Skipping workout fetch — not initialized');
      return [];
    }

    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();
    const rawWorkouts = await getWorkoutSamples(startDate, endDate);

    // Filter to triathlon-relevant disciplines only (no walks, hikes, other)
    const workouts = rawWorkouts.filter((w) => SUPPORTED_DISCIPLINES.has(w.discipline));
    // eslint-disable-next-line no-console
    console.log(
      `[HealthKit] Fetched ${rawWorkouts.length} workouts, ${workouts.length} after filtering (last ${daysBack} days)`
    );

    // Enrich recent workouts (last 7 days) with HR data
    const { restingHR, age } = enrichOptions;
    const enrichCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const enriched = await Promise.all(
      workouts.map(async (w) => {
        const workoutTime = new Date(w.startDate).getTime();
        if (workoutTime >= enrichCutoff && w.startDate && w.endDate) {
          try {
            return await enrichWorkoutWithDetails(w, restingHR, age);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.log('[HealthKit] Failed to enrich workout:', err.message || err);
            return w;
          }
        }
        return w;
      })
    );
    // Deduplicate entries with same discipline, date, and similar start/duration
    const deduped = deduplicateWorkouts(enriched);
    // Sort chronologically so slice(-N) reliably returns the N most recent
    deduped.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    return deduped;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[HealthKit] Failed to fetch workouts:', e.message || e);
    return [];
  }
}

/**
 * Build HR zones using the Karvonen (Heart Rate Reserve) method.
 * HRR = maxHR - restingHR
 * Target HR = (HRR × intensity%) + restingHR
 * Returns null if inputs are invalid.
 *
 * @param {number} maxHR - Maximum heart rate in bpm
 * @param {number} restingHR - Resting heart rate in bpm
 * @returns {{ method: string, maxHR: number, restingHR: number, hrr: number, zones: Array } | null}
 */
export function buildKarvonenZones(maxHR, restingHR) {
  if (!maxHR || !restingHR || maxHR <= restingHR) return null;
  const hrr = maxHR - restingHR;
  const zone = (minPct, maxPct) => ({
    min: Math.round(hrr * minPct + restingHR),
    max: Math.round(hrr * maxPct + restingHR),
  });
  return {
    method: 'karvonen',
    maxHR,
    restingHR,
    hrr,
    zones: [
      { zone: 1, label: 'Recovery', ...zone(0.5, 0.6) },
      { zone: 2, label: 'Aerobic', ...zone(0.6, 0.7) },
      { zone: 3, label: 'Tempo', ...zone(0.7, 0.8) },
      { zone: 4, label: 'Threshold', ...zone(0.8, 0.9) },
      { zone: 5, label: 'VO2 Max', ...zone(0.9, 1.0) },
    ],
  };
}

/**
 * Derive personalized heart rate zones from actual workout data.
 *
 * Method: collect avgHeartRate from hard workouts (effortScore ≥ 7) across all
 * disciplines and average them to estimate Lactate Threshold HR (LTHR).
 * Then apply Joe Friel's LTHR-based zone percentages.
 *
 * Returns null if there is insufficient data (fewer than 2 qualifying sessions).
 *
 * @param {Array} completedWorkouts - enriched workout objects with avgHeartRate + effortScore
 * @param {number|null} restingHR - resting heart rate for zone anchoring (optional)
 * @returns {{ lthr: number, zones: Array<{zone: number, label: string, min: number, max: number}> } | null}
 */
export function deriveHRZonesFromWorkouts(completedWorkouts, restingHR = null) {
  if (!completedWorkouts?.length) return null;

  // Collect hard sessions (effortScore 7-10) that have valid HR data
  const hardSessions = completedWorkouts.filter((w) => w.effortScore >= 7 && w.avgHeartRate > 80);

  // Also collect moderate sessions (effortScore 4-6) as Z2 anchors
  const z2Sessions = completedWorkouts.filter(
    (w) => w.effortScore >= 3 && w.effortScore <= 5 && w.avgHeartRate > 80
  );

  if (hardSessions.length < 2 && z2Sessions.length < 2) return null;

  let lthr;
  if (hardSessions.length >= 2) {
    // Average of hard session HR → approximates LTHR
    const avgHardHR =
      hardSessions.reduce((sum, w) => sum + w.avgHeartRate, 0) / hardSessions.length;
    lthr = Math.round(avgHardHR);
  } else {
    // Extrapolate LTHR from Z2 average: Z2 mid ≈ 87% LTHR → LTHR = Z2_avg / 0.87
    const avgZ2HR = z2Sessions.reduce((sum, w) => sum + w.avgHeartRate, 0) / z2Sessions.length;
    lthr = Math.round(avgZ2HR / 0.87);
  }

  // Joe Friel LTHR zone model for triathlon/endurance
  const zones = [
    { zone: 1, label: 'Recovery', min: Math.round(lthr * 0.0), max: Math.round(lthr * 0.85) },
    { zone: 2, label: 'Aerobic', min: Math.round(lthr * 0.85), max: Math.round(lthr * 0.89) },
    { zone: 3, label: 'Tempo', min: Math.round(lthr * 0.9), max: Math.round(lthr * 0.94) },
    { zone: 4, label: 'Threshold', min: Math.round(lthr * 0.95), max: Math.round(lthr * 1.0) },
    { zone: 5, label: 'VO2 Max', min: Math.round(lthr * 1.01), max: Math.round(lthr * 1.1) },
  ];

  return {
    lthr,
    restingHR: restingHR || null,
    dataPoints: hardSessions.length + z2Sessions.length,
    zones,
  };
}
