jest.mock('../../services/localModel', () => ({
  getWeeklyDisciplinePlan: jest.fn(),
  validatePlanConstraints: jest.fn().mockReturnValue({ valid: true, violations: [] }),
  countDisciplineTouches: jest.fn().mockReturnValue({ swim: 3, bike: 3, run: 3, strength: 1 }),
}));

jest.mock('../../services/trendAnalysis', () => ({
  analyzeWorkoutTrends: jest.fn(),
  analyzeHealthTrends: jest.fn(),
}));

jest.mock('../../services/workoutScoring', () => ({
  analyzeDisciplineGaps: jest.fn(),
}));

const { preview, commit } = require('../../services/skills/trendRecommendation');
const { analyzeWorkoutTrends, analyzeHealthTrends } = require('../../services/trendAnalysis');
const { analyzeDisciplineGaps } = require('../../services/workoutScoring');

const mockContext = {
  athleteProfile: {
    raceType: 'triathlon',
    weeklyHours: '8-10',
    schedulePreferences: { weekendPreference: 'bike-sat-run-sun', swimDays: 'mwf' },
  },
  phase: 'BASE',
  weekPlan: ['run', 'swim+bike', 'swim+run', 'strength', 'run', 'swim+bike', 'brick'],
  completedWorkouts: [],
  healthData: { restingHR: [60, 62], hrv: [45, 42], sleepHours: [7, 7.5] },
  onProfileUpdate: jest.fn(),
};

describe('trendRecommendation preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns directResponse when no recommendations', async () => {
    analyzeWorkoutTrends.mockReturnValue({
      volumeTrend: 'stable',
      alerts: [],
      thisWeekSessions: 3,
    });
    analyzeHealthTrends.mockReturnValue({ overallTrend: 'stable', alerts: [] });
    analyzeDisciplineGaps.mockReturnValue({ underTrained: [], gaps: {} });

    const result = await preview('how am I doing?', mockContext);

    expect(result.directResponse).toContain('well balanced');
  });

  it('generates recovery recommendation when health is fatiguing', async () => {
    analyzeWorkoutTrends.mockReturnValue({
      volumeTrend: 'stable',
      alerts: [],
      thisWeekSessions: 4,
    });
    analyzeHealthTrends.mockReturnValue({
      overallTrend: 'fatiguing',
      alerts: ['HRV declining', 'RHR elevated'],
    });
    analyzeDisciplineGaps.mockReturnValue({ underTrained: [], gaps: {} });

    const result = await preview('analyze my training', mockContext);

    expect(result.directResponse).toContain('Health metrics trending down');
  });

  it('generates volume spike warning', async () => {
    analyzeWorkoutTrends.mockReturnValue({
      volumeTrend: 'increasing',
      alerts: ['Training volume spiked 30%+'],
      thisWeekSessions: 6,
    });
    analyzeHealthTrends.mockReturnValue({ overallTrend: 'stable', alerts: [] });
    analyzeDisciplineGaps.mockReturnValue({ underTrained: [], gaps: {} });

    const result = await preview('weekly review', mockContext);

    expect(result.directResponse).toContain('volume spiked');
  });

  it('recognizes consistency', async () => {
    analyzeWorkoutTrends.mockReturnValue({
      volumeTrend: 'stable',
      alerts: [],
      thisWeekSessions: 5,
    });
    analyzeHealthTrends.mockReturnValue({ overallTrend: 'stable', alerts: [] });
    analyzeDisciplineGaps.mockReturnValue({ underTrained: [], gaps: {} });

    const result = await preview('how is my training', mockContext);

    expect(result.directResponse).toContain('5 sessions');
  });
});

describe('trendRecommendation commit', () => {
  it('calls onProfileUpdate', async () => {
    const onProfileUpdate = jest.fn();
    const pendingAction = {
      updatedProfile: mockContext.athleteProfile,
      recommendations: [{ scheduleChange: { day: 1, from: 'run', to: 'swim' } }],
      executor: 'trendRecommendation',
    };

    const result = await commit(pendingAction, { onProfileUpdate });

    expect(onProfileUpdate).toHaveBeenCalledWith(pendingAction.updatedProfile);
    expect(result).toContain('Applied 1 training adjustment');
  });

  it('returns error when onProfileUpdate missing', async () => {
    const result = await commit({ updatedProfile: {} }, {});
    expect(result).toContain('Unable to save');
  });
});
