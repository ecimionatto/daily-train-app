const {
  SKILL_REGISTRY,
  buildSkillSummaries,
  getSkillInstructions,
  findSkillByTrigger,
} = require('../../services/skills/registry');

describe('SKILL_REGISTRY', () => {
  it('contains all 6 skills', () => {
    expect(SKILL_REGISTRY).toHaveLength(6);
    const names = SKILL_REGISTRY.map((s) => s.name);
    expect(names).toContain('set_schedule');
    expect(names).toContain('swap_workout');
    expect(names).toContain('adjust_load');
    expect(names).toContain('update_training_plan');
    expect(names).toContain('read_health_data');
    expect(names).toContain('trend_recommendation');
  });

  it('every skill has required fields', () => {
    for (const skill of SKILL_REGISTRY) {
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.triggers).toBeInstanceOf(Array);
      expect(skill.triggers.length).toBeGreaterThan(0);
      expect(typeof skill.confirmationRequired).toBe('boolean');
      expect(skill.executor).toBeTruthy();
    }
  });

  it('set_schedule and trend_recommendation require confirmation', () => {
    const confirming = SKILL_REGISTRY.filter((s) => s.confirmationRequired);
    expect(confirming).toHaveLength(2);
    const names = confirming.map((s) => s.name);
    expect(names).toContain('set_schedule');
    expect(names).toContain('trend_recommendation');
  });
});

describe('buildSkillSummaries', () => {
  it('returns a string with all skill names', () => {
    const summaries = buildSkillSummaries();
    expect(summaries).toContain('set_schedule');
    expect(summaries).toContain('swap_workout');
    expect(summaries).toContain('adjust_load');
    expect(summaries).toContain('update_training_plan');
    expect(summaries).toContain('read_health_data');
  });

  it('returns one line per skill', () => {
    const summaries = buildSkillSummaries();
    const lines = summaries.split('\n');
    expect(lines).toHaveLength(6);
  });
});

describe('getSkillInstructions', () => {
  it('returns instructions for set_schedule', () => {
    const instructions = getSkillInstructions('set_schedule');
    expect(instructions).toBeTruthy();
    expect(instructions).toContain('Extract Intent');
    expect(instructions).toContain('Validate');
    expect(instructions).toContain('Preview');
    expect(instructions).toContain('Confirm');
  });

  it('returns null for skills without instructions', () => {
    expect(getSkillInstructions('swap_workout')).toBeNull();
  });

  it('returns null for unknown skill', () => {
    expect(getSkillInstructions('nonexistent')).toBeNull();
  });
});

describe('findSkillByTrigger', () => {
  it('finds set_schedule by schedule_preference trigger', () => {
    const skill = findSkillByTrigger('schedule_preference');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('set_schedule');
  });

  it('finds swap_workout by workout_swap trigger', () => {
    const skill = findSkillByTrigger('workout_swap');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('swap_workout');
  });

  it('finds swap_workout by workout_modification trigger', () => {
    const skill = findSkillByTrigger('workout_modification');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('swap_workout');
  });

  it('finds adjust_load by load_adjustment trigger', () => {
    const skill = findSkillByTrigger('load_adjustment');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('adjust_load');
  });

  it('finds read_health_data by readiness_inquiry trigger', () => {
    const skill = findSkillByTrigger('readiness_inquiry');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('read_health_data');
  });

  it('returns null for unknown trigger', () => {
    expect(findSkillByTrigger('nonexistent')).toBeNull();
  });
});
