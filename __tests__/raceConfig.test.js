const {
  RACE_TYPES,
  TRIATHLON_DISTANCES,
  RUNNING_DISTANCES,
  GOAL_TIMES,
  DISCIPLINES_FOR_RACE_TYPE,
  isTriathlon,
  isRunningOnly,
  getDisciplinesForProfile,
  getGoalTimesForDistance,
  getDistanceOptions,
} = require('../services/raceConfig');

describe('RACE_TYPES', () => {
  it('has triathlon and running types', () => {
    expect(RACE_TYPES.TRIATHLON).toBe('triathlon');
    expect(RACE_TYPES.RUNNING).toBe('running');
  });
});

describe('TRIATHLON_DISTANCES', () => {
  it('includes all four triathlon distances', () => {
    expect(Object.keys(TRIATHLON_DISTANCES)).toHaveLength(4);
    expect(TRIATHLON_DISTANCES.SPRINT.key).toBe('Sprint Triathlon');
    expect(TRIATHLON_DISTANCES.FULL.key).toBe('Full Ironman (140.6)');
  });

  it('has swim/bike/run distances for each', () => {
    Object.values(TRIATHLON_DISTANCES).forEach((d) => {
      expect(d.swim).toBeGreaterThan(0);
      expect(d.bike).toBeGreaterThan(0);
      expect(d.run).toBeGreaterThan(0);
    });
  });
});

describe('RUNNING_DISTANCES', () => {
  it('includes all five running distances', () => {
    expect(Object.keys(RUNNING_DISTANCES)).toHaveLength(5);
    expect(RUNNING_DISTANCES.FIVE_K.key).toBe('5K');
    expect(RUNNING_DISTANCES.MARATHON.key).toBe('Marathon');
  });
});

describe('GOAL_TIMES', () => {
  it('has goal times for every triathlon distance', () => {
    Object.values(TRIATHLON_DISTANCES).forEach((d) => {
      expect(GOAL_TIMES[d.key]).toBeDefined();
      expect(GOAL_TIMES[d.key].length).toBeGreaterThan(0);
    });
  });

  it('has goal times for every running distance', () => {
    Object.values(RUNNING_DISTANCES).forEach((d) => {
      expect(GOAL_TIMES[d.key]).toBeDefined();
      expect(GOAL_TIMES[d.key].length).toBeGreaterThan(0);
    });
  });

  it('always includes Just finish as an option', () => {
    Object.values(GOAL_TIMES).forEach((times) => {
      expect(times).toContain('Just finish');
    });
  });
});

describe('DISCIPLINES_FOR_RACE_TYPE', () => {
  it('triathlon includes swim, bike, run', () => {
    expect(DISCIPLINES_FOR_RACE_TYPE.triathlon).toContain('swim');
    expect(DISCIPLINES_FOR_RACE_TYPE.triathlon).toContain('bike');
    expect(DISCIPLINES_FOR_RACE_TYPE.triathlon).toContain('run');
  });

  it('running excludes swim and bike', () => {
    expect(DISCIPLINES_FOR_RACE_TYPE.running).not.toContain('swim');
    expect(DISCIPLINES_FOR_RACE_TYPE.running).not.toContain('bike');
    expect(DISCIPLINES_FOR_RACE_TYPE.running).toContain('run');
  });
});

describe('isTriathlon', () => {
  it('returns true for triathlon profile', () => {
    expect(isTriathlon({ raceType: 'triathlon' })).toBe(true);
  });

  it('returns false for running profile', () => {
    expect(isTriathlon({ raceType: 'running' })).toBe(false);
  });

  it('returns false for null profile', () => {
    expect(isTriathlon(null)).toBe(false);
  });
});

describe('isRunningOnly', () => {
  it('returns true for running profile', () => {
    expect(isRunningOnly({ raceType: 'running' })).toBe(true);
  });

  it('returns false for triathlon profile', () => {
    expect(isRunningOnly({ raceType: 'triathlon' })).toBe(false);
  });
});

describe('getDisciplinesForProfile', () => {
  it('returns triathlon disciplines for triathlon profile', () => {
    const disciplines = getDisciplinesForProfile({ raceType: 'triathlon' });
    expect(disciplines).toEqual([
      'swim',
      'bike',
      'run',
      'brick',
      'swim+bike',
      'swim+run',
      'strength',
      'rest',
    ]);
  });

  it('returns running disciplines for running profile', () => {
    const disciplines = getDisciplinesForProfile({ raceType: 'running' });
    expect(disciplines).toEqual(['run', 'strength', 'rest']);
  });

  it('defaults to triathlon for missing raceType', () => {
    const disciplines = getDisciplinesForProfile({});
    expect(disciplines).toEqual([
      'swim',
      'bike',
      'run',
      'brick',
      'swim+bike',
      'swim+run',
      'strength',
      'rest',
    ]);
  });
});

describe('getGoalTimesForDistance', () => {
  it('returns correct times for Marathon', () => {
    const times = getGoalTimesForDistance('Marathon');
    expect(times).toContain('Sub 3:00');
    expect(times).toContain('Just finish');
  });

  it('returns fallback for unknown distance', () => {
    const times = getGoalTimesForDistance('Unknown Race');
    expect(times).toEqual(['Just finish']);
  });
});

describe('getDistanceOptions', () => {
  it('returns triathlon distance keys for triathlon', () => {
    const options = getDistanceOptions('triathlon');
    expect(options).toContain('Sprint Triathlon');
    expect(options).toContain('Full Ironman (140.6)');
    expect(options).not.toContain('Marathon');
  });

  it('returns running distance keys for running', () => {
    const options = getDistanceOptions('running');
    expect(options).toContain('5K');
    expect(options).toContain('Marathon');
    expect(options).not.toContain('Sprint Triathlon');
  });
});
