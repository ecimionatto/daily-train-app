import { Platform } from 'react-native';

let AppleHealthKit = null;

// Only import on iOS
if (Platform.OS === 'ios') {
  try {
    AppleHealthKit = require('react-native-health').default;
  } catch (e) {
    console.warn('react-native-health not available');
  }
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
  if (!AppleHealthKit) return false;

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(HEALTH_PERMISSIONS, (err) => {
      if (err) {
        console.warn('HealthKit init error:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export async function fetchHealthData() {
  // Fall back to mock data when HealthKit isn't available (simulator, Android)
  if (!AppleHealthKit) {
    return getMockHealthData();
  }

  try {
    const initialized = await initHealthKit();
    if (!initialized) return getMockHealthData();

    const [restingHR, hrv, sleep, vo2Max] = await Promise.all([
      getRestingHeartRate(),
      getHRV(),
      getSleepAnalysis(),
      getVO2Max(),
    ]);

    return { restingHR, hrv, sleepHours: sleep, vo2Max };
  } catch (e) {
    console.warn('Failed to fetch health data:', e);
    return getMockHealthData();
  }
}

export async function fetchHealthHistory(days = 14) {
  if (!AppleHealthKit) return getMockHistory(days);

  try {
    const initialized = await initHealthKit();
    if (!initialized) return getMockHistory(days);

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
    return history;
  } catch (e) {
    console.warn('Failed to fetch health history:', e);
    return getMockHistory(days);
  }
}

function getRestingHeartRate() {
  return new Promise((resolve) => {
    const options = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    AppleHealthKit.getRestingHeartRate(options, (err, results) => {
      if (err || !results?.value) {
        resolve(null);
      } else {
        resolve(Math.round(results.value));
      }
    });
  });
}

function getHRV() {
  return new Promise((resolve) => {
    const options = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      limit: 1,
      ascending: false,
    };
    AppleHealthKit.getHeartRateVariabilitySamples(options, (err, results) => {
      if (err || !results?.length) {
        resolve(null);
      } else {
        resolve(Math.round(results[0].value));
      }
    });
  });
}

function getSleepAnalysis() {
  return new Promise((resolve) => {
    const options = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    AppleHealthKit.getSleepSamples(options, (err, results) => {
      if (err || !results?.length) {
        resolve(null);
      } else {
        // Sum up all sleep periods in hours
        let totalMs = 0;
        results.forEach((s) => {
          if (s.value === 'ASLEEP' || s.value === 'INBED') {
            totalMs += new Date(s.endDate) - new Date(s.startDate);
          }
        });
        resolve(totalMs / (1000 * 60 * 60));
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
    AppleHealthKit.getRestingHeartRate({ startDate, endDate }, (err, results) => {
      resolve(err || !results?.value ? null : Math.round(results.value));
    });
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
 * Readiness score algorithm (0-100)
 * Inputs: resting HR, HRV, sleep hours
 * Higher HRV + lower RHR + more sleep = higher score
 */
export function calculateReadiness(data) {
  if (!data) return null;

  let score = 50; // baseline

  // HRV component (0-30 points) - higher is better
  if (data.hrv !== null && data.hrv !== undefined) {
    if (data.hrv >= 80) score += 30;
    else if (data.hrv >= 60) score += 25;
    else if (data.hrv >= 45) score += 18;
    else if (data.hrv >= 30) score += 10;
    else score += 5;
  }

  // Resting HR component (0-30 points) - lower is better
  if (data.restingHR !== null && data.restingHR !== undefined) {
    if (data.restingHR <= 48) score += 30;
    else if (data.restingHR <= 52) score += 25;
    else if (data.restingHR <= 58) score += 18;
    else if (data.restingHR <= 65) score += 10;
    else score += 0;
  }

  // Sleep component (0-20 points)
  if (data.sleepHours !== null && data.sleepHours !== undefined) {
    if (data.sleepHours >= 8) score += 20;
    else if (data.sleepHours >= 7) score += 15;
    else if (data.sleepHours >= 6) score += 8;
    else score += 0;
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
  52: 'run', // HKWorkoutActivityTypeWalking
  35: 'run', // HKWorkoutActivityTypeHiking
  50: 'strength', // HKWorkoutActivityTypeFunctionalStrengthTraining
  20: 'strength', // HKWorkoutActivityTypeTraditionalStrengthTraining
};

/**
 * Map a HealthKit workout activity type to an app discipline.
 */
export function mapWorkoutType(hkActivityType) {
  return HEALTHKIT_WORKOUT_TYPE_MAP[hkActivityType] || 'other';
}

function mapWorkoutSample(sample) {
  return {
    id: sample.id || `hk_${sample.startDate}`,
    discipline: mapWorkoutType(sample.activityId),
    startDate: sample.startDate,
    endDate: sample.endDate,
    durationMinutes: Math.round((new Date(sample.endDate) - new Date(sample.startDate)) / 60000),
    calories: sample.calories ? Math.round(sample.calories) : null,
    distanceMeters: sample.distance ? Math.round(sample.distance * 1000) : null,
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

/**
 * Fetch completed workouts from Apple Health for the last N days.
 * Falls back to mock data on simulator/Android.
 */
export async function fetchCompletedWorkouts(daysBack = 7) {
  if (!AppleHealthKit) {
    return getMockCompletedWorkouts(daysBack);
  }

  try {
    const initialized = await initHealthKit();
    if (!initialized) return getMockCompletedWorkouts(daysBack);

    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();
    return getWorkoutSamples(startDate, endDate);
  } catch (e) {
    console.warn('Failed to fetch completed workouts:', e);
    return getMockCompletedWorkouts(daysBack);
  }
}

// --- Mock Data (for simulator / Android fallback) ---

function getMockHealthData() {
  return {
    restingHR: 52 + Math.floor(Math.random() * 8),
    hrv: 45 + Math.floor(Math.random() * 30),
    sleepHours: 6.5 + Math.random() * 2,
    vo2Max: 48 + Math.floor(Math.random() * 8),
  };
}

function getMockHistory(days) {
  const history = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    history.push({
      date: date.toISOString(),
      restingHR: 50 + Math.floor(Math.random() * 10),
      hrv: 40 + Math.floor(Math.random() * 35),
      sleepHours: 6 + Math.random() * 3,
    });
  }
  return history;
}

function getMockCompletedWorkouts(daysBack) {
  const disciplines = ['swim', 'bike', 'run', 'strength'];
  const workouts = [];
  const now = Date.now();

  for (let i = daysBack - 1; i >= 0; i--) {
    const dayStart = new Date(now - i * 86400000);
    dayStart.setHours(6, 0, 0, 0);
    const dayOfWeek = dayStart.getDay();

    // Rest on Sundays, 1-2 workouts on other days
    if (dayOfWeek === 0) continue;

    const discipline = disciplines[(daysBack - i) % disciplines.length];
    const duration = discipline === 'strength' ? 35 : 45 + Math.floor(Math.random() * 30);
    const startDate = new Date(dayStart);
    const endDate = new Date(startDate.getTime() + duration * 60000);

    workouts.push({
      id: `mock_${i}`,
      discipline,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      durationMinutes: duration,
      calories: Math.round(duration * 8 + Math.random() * 100),
      distanceMeters:
        discipline === 'strength' ? null : Math.round(duration * 150 + Math.random() * 2000),
      source: 'Mock Apple Watch',
    });
  }

  return workouts;
}
