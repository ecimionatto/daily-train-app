/**
 * Smoke conversational tests — validate agent message flow end-to-end
 * with mocked LLM responses. Runs in CI (no real model needed).
 */

jest.mock('../services/localModel', () => ({
  runToolInference: jest.fn(),
  runInference: jest.fn(),
  ModelNotReadyError: class ModelNotReadyError extends Error {
    constructor() {
      super('Model not ready');
      this.name = 'ModelNotReadyError';
    }
  },
}));

jest.mock('../services/skills/executor', () => ({
  executeSkillPreview: jest.fn(),
  commitSkill: jest.fn(),
  classifyConfirmation: jest.fn(),
}));

jest.mock('../services/healthKit', () => ({
  fetchCompletedWorkouts: jest.fn().mockResolvedValue([]),
}));

const { processMessage } = require('../services/agentOrchestrator');
const { runToolInference } = require('../services/localModel');
const {
  executeSkillPreview,
  commitSkill,
  classifyConfirmation,
} = require('../services/skills/executor');

const mockContext = {
  athleteProfile: {
    raceType: 'triathlon',
    distance: 'Half Ironman (70.3)',
    weeklyHours: '8-10',
    raceDate: '2026-09-13',
    schedulePreferences: { swimDays: 'mwf', weekendPreference: 'bike-sat-run-sun' },
  },
  phase: 'BUILD',
  weekPlan: ['rest', 'swim+run', 'bike', 'swim+strength', 'run', 'swim+bike', 'brick'],
  readinessScore: 72,
  completedWorkouts: [
    { discipline: 'run', duration: 45, date: '2026-04-03' },
    { discipline: 'swim', duration: 30, date: '2026-04-02' },
  ],
  healthData: { restingHR: 52, hrv: 48, sleepHours: 7.2 },
  todayWorkout: { discipline: 'bike', title: 'Z2 Endurance Ride', duration: 60 },
  onProfileUpdate: jest.fn(),
};

describe('agentSmoke — conversational flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes "swap today for bike" to swap_workout tool', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [
        {
          function: {
            name: 'swap_workout',
            arguments: { targetDiscipline: 'bike', reason: 'preference' },
          },
        },
      ],
    });
    executeSkillPreview.mockResolvedValue({
      diff: { table: 'Today: run → bike Z2 60min', summary: 'Swapped to bike.' },
      intents: { targetDiscipline: 'bike' },
      updatedProfile: {},
      executor: 'swapWorkout',
    });

    const result = await processMessage('swap today for bike', mockContext);

    expect(runToolInference).toHaveBeenCalledTimes(1);
    expect(executeSkillPreview).toHaveBeenCalledWith(
      'swapWorkout',
      'swap today for bike',
      expect.objectContaining({ extractedArgs: { targetDiscipline: 'bike', reason: 'preference' } })
    );
    expect(result).toEqual({
      text: expect.stringContaining('bike'),
      pendingAction: expect.objectContaining({ executor: 'swapWorkout' }),
    });
  });

  it('routes "analyze my training history" to analyze_history tool with preview', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [{ function: { name: 'analyze_history', arguments: {} } }],
    });
    executeSkillPreview.mockResolvedValue({
      diff: { table: 'Proposed plan based on 30-day history', summary: 'New adaptive plan ready.' },
      intents: {},
      updatedProfile: { phase: 'BUILD' },
      executor: 'analyzeHistory',
    });

    const result = await processMessage('analyze my training history', mockContext);

    expect(executeSkillPreview).toHaveBeenCalledWith(
      'analyzeHistory',
      'analyze my training history',
      expect.objectContaining({ extractedArgs: {} })
    );
    expect(result).toEqual({
      text: expect.stringContaining('Proposed plan'),
      pendingAction: expect.objectContaining({ executor: 'analyzeHistory' }),
    });
  });

  it('commits pending analyzeHistory action on "yes" confirmation', async () => {
    const pendingAction = {
      executor: 'analyzeHistory',
      updatedProfile: { phase: 'BUILD' },
      diff: { table: 'Proposed plan', summary: 'Ready.' },
    };
    classifyConfirmation.mockReturnValue('yes');
    commitSkill.mockResolvedValue('Training plan updated based on your history!');

    const result = await processMessage('yes', { ...mockContext, pendingAction });

    expect(classifyConfirmation).toHaveBeenCalledWith('yes');
    expect(commitSkill).toHaveBeenCalledWith(
      pendingAction,
      expect.objectContaining({ pendingAction })
    );
    expect(result).toEqual({
      text: 'Training plan updated based on your history!',
      clearPending: true,
    });
  });

  it('returns coaching text with no tool call for general question', async () => {
    runToolInference.mockResolvedValue({
      text: 'Zone 2 training builds aerobic base. Keep heart rate at 60-70% of max.',
      toolCalls: [],
    });

    const result = await processMessage('what is zone 2 training?', mockContext);

    expect(executeSkillPreview).not.toHaveBeenCalled();
    expect(commitSkill).not.toHaveBeenCalled();
    expect(typeof result).toBe('string');
    expect(result).toContain('Zone 2');
  });

  it('includes weekly targets and consistency in system prompt when present', async () => {
    const contextWithTargets = {
      ...mockContext,
      weeklyTargets: {
        targets: { swim: { count: 3 }, bike: { count: 2 }, run: { count: 3 } },
      },
      weeklyConsistency: {
        percentage: 75,
        byDiscipline: {
          swim: { completed: 2 },
          bike: { completed: 1 },
          run: { completed: 2 },
        },
      },
    };

    runToolInference.mockResolvedValue({
      text: 'You are 75% consistent this week.',
      toolCalls: [],
    });

    await processMessage('how am I doing this week?', contextWithTargets);

    const systemPrompt = runToolInference.mock.calls[0][0];
    expect(systemPrompt).toContain('Targets:');
    expect(systemPrompt).toContain('75%');
    expect(systemPrompt).toContain('consistency');
  });

  it('returns null when model returns empty/null text and no tool calls', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [],
    });

    const result = await processMessage('asdfghjkl', mockContext);

    expect(result).toBeNull();
    expect(executeSkillPreview).not.toHaveBeenCalled();
  });
});
