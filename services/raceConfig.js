/**
 * Race type and distance configuration.
 * Pure data + helper functions. No side effects.
 */

const RACE_TYPES = {
  TRIATHLON: 'triathlon',
  RUNNING: 'running',
};

const TRIATHLON_DISTANCES = {
  SPRINT: { key: 'Sprint Triathlon', swim: 750, bike: 20, run: 5, label: 'Sprint' },
  OLYMPIC: { key: 'Olympic Triathlon', swim: 1500, bike: 40, run: 10, label: 'Olympic' },
  HALF: { key: 'Half Ironman (70.3)', swim: 1900, bike: 90, run: 21.1, label: '70.3' },
  FULL: { key: 'Full Ironman (140.6)', swim: 3800, bike: 180, run: 42.2, label: '140.6' },
};

const RUNNING_DISTANCES = {
  FIVE_K: { key: '5K', distanceKm: 5, label: '5K' },
  TEN_K: { key: '10K', distanceKm: 10, label: '10K' },
  HALF_MARATHON: { key: 'Half Marathon', distanceKm: 21.1, label: 'Half Marathon' },
  MARATHON: { key: 'Marathon', distanceKm: 42.2, label: 'Marathon' },
  ULTRA: { key: 'Ultra Marathon', distanceKm: 50, label: 'Ultra' },
};

const GOAL_TIMES = {
  'Sprint Triathlon': ['Sub 1:15', '1:15-1:30', '1:30-2:00', 'Just finish'],
  'Olympic Triathlon': ['Sub 2:00', '2:00-2:30', '2:30-3:00', '3:00-3:30', 'Just finish'],
  'Half Ironman (70.3)': ['Sub 4:30', '4:30-5:30', '5:30-6:30', '6:30-8:00', 'Just finish'],
  'Full Ironman (140.6)': ['Sub 10h', '10-12h', '12-14h', '14-16h', 'Just finish'],
  '5K': ['Sub 20min', '20-25min', '25-30min', '30-35min', 'Just finish'],
  '10K': ['Sub 45min', '45-55min', '55-65min', '65-75min', 'Just finish'],
  'Half Marathon': ['Sub 1:30', '1:30-1:45', '1:45-2:00', '2:00-2:30', 'Just finish'],
  Marathon: ['Sub 3:00', '3:00-3:30', '3:30-4:00', '4:00-4:30', '4:30-5:00', 'Just finish'],
  'Ultra Marathon': ['Sub 5h', '5-7h', '7-10h', '10h+', 'Just finish'],
};

const DISCIPLINES_FOR_RACE_TYPE = {
  triathlon: ['swim', 'bike', 'run', 'brick', 'swim+bike', 'strength', 'rest'],
  running: ['run', 'strength', 'rest'],
};

const EXPERIENCE_OPTIONS = {
  triathlon: {
    key: 'previousRaces',
    question: 'Previous triathlon race experience?',
    options: ['First timer', '1-2 races', '3-5 races', '6+'],
  },
  running: {
    key: 'previousRaces',
    question: 'Previous race experience at this distance?',
    options: ['First timer', '1-2 races', '3-5 races', '6+'],
  },
};

function isTriathlon(profile) {
  return profile?.raceType === 'triathlon';
}

function isRunningOnly(profile) {
  return profile?.raceType === 'running';
}

function getDisciplinesForProfile(profile) {
  const raceType = profile?.raceType || 'triathlon';
  return DISCIPLINES_FOR_RACE_TYPE[raceType] || DISCIPLINES_FOR_RACE_TYPE.triathlon;
}

function getGoalTimesForDistance(distanceKey) {
  return GOAL_TIMES[distanceKey] || ['Just finish'];
}

function getDistanceOptions(raceType) {
  if (raceType === 'running') {
    return Object.values(RUNNING_DISTANCES).map((d) => d.key);
  }
  return Object.values(TRIATHLON_DISTANCES).map((d) => d.key);
}

module.exports = {
  RACE_TYPES,
  TRIATHLON_DISTANCES,
  RUNNING_DISTANCES,
  GOAL_TIMES,
  DISCIPLINES_FOR_RACE_TYPE,
  EXPERIENCE_OPTIONS,
  isTriathlon,
  isRunningOnly,
  getDisciplinesForProfile,
  getGoalTimesForDistance,
  getDistanceOptions,
};
