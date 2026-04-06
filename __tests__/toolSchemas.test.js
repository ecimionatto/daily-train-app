const { COACH_TOOLS, TOOL_TO_EXECUTOR } = require('../services/toolSchemas');

describe('COACH_TOOLS', () => {
  it('contains 6 tool definitions', () => {
    expect(COACH_TOOLS).toHaveLength(6);
  });

  it('every tool has required fields', () => {
    for (const tool of COACH_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeTruthy();
      expect(tool.function.parameters.type).toBe('object');
    }
  });

  it('has tool definitions for all skill executors', () => {
    const toolNames = COACH_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain('set_schedule');
    expect(toolNames).toContain('swap_workout');
    expect(toolNames).toContain('adjust_load');
    expect(toolNames).toContain('update_plan');
    expect(toolNames).toContain('analyze_trends');
    expect(toolNames).toContain('analyze_history');
  });

  it('set_schedule has correct parameter types', () => {
    const tool = COACH_TOOLS.find((t) => t.function.name === 'set_schedule');
    const props = tool.function.parameters.properties;
    expect(props.strengthDays.type).toBe('array');
    expect(props.restDays.type).toBe('array');
    expect(props.swimDays.type).toBe('string');
    expect(props.swimDays.enum).toEqual(['mwf', 'tts']);
    expect(props.weekendPreference.enum).toEqual(['bike-sat-run-sun', 'run-sat-bike-sun']);
  });

  it('adjust_load has direction enum', () => {
    const tool = COACH_TOOLS.find((t) => t.function.name === 'adjust_load');
    expect(tool.function.parameters.properties.direction.enum).toEqual(['reduce', 'increase']);
  });
});

describe('TOOL_TO_EXECUTOR', () => {
  it('maps all tool names to executor keys', () => {
    expect(TOOL_TO_EXECUTOR.set_schedule).toBe('setSchedule');
    expect(TOOL_TO_EXECUTOR.swap_workout).toBe('swapWorkout');
    expect(TOOL_TO_EXECUTOR.adjust_load).toBe('adjustLoad');
    expect(TOOL_TO_EXECUTOR.update_plan).toBe('updatePlan');
    expect(TOOL_TO_EXECUTOR.analyze_trends).toBe('trendRecommendation');
    expect(TOOL_TO_EXECUTOR.analyze_history).toBe('analyzeHistory');
  });
});
