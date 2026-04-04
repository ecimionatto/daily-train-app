jest.mock('../services/localModel', () => ({
  runToolInference: jest.fn(),
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

const { processMessage } = require('../services/agentOrchestrator');
const { runToolInference } = require('../services/localModel');
const {
  executeSkillPreview,
  commitSkill,
  classifyConfirmation,
} = require('../services/skills/executor');

const mockContext = {
  athleteProfile: { raceType: 'triathlon', distance: 'Half Ironman (70.3)', weeklyHours: '8-10' },
  phase: 'BASE',
  weekPlan: ['run', 'swim+bike', 'swim+run', 'strength', 'run', 'swim+bike', 'brick'],
  readinessScore: 75,
  onProfileUpdate: jest.fn(),
};

describe('processMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns text response when no tool is called', async () => {
    runToolInference.mockResolvedValue({
      text: 'Great question about periodization! It means cycling training phases over time.',
      toolCalls: [],
    });

    const result = await processMessage('how does periodization work?', mockContext);

    expect(result).toBe(
      'Great question about periodization! It means cycling training phases over time.'
    );
    expect(executeSkillPreview).not.toHaveBeenCalled();
  });

  it('executes tool call when model calls a tool', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [{ function: { name: 'set_schedule', arguments: { strengthDays: [1] } } }],
    });
    executeSkillPreview.mockResolvedValue({
      diff: { table: 'Mon: swim+bike → strength', summary: '1 day adjusted.' },
      intents: { strengthDays: [1] },
      updatedProfile: {},
      executor: 'setSchedule',
    });

    const result = await processMessage('move strength to Monday', mockContext);

    expect(result).toEqual({
      text: expect.stringContaining('Mon: swim+bike → strength'),
      pendingAction: expect.objectContaining({ executor: 'setSchedule' }),
    });
  });

  it('handles skill clarification', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [{ function: { name: 'set_schedule', arguments: {} } }],
    });
    executeSkillPreview.mockResolvedValue({
      needsClarification: true,
      message: 'Which days?',
    });

    const result = await processMessage('change something', mockContext);
    expect(result).toBe('Which days?');
  });

  it('handles skill direct response', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [{ function: { name: 'set_schedule', arguments: { strengthDays: [3] } } }],
    });
    executeSkillPreview.mockResolvedValue({
      directResponse: 'No changes needed!',
    });

    const result = await processMessage('move strength to Wednesday', mockContext);
    expect(result).toBe('No changes needed!');
  });

  it('returns null for fallback when skill signals fallbackToHandler', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [{ function: { name: 'swap_workout', arguments: {} } }],
    });
    executeSkillPreview.mockResolvedValue({ fallbackToHandler: true });

    const result = await processMessage('give me a different workout', mockContext);
    expect(result).toBeNull();
  });

  it('handles pending action confirmation (yes)', async () => {
    const pendingAction = { executor: 'setSchedule', updatedProfile: {} };
    classifyConfirmation.mockReturnValue('yes');
    commitSkill.mockResolvedValue('Schedule updated!');

    const result = await processMessage('yes', { ...mockContext, pendingAction });

    expect(result).toEqual({ text: 'Schedule updated!', clearPending: true });
  });

  it('handles pending action rejection (no)', async () => {
    const pendingAction = { executor: 'setSchedule', updatedProfile: {} };
    classifyConfirmation.mockReturnValue('no');

    const result = await processMessage('no', { ...mockContext, pendingAction });

    expect(result).toEqual({ text: 'No changes made. Your plan stays as is.', clearPending: true });
  });

  it('handles ambiguous confirmation', async () => {
    const pendingAction = { executor: 'setSchedule', updatedProfile: {} };
    classifyConfirmation.mockReturnValue('ambiguous');

    const result = await processMessage('hmm maybe', { ...mockContext, pendingAction });

    expect(result).toContain('yes or no');
  });

  it('returns null for unknown tool name', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [{ function: { name: 'unknown_tool', arguments: {} } }],
    });

    const result = await processMessage('do something weird', mockContext);
    expect(result).toBeNull();
  });

  it('parses string arguments from tool call', async () => {
    runToolInference.mockResolvedValue({
      text: null,
      toolCalls: [{ function: { name: 'set_schedule', arguments: '{"strengthDays":[1]}' } }],
    });
    executeSkillPreview.mockResolvedValue({ directResponse: 'Done!' });

    await processMessage('strength Monday', mockContext);

    expect(executeSkillPreview).toHaveBeenCalledWith(
      'setSchedule',
      'strength Monday',
      expect.objectContaining({ extractedArgs: { strengthDays: [1] } })
    );
  });
});
