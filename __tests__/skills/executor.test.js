const { classifyConfirmation, resolveSkill } = require('../../services/skills/executor');

describe('classifyConfirmation', () => {
  it('recognizes yes confirmations', () => {
    expect(classifyConfirmation('yes')).toBe('yes');
    expect(classifyConfirmation('Yeah')).toBe('yes');
    expect(classifyConfirmation('sure')).toBe('yes');
    expect(classifyConfirmation('ok')).toBe('yes');
    expect(classifyConfirmation('Go ahead')).toBe('yes');
    expect(classifyConfirmation('do it')).toBe('yes');
    expect(classifyConfirmation('looks good')).toBe('yes');
    expect(classifyConfirmation("let's do it")).toBe('yes');
    expect(classifyConfirmation('apply')).toBe('yes');
    expect(classifyConfirmation('save')).toBe('yes');
  });

  it('recognizes no rejections', () => {
    expect(classifyConfirmation('no')).toBe('no');
    expect(classifyConfirmation('nah')).toBe('no');
    expect(classifyConfirmation('cancel')).toBe('no');
    expect(classifyConfirmation('never mind')).toBe('no');
    expect(classifyConfirmation('forget it')).toBe('no');
    expect(classifyConfirmation("don't")).toBe('no');
    expect(classifyConfirmation('stop')).toBe('no');
  });

  it('returns ambiguous for unclear messages', () => {
    expect(classifyConfirmation('hmm let me think')).toBe('ambiguous');
    expect(classifyConfirmation('what would change exactly?')).toBe('ambiguous');
    expect(classifyConfirmation('tell me more')).toBe('ambiguous');
  });
});

describe('resolveSkill', () => {
  it('resolves schedule_preference to set_schedule skill', () => {
    const skill = resolveSkill('schedule_preference');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('set_schedule');
    expect(skill.confirmationRequired).toBe(true);
  });

  it('resolves workout_swap to swap_workout skill', () => {
    const skill = resolveSkill('workout_swap');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('swap_workout');
  });

  it('returns null for unknown category', () => {
    expect(resolveSkill('unknown_category')).toBeNull();
  });

  it('returns null for general_training', () => {
    expect(resolveSkill('general_training')).toBeNull();
  });
});
