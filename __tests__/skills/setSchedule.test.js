jest.mock('../../services/localModel', () => ({
  getWeeklyDisciplinePlan: jest.fn(),
  validatePlanConstraints: jest.fn().mockReturnValue({ valid: true, violations: [] }),
}));

const { preview, commit } = require('../../services/skills/setSchedule');
const { getWeeklyDisciplinePlan } = require('../../services/localModel');

const mockProfile = {
  raceType: 'triathlon',
  distance: 'Half Ironman (70.3)',
  weeklyHours: '8-10',
  schedulePreferences: {
    weekendPreference: 'bike-sat-run-sun',
    swimDays: 'mwf',
  },
};

const mockWeekPlan = ['run', 'swim+bike', 'swim+run', 'strength', 'run', 'swim+bike', 'brick'];

describe('setSchedule preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts strength day intent and computes diff', async () => {
    const proposedPlan = ['run', 'strength', 'swim+run', 'swim+bike', 'run', 'swim+bike', 'brick'];
    getWeeklyDisciplinePlan.mockReturnValue(proposedPlan);

    const result = await preview('move my strength to Monday', {
      athleteProfile: mockProfile,
      phase: 'BASE',
      weekPlan: mockWeekPlan,
    });

    expect(result.diff).toBeTruthy();
    expect(result.diff.table).toContain('Mon');
    expect(result.diff.table).toContain('strength');
    expect(result.intents.strengthDays).toContain(1);
    expect(result.executor).toBe('setSchedule');
    expect(result.updatedProfile.schedulePreferences.strengthDays).toContain(1);
  });

  it('extracts rest day intent', async () => {
    const proposedPlan = ['run', 'swim+bike', 'swim+run', 'strength', 'rest', 'swim+bike', 'brick'];
    getWeeklyDisciplinePlan.mockReturnValue(proposedPlan);

    const result = await preview('rest on Friday', {
      athleteProfile: mockProfile,
      phase: 'BASE',
      weekPlan: mockWeekPlan,
    });

    expect(result.intents.restDays).toContain(5);
  });

  it('extracts weekend preference', async () => {
    const proposedPlan = ['brick', 'swim+bike', 'swim+run', 'strength', 'run', 'swim+bike', 'run'];
    getWeeklyDisciplinePlan.mockReturnValue(proposedPlan);

    const result = await preview('I want to run on Saturday and bike on Sunday', {
      athleteProfile: mockProfile,
      phase: 'BASE',
      weekPlan: mockWeekPlan,
    });

    expect(result.intents.weekendPreference).toBe('run-sat-bike-sun');
  });

  it('extracts swim day preference (TTS)', async () => {
    const proposedPlan = ['run', 'run', 'swim+bike', 'strength', 'swim+bike', 'swim+run', 'brick'];
    getWeeklyDisciplinePlan.mockReturnValue(proposedPlan);

    const result = await preview('move swim to Tuesday Thursday Saturday', {
      athleteProfile: mockProfile,
      phase: 'BASE',
      weekPlan: mockWeekPlan,
    });

    expect(result.intents.swimDays).toBe('tts');
  });

  it('returns needsClarification when no intent detected', async () => {
    const result = await preview('change something please', {
      athleteProfile: mockProfile,
      phase: 'BASE',
      weekPlan: mockWeekPlan,
    });

    expect(result.needsClarification).toBe(true);
    expect(result.message).toBeTruthy();
  });

  it('returns directResponse when no changes detected', async () => {
    getWeeklyDisciplinePlan.mockReturnValue(mockWeekPlan);

    const result = await preview('move strength to Wednesday', {
      athleteProfile: mockProfile,
      phase: 'BASE',
      weekPlan: mockWeekPlan,
    });

    expect(result.directResponse).toContain('already matches');
  });

  it('shows day count in summary', async () => {
    const proposedPlan = ['run', 'strength', 'swim+run', 'swim+bike', 'run', 'swim+bike', 'brick'];
    getWeeklyDisciplinePlan.mockReturnValue(proposedPlan);

    const result = await preview('move strength to Monday', {
      athleteProfile: mockProfile,
      phase: 'BASE',
      weekPlan: mockWeekPlan,
    });

    expect(result.diff.summary).toMatch(/\d+ day/);
  });
});

describe('setSchedule commit', () => {
  it('calls onProfileUpdate with the updated profile', async () => {
    const onProfileUpdate = jest.fn();
    const pendingAction = {
      updatedProfile: { ...mockProfile, schedulePreferences: { strengthDays: [1] } },
      executor: 'setSchedule',
    };

    const result = await commit(pendingAction, { onProfileUpdate });

    expect(onProfileUpdate).toHaveBeenCalledWith(pendingAction.updatedProfile);
    expect(result).toContain('Schedule updated');
  });

  it('returns error message when onProfileUpdate is missing', async () => {
    const result = await commit({ updatedProfile: mockProfile }, {});
    expect(result).toContain('Unable to save');
  });
});
