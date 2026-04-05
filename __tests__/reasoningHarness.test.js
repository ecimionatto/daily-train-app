import {
  buildPlanProposalPrompt,
  buildWeeklyCheckInPrompt,
  buildDailyDisciplinePrompt,
} from '../services/reasoningHarness';

const mockAnalysis = {
  avgSessionsPerWeek: 6.5,
  avgMinutesPerWeek: 420,
  disciplinePerWeek: { swim: 2, bike: 2, run: 2, strength: 0.5 },
  avgConsistency: 78,
  trend: 'stable',
  gaps: ['strength'],
  strengths: ['run'],
};

const mockTargets = {
  swim: { count: 3, totalMinutes: 150 },
  bike: { count: 3, totalMinutes: 225 },
  run: { count: 3, totalMinutes: 165 },
  strength: { count: 1, totalMinutes: 40 },
};

const mockConsistency = {
  percentage: 75,
  byDiscipline: {
    swim: { completed: 2, target: 3 },
    bike: { completed: 1, target: 3 },
    run: { completed: 3, target: 3 },
    strength: { completed: 0, target: 1 },
  },
  keyWorkoutsHit: 6,
  totalKeyWorkouts: 10,
};

describe('reasoningHarness', () => {
  describe('buildPlanProposalPrompt', () => {
    it('stays under 500 tokens (~2000 chars)', () => {
      const prompt = buildPlanProposalPrompt(mockAnalysis, mockTargets, 'BUILD');
      expect(prompt.length).toBeLessThan(2000);
    });

    it('contains required sections', () => {
      const prompt = buildPlanProposalPrompt(mockAnalysis, mockTargets, 'BUILD');
      expect(prompt).toContain('HISTORY');
      expect(prompt).toContain('PROPOSED PLAN');
      expect(prompt).toContain('TASK');
    });

    it('includes analysis data', () => {
      const prompt = buildPlanProposalPrompt(mockAnalysis, mockTargets, 'BUILD');
      expect(prompt).toContain('6.5');
      expect(prompt).toContain('78%');
      expect(prompt).toContain('stable');
      expect(prompt).toContain('strength');
    });

    it('includes proposed targets', () => {
      const prompt = buildPlanProposalPrompt(mockAnalysis, mockTargets, 'BUILD');
      expect(prompt).toContain('swim: 3x/wk');
      expect(prompt).toContain('BUILD');
    });

    it('handles missing analysis fields gracefully', () => {
      const prompt = buildPlanProposalPrompt({}, mockTargets, 'BASE');
      expect(prompt).toContain('HISTORY');
      expect(prompt).toContain('0%');
      expect(prompt).toContain('none');
    });
  });

  describe('buildWeeklyCheckInPrompt', () => {
    it('stays under 300 tokens (~1200 chars)', () => {
      const prompt = buildWeeklyCheckInPrompt(mockConsistency, 72);
      expect(prompt.length).toBeLessThan(1200);
    });

    it('contains required sections', () => {
      const prompt = buildWeeklyCheckInPrompt(mockConsistency, 72);
      expect(prompt).toContain('WEEK PROGRESS');
      expect(prompt).toContain('TASK');
    });

    it('includes consistency data', () => {
      const prompt = buildWeeklyCheckInPrompt(mockConsistency, 72);
      expect(prompt).toContain('75%');
      expect(prompt).toContain('6/10');
    });

    it('handles null consistency', () => {
      const prompt = buildWeeklyCheckInPrompt(null, 72);
      expect(prompt).toContain('No data');
      expect(prompt).toContain('TASK');
    });

    it('handles null readiness', () => {
      const prompt = buildWeeklyCheckInPrompt(mockConsistency, null);
      expect(prompt).toContain('?/100');
    });
  });

  describe('buildDailyDisciplinePrompt', () => {
    it('stays under 250 tokens (~1000 chars)', () => {
      const prompt = buildDailyDisciplinePrompt({ swim: 1, bike: 2 }, 'Wednesday', 'bike', 72);
      expect(prompt.length).toBeLessThan(1000);
    });

    it('contains required sections', () => {
      const prompt = buildDailyDisciplinePrompt({ swim: 1, bike: 2 }, 'Wednesday', 'bike', 72);
      expect(prompt).toContain('REMAINING THIS WEEK');
      expect(prompt).toContain('TASK');
      expect(prompt).toContain('Wednesday');
      expect(prompt).toContain('bike');
    });

    it('handles empty remaining', () => {
      const prompt = buildDailyDisciplinePrompt({}, 'Sunday', 'rest', 80);
      expect(prompt).toContain('all targets met');
    });

    it('filters out zero-remaining disciplines', () => {
      const prompt = buildDailyDisciplinePrompt(
        { swim: 0, bike: 2, run: 0 },
        'Tuesday',
        'bike',
        65
      );
      expect(prompt).not.toContain('swim');
      expect(prompt).toContain('bike: 2 left');
    });
  });

  describe('all templates', () => {
    it('include TASK instruction', () => {
      const p1 = buildPlanProposalPrompt(mockAnalysis, mockTargets, 'BUILD');
      const p2 = buildWeeklyCheckInPrompt(mockConsistency, 72);
      const p3 = buildDailyDisciplinePrompt({ swim: 1 }, 'Monday', 'swim', 70);
      [p1, p2, p3].forEach((prompt) => {
        expect(prompt).toContain('TASK:');
      });
    });
  });
});
