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

  // --- Plan change scenarios ---

  it('routes "change my race date" to update_plan tool', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [
        {
          function: {
            name: 'update_plan',
            arguments: { raceDate: '2026-11-01', reason: 'race moved' },
          },
        },
      ],
    });
    executeSkillPreview.mockResolvedValue({
      diff: { table: 'Race date: Sep 13 → Nov 1', summary: 'Extends build phase by 7 weeks.' },
      updatedProfile: { ...mockContext.athleteProfile, raceDate: '2026-11-01' },
      executor: 'updatePlan',
    });

    const result = await processMessage('change my race date to November 1st', mockContext);

    expect(executeSkillPreview).toHaveBeenCalledWith(
      'updatePlan',
      expect.any(String),
      expect.objectContaining({ extractedArgs: { raceDate: '2026-11-01', reason: 'race moved' } })
    );
    expect(result.pendingAction).toBeDefined();
    expect(result.pendingAction.executor).toBe('updatePlan');
  });

  it('routes "switch to Olympic distance" to update_plan tool', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [
        {
          function: {
            name: 'update_plan',
            arguments: { distance: 'Olympic Triathlon' },
          },
        },
      ],
    });
    executeSkillPreview.mockResolvedValue({
      diff: { table: 'Distance: 70.3 → Olympic', summary: 'Volume targets reduced.' },
      updatedProfile: { ...mockContext.athleteProfile, distance: 'Olympic Triathlon' },
      executor: 'updatePlan',
    });

    const result = await processMessage('switch to Olympic distance', mockContext);

    expect(result.pendingAction.executor).toBe('updatePlan');
    expect(result.text).toContain('Olympic');
  });

  it('routes "move my swim days to Tuesday Thursday" to set_schedule tool', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [
        {
          function: {
            name: 'set_schedule',
            arguments: { swimDays: 'tts' },
          },
        },
      ],
    });
    executeSkillPreview.mockResolvedValue({
      diff: { table: 'Swim days: MWF → TTS', summary: 'Updated swim schedule.' },
      updatedProfile: {
        ...mockContext.athleteProfile,
        schedulePreferences: { ...mockContext.athleteProfile.schedulePreferences, swimDays: 'tts' },
      },
      executor: 'setSchedule',
    });

    const result = await processMessage(
      'move my swim days to Tuesday Thursday Saturday',
      mockContext
    );

    expect(executeSkillPreview).toHaveBeenCalledWith(
      'setSchedule',
      expect.any(String),
      expect.objectContaining({ extractedArgs: { swimDays: 'tts' } })
    );
    expect(result.pendingAction).toBeDefined();
  });

  // --- Training questions ---

  it('answers "what phase am I in" with coaching text', async () => {
    runToolInference.mockResolvedValue({
      text: 'You are in BUILD phase, 23 weeks out. Focus on threshold work alongside your base volume.',
      toolCalls: [],
    });

    const result = await processMessage('what phase am I in?', mockContext);

    expect(typeof result).toBe('string');
    expect(result).toContain('BUILD');
    expect(executeSkillPreview).not.toHaveBeenCalled();
  });

  it('answers "how should I train this week" with coaching text', async () => {
    runToolInference.mockResolvedValue({
      text: 'This week: 3 swim, 2 bike, 3 run. Prioritize your long ride Saturday and brick Sunday.',
      toolCalls: [],
    });

    const result = await processMessage('how should I train this week?', mockContext);

    expect(typeof result).toBe('string');
    expect(result).toContain('swim');
    expect(executeSkillPreview).not.toHaveBeenCalled();
  });

  // --- Fatigue and recovery ---

  it('routes "I am exhausted, reduce my training" to adjust_load tool', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [
        {
          function: {
            name: 'adjust_load',
            arguments: { adjustment: 'reduce', days: 3, reason: 'fatigue' },
          },
        },
      ],
    });
    executeSkillPreview.mockResolvedValue({
      diff: { table: 'Load: normal → reduced for 3 days', summary: 'Taking it easy.' },
      updatedProfile: mockContext.athleteProfile,
      executor: 'adjustLoad',
    });

    const result = await processMessage(
      'I am exhausted, reduce my training for a few days',
      mockContext
    );

    expect(executeSkillPreview).toHaveBeenCalledWith(
      'adjustLoad',
      expect.any(String),
      expect.objectContaining({
        extractedArgs: { adjustment: 'reduce', days: 3, reason: 'fatigue' },
      })
    );
    expect(result.pendingAction.executor).toBe('adjustLoad');
  });

  it('answers "my legs are sore, should I rest" with coaching text', async () => {
    runToolInference.mockResolvedValue({
      text: 'With sore legs and readiness at 72, an easy swim or light spin would help recovery better than full rest.',
      toolCalls: [],
    });

    const result = await processMessage('my legs are sore, should I rest today?', mockContext);

    expect(typeof result).toBe('string');
    expect(result).toContain('recovery');
    expect(executeSkillPreview).not.toHaveBeenCalled();
  });

  it('answers "how is my recovery looking" with coaching text', async () => {
    runToolInference.mockResolvedValue({
      text: 'Recovery looks solid. HRV at 48ms is stable, RHR at 52 is normal. Sleep 7.2h is good. Green light for today.',
      toolCalls: [],
    });

    const result = await processMessage('how is my recovery looking?', mockContext);

    expect(typeof result).toBe('string');
    expect(result).toContain('HRV');
    expect(executeSkillPreview).not.toHaveBeenCalled();
  });

  // --- Rejection flow ---

  it('rejects pending action on "no" and clears pending', async () => {
    const pendingAction = {
      executor: 'updatePlan',
      updatedProfile: { raceDate: '2026-11-01' },
      diff: { table: 'Race date change', summary: 'Extended plan.' },
    };
    classifyConfirmation.mockReturnValue('no');

    const result = await processMessage('no, keep the current plan', {
      ...mockContext,
      pendingAction,
    });

    expect(commitSkill).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: expect.any(String),
      clearPending: true,
    });
  });
});
