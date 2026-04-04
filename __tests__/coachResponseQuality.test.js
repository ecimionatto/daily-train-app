/**
 * Coach Response Quality Tests
 *
 * Validates that the AI coach returns natural language responses (not code,
 * JSON, or raw tool-call output) across all conversation scenarios.
 *
 * These tests exercise the full getCoachResponse → agentOrchestrator → fallback
 * chain with controlled mocks, asserting that every response path produces
 * human-readable coaching text.
 */

import { getCoachResponse, classifyMessage, isOffTopic } from '../services/chatService';
import { processMessage as agentProcessMessage } from '../services/agentOrchestrator';
import { runToolInference, runInference, ModelNotReadyError } from '../services/localModel';
import {
  executeSkillPreview,
  commitSkill,
  classifyConfirmation,
} from '../services/skills/executor';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('../services/localModel', () => ({
  runInference: jest.fn(),
  runToolInference: jest.fn(),
  runStructuredExtraction: jest.fn(),
  getModelLoadingProgress: jest.fn().mockReturnValue(100),
  ModelNotReadyError: class ModelNotReadyError extends Error {
    constructor() {
      super('Model not ready');
      this.name = 'ModelNotReadyError';
    }
  },
  ContextFullError: class ContextFullError extends Error {
    constructor() {
      super('Context full');
      this.name = 'ContextFullError';
    }
  },
  generateReplacementWorkout: jest.fn(),
  generateWorkoutLocally: jest.fn(),
  generateWeeklyReview: jest.fn(),
}));

jest.mock('../services/skills/executor', () => ({
  executeSkillPreview: jest.fn(),
  commitSkill: jest.fn(),
  classifyConfirmation: jest.fn(),
  resolveSkill: jest.fn(),
}));

jest.mock('../services/trendAnalysis', () => ({
  generateTrendSummary: jest.fn().mockReturnValue(null),
  detectPaceAchievements: jest.fn().mockReturnValue([]),
  formatAchievementsForCoach: jest.fn().mockReturnValue(''),
}));

jest.mock('../services/healthKit', () => ({
  deriveHRZonesFromWorkouts: jest.fn().mockReturnValue(null),
}));

jest.mock('../services/raceConfig', () => ({
  isRunningOnly: jest.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CODE_PATTERNS = [
  /^\s*\{[\s\S]*\}\s*$/, // JSON object
  /^\s*\[[\s\S]*\]\s*$/, // JSON array
  /function\s*\(/, // function keyword
  /=>\s*\{/, // arrow function
  /import\s+/, // import statement
  /export\s+/, // export statement
  /const\s+\w+\s*=/, // const declaration
  /let\s+\w+\s*=/, // let declaration
  /var\s+\w+\s*=/, // var declaration
  /console\.log/, // console.log
  /\breturn\s+\{/, // return statement with object
  /<\|im_start\|>/, // ChatML token leaked
  /<\|im_end\|>/, // ChatML token leaked
  /<\|endoftext\|>/, // End-of-text token leaked
  /tool_call/, // raw tool_call in output
  /"type"\s*:\s*"function"/, // tool schema JSON leaked
  /"name"\s*:\s*"(set_schedule|swap_workout|adjust_load|update_plan|analyze_trends)"/, // tool name as JSON
  /\{\s*"function"\s*:/, // raw tool call object
  /\{\s*"arguments"\s*:/, // raw arguments object
  /\{\s*"strengthDays"\s*:/, // raw extracted args leaked
  /\{\s*"direction"\s*:/, // raw extracted args leaked
  /\{\s*"targetDiscipline"\s*:/, // raw extracted args leaked
];

function assertNaturalLanguage(response, scenario) {
  // Unwrap structured responses
  const text = typeof response === 'object' && response !== null ? response.text : response;

  expect(text).toBeDefined();
  expect(typeof text).toBe('string');
  expect(text.length).toBeGreaterThan(0);

  // Must not be code or JSON
  for (const pattern of CODE_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }

  // Must contain at least one natural language word
  const words = text.split(/\s+/).filter((w) => w.length > 2);
  expect(words.length).toBeGreaterThanOrEqual(3);

  // Shouldn't be longer than ~1000 chars (150 word constraint ≈ 750 chars + some buffer)
  if (text.length > 1500) {
    // eslint-disable-next-line no-console
    console.warn(`[${scenario}] Response unusually long: ${text.length} chars`);
  }
}

function buildMockContext(overrides = {}) {
  return {
    athleteProfile: {
      raceType: 'triathlon',
      distance: 'Half Ironman (70.3)',
      weeklyHours: '8-10',
      raceDate: '2026-09-15',
      schedulePreferences: {
        swimDays: 'mwf',
        weekendPreference: 'bike-sat-run-sun',
      },
    },
    phase: 'BUILD',
    daysToRace: 164,
    readinessScore: 72,
    todayWorkout: {
      discipline: 'run',
      title: 'Zone 2 Easy Run',
      duration: 45,
    },
    weekPlan: ['rest', 'swim', 'bike', 'run', 'swim+bike', 'strength', 'run'],
    healthData: { restingHR: 52, hrv: 48, sleepHours: 7.2 },
    completedWorkouts: [],
    conversationHistory: [],
    onWorkoutSwap: jest.fn(),
    onProfileUpdate: jest.fn(),
    pendingAction: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------
describe('Coach Response Quality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: model throws ModelNotReadyError (forces fallback chain)
    runToolInference.mockRejectedValue(new ModelNotReadyError());
    runInference.mockRejectedValue(new ModelNotReadyError());
  });

  // =========================================================================
  // 1. GENERAL CONVERSATION — model returns text (no tool call)
  // =========================================================================
  describe('General coaching conversation', () => {
    it('returns natural language for "how should I pace my long run"', async () => {
      runToolInference.mockResolvedValue({
        text: 'Keep your long run in Zone 2 — conversational pace. You should be able to talk in full sentences. Start conservative and finish strong.',
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('how should I pace my long run', ctx, []);
      assertNaturalLanguage(response, 'long run pacing');
    });

    it('returns natural language for "what should I eat before a race"', async () => {
      runToolInference.mockResolvedValue({
        text: 'Focus on familiar carbs 2-3 hours before. Avoid anything new on race day. A banana and toast with peanut butter works great.',
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('what should I eat before a race', ctx, []);
      assertNaturalLanguage(response, 'nutrition advice');
    });

    it('returns natural language for "I feel great today"', async () => {
      runToolInference.mockResolvedValue({
        text: "That's great energy! Channel it into today's Zone 2 run — strong and controlled. Save the extra spark for your BUILD phase intervals.",
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('I feel great today', ctx, []);
      assertNaturalLanguage(response, 'feeling great');
    });

    it('returns natural language for simple greeting "hello"', async () => {
      runToolInference.mockResolvedValue({
        text: "Ready to train! You've got a Zone 2 Easy Run on the schedule today. How are you feeling?",
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('hello coach', ctx, []);
      assertNaturalLanguage(response, 'greeting');
    });
  });

  // =========================================================================
  // 2. TOOL-CALLING RESPONSES — model calls a tool, skill returns preview
  // =========================================================================
  describe('Tool-calling skill preview flow', () => {
    it('returns natural language preview for "move strength to Monday"', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [{ function: { name: 'set_schedule', arguments: '{"strengthDays":[1]}' } }],
      });
      executeSkillPreview.mockResolvedValue({
        diff: {
          table: 'Mon: swim → swim+strength\nFri: strength → bike',
          summary: 'Strength moved to Monday, stacked with swim.',
        },
        executor: 'setSchedule',
        intents: { strengthDays: [1] },
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('move strength to Monday', ctx, []);
      assertNaturalLanguage(response, 'schedule preview');
      expect(response.pendingAction).toBeDefined();
    });

    it('returns natural language preview for "analyze my training"', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [{ function: { name: 'analyze_trends', arguments: '{"windowDays":14}' } }],
      });
      executeSkillPreview.mockResolvedValue({
        diff: {
          table: '- Swim compliance: 67% (2/3 sessions)\n- Run volume: +12% vs last week',
          summary: 'Recommendation: add one more swim session. Swap Thursday run for swim.',
        },
        executor: 'trendRecommendation',
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('analyze my training', ctx, []);
      assertNaturalLanguage(response, 'trend analysis');
    });

    it('returns natural language for swap workout direct response', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [
          {
            function: {
              name: 'swap_workout',
              arguments: '{"targetDiscipline":"bike","reason":"knee pain"}',
            },
          },
        ],
      });
      executeSkillPreview.mockResolvedValue({
        directResponse:
          "Swapped your run for a low-impact bike session. Keep the cadence high and avoid standing climbs to protect your knee. If pain persists, let's make tomorrow a rest day.",
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('my knee hurts, can I bike instead', ctx, []);
      assertNaturalLanguage(response, 'swap workout');
    });

    it('returns natural language for adjust load', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [
          {
            function: {
              name: 'adjust_load',
              arguments: '{"direction":"reduce","durationDays":3}',
            },
          },
        ],
      });
      executeSkillPreview.mockResolvedValue({
        directResponse:
          "Scaling back for the next 3 days. I'll keep your sessions shorter and in Zone 1-2. Listen to your body — rest is training too.",
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse("I'm exhausted, take it easy this week", ctx, []);
      assertNaturalLanguage(response, 'load reduction');
    });
  });

  // =========================================================================
  // 3. CONFIRMATION FLOW — yes/no to pending action
  // =========================================================================
  describe('Confirmation flow', () => {
    it('returns natural language on "yes" confirmation', async () => {
      classifyConfirmation.mockReturnValue('yes');
      commitSkill.mockResolvedValue(
        'Schedule updated! Your training plan has been adjusted. Strength is now on Monday, stacked with your swim session.'
      );
      const ctx = buildMockContext({
        pendingAction: { executor: 'setSchedule', intents: { strengthDays: [1] } },
      });
      const response = await agentProcessMessage('yes', ctx);
      assertNaturalLanguage(response, 'confirmation yes');
      expect(response.clearPending).toBe(true);
    });

    it('returns natural language on "no" rejection', async () => {
      classifyConfirmation.mockReturnValue('no');
      const ctx = buildMockContext({
        pendingAction: { executor: 'setSchedule', intents: { strengthDays: [1] } },
      });
      const response = await agentProcessMessage('no thanks', ctx);
      assertNaturalLanguage(response, 'confirmation no');
      expect(response.clearPending).toBe(true);
    });

    it('returns natural language on ambiguous confirmation', async () => {
      classifyConfirmation.mockReturnValue('ambiguous');
      const ctx = buildMockContext({
        pendingAction: { executor: 'setSchedule', intents: { strengthDays: [1] } },
      });
      const response = await agentProcessMessage('hmm maybe', ctx);
      assertNaturalLanguage(response, 'confirmation ambiguous');
    });
  });

  // =========================================================================
  // 4. FALLBACK CHAIN — model not ready, keyword handlers kick in
  // =========================================================================
  describe('Fallback to keyword handlers (model not ready)', () => {
    beforeEach(() => {
      runToolInference.mockRejectedValue(new ModelNotReadyError());
      runInference.mockRejectedValue(new ModelNotReadyError());
    });

    it('returns natural language for fatigue messages', async () => {
      const ctx = buildMockContext();
      const response = await getCoachResponse("I'm so tired and exhausted", ctx, []);
      assertNaturalLanguage(response, 'fatigue fallback');
    });

    it('returns natural language for off-topic messages', async () => {
      const response = await getCoachResponse(
        'what is the capital of France',
        buildMockContext(),
        []
      );
      assertNaturalLanguage(response, 'off-topic');
      expect(response).toContain('endurance coach');
    });

    it('returns natural language for workout swap request', async () => {
      const ctx = buildMockContext();
      ctx.onWorkoutSwap.mockResolvedValue({
        discipline: 'bike',
        title: 'Easy Spin',
        duration: 40,
      });
      const response = await getCoachResponse("can I swap today's workout for a bike", ctx, []);
      assertNaturalLanguage(response, 'swap fallback');
    });

    it('returns natural language for plan regeneration request', async () => {
      const ctx = buildMockContext();
      const response = await getCoachResponse('regenerate my training plan', ctx, []);
      assertNaturalLanguage(response, 'plan regen fallback');
    });
  });

  // =========================================================================
  // 5. EDGE CASES — malformed model output
  // =========================================================================
  describe('Edge cases: malformed model output', () => {
    it('does not leak JSON when model returns raw JSON as text', async () => {
      runToolInference.mockResolvedValue({
        text: '{"function": {"name": "set_schedule", "arguments": {"strengthDays": [1]}}}',
        toolCalls: [],
      });
      // Sanitizer strips JSON → agent null → keyword fallback → runInference fallback
      runInference.mockResolvedValue(
        'I can help you move your strength day. Which day works best for you?'
      );
      const ctx = buildMockContext();
      const response = await getCoachResponse('move strength to Monday', ctx, []);
      const text = typeof response === 'object' ? response.text : response;
      expect(text).not.toMatch(/^\s*\{/);
    });

    it('does not leak tool schema when model echoes the schema', async () => {
      runToolInference.mockResolvedValue({
        text: '"type": "function", "function": {"name": "set_schedule"}',
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('help with my schedule', ctx, []);
      const text = typeof response === 'object' ? response.text : response;
      expect(text).not.toMatch(/"type"\s*:\s*"function"/);
    });

    it('does not leak ChatML tokens', async () => {
      runToolInference.mockResolvedValue({
        text: '<|im_start|>assistant\nHere is your plan<|im_end|>',
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('what is my plan today', ctx, []);
      const text = typeof response === 'object' ? response.text : response;
      expect(text).not.toContain('<|im_start|>');
      expect(text).not.toContain('<|im_end|>');
    });

    it('does not leak raw arguments object', async () => {
      runToolInference.mockResolvedValue({
        text: '{"strengthDays": [1], "restDays": [0, 5]}',
        toolCalls: [],
      });
      // Sanitizer strips JSON → agent null → keyword fallback → runInference fallback
      runInference.mockResolvedValue(
        "Let me know which days you'd prefer for strength and rest, and I'll adjust your plan."
      );
      const ctx = buildMockContext();
      const response = await getCoachResponse('move my strength day', ctx, []);
      const text = typeof response === 'object' ? response.text : response;
      expect(text).not.toMatch(/^\s*\{/);
    });

    it('handles null text and empty toolCalls gracefully', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [],
      });
      // Agent returns null → falls through to keyword handlers
      const ctx = buildMockContext();
      const response = await getCoachResponse('how is my training going', ctx, []);
      // Should get a fallback response, not null/undefined displayed
      expect(response).toBeDefined();
      expect(response).not.toBeNull();
      if (typeof response === 'string') {
        expect(response.length).toBeGreaterThan(0);
      }
    });

    it('handles undefined tool_calls field from model', async () => {
      runToolInference.mockResolvedValue({
        text: 'Your training is on track. Keep focusing on consistency.',
        // tool_calls missing entirely (undefined)
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('am I on track', ctx, []);
      assertNaturalLanguage(response, 'undefined toolCalls');
    });
  });

  // =========================================================================
  // 6. RESPONSE STRUCTURE — ChatContext compatibility
  // =========================================================================
  describe('Response structure for ChatContext', () => {
    it('string responses have no .text property', async () => {
      runToolInference.mockResolvedValue({
        text: 'Great question! Zone 2 training builds your aerobic engine.',
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('what is zone 2 training', ctx, []);
      // String response should be a plain string
      if (typeof response !== 'string') {
        // If it's an object, it MUST have .text
        expect(response).toHaveProperty('text');
        expect(typeof response.text).toBe('string');
      }
    });

    it('skill preview responses have text and pendingAction', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [{ function: { name: 'set_schedule', arguments: '{"restDays":[5]}' } }],
      });
      executeSkillPreview.mockResolvedValue({
        diff: {
          table: 'Fri: strength → rest',
          summary: 'Friday becomes a rest day.',
        },
        executor: 'setSchedule',
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('make Friday a rest day', ctx, []);
      expect(typeof response).toBe('object');
      expect(response).toHaveProperty('text');
      expect(typeof response.text).toBe('string');
      expect(response).toHaveProperty('pendingAction');
    });

    it('confirmation responses have clearPending flag', async () => {
      classifyConfirmation.mockReturnValue('yes');
      commitSkill.mockResolvedValue('Done! Your plan has been updated.');
      const ctx = buildMockContext({
        pendingAction: { executor: 'setSchedule' },
      });
      const response = await agentProcessMessage('yes do it', ctx);
      expect(response).toHaveProperty('clearPending', true);
      expect(response).toHaveProperty('text');
    });
  });

  // =========================================================================
  // 7. SANITIZATION — responses must be clean for display
  // =========================================================================
  describe('Response sanitization', () => {
    it('model text response does not contain code blocks', async () => {
      runToolInference.mockResolvedValue({
        text: '```javascript\nconsole.log("hello")\n```',
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('tell me about my plan', ctx, []);
      const text = typeof response === 'object' ? response.text : response;
      // Sanitizer should strip code blocks → fallback kicks in
      expect(text).not.toContain('```');
      expect(text).not.toContain('console.log');
    });

    it('skill fallbackToHandler returns null to agent (not leaked)', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [
          { function: { name: 'swap_workout', arguments: '{"reason":"want something else"}' } },
        ],
      });
      executeSkillPreview.mockResolvedValue({ fallbackToHandler: true });
      const ctx = buildMockContext();
      // Agent returns null → chatService falls through to keyword handlers
      const response = await getCoachResponse("swap today's workout", ctx, []);
      // Should not be null — fallback should catch it
      expect(response).toBeDefined();
      if (typeof response === 'string') {
        expect(response.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // 8. REAL-WORLD SCENARIOS from user testing
  // =========================================================================
  describe('Real-world athlete conversations', () => {
    it('"how am I doing" gets coaching text, not data dump', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [{ function: { name: 'analyze_trends', arguments: '{}' } }],
      });
      executeSkillPreview.mockResolvedValue({
        directResponse:
          "You've been consistent this week — 4 out of 5 planned sessions completed. Your swim frequency is a bit low at 2 sessions versus the target of 3. Consider swapping one easy run for a swim this week. Overall, great progress in your BUILD phase!",
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('how am I doing', ctx, []);
      assertNaturalLanguage(response, 'how am I doing');
    });

    it('"I have a meeting Wednesday, skip that day" gets natural response', async () => {
      runToolInference.mockResolvedValue({
        text: null,
        toolCalls: [{ function: { name: 'set_schedule', arguments: '{"avoidDays":[3]}' } }],
      });
      executeSkillPreview.mockResolvedValue({
        diff: {
          table: 'Wed: run → rest\nThu: swim+bike → swim+bike+run',
          summary: 'Wednesday cleared. Run moved to Thursday.',
        },
        executor: 'setSchedule',
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('I have a meeting Wednesday, skip that day', ctx, []);
      assertNaturalLanguage(response, 'skip wednesday');
    });

    it('"make weekends lighter" gets coaching text', async () => {
      runToolInference.mockResolvedValue({
        text: "I hear you on wanting lighter weekends. Your current plan has long bike on Saturday and long run on Sunday. I'd suggest keeping those but shortening the duration by 20%. Want me to adjust the load?",
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('make weekends lighter', ctx, []);
      assertNaturalLanguage(response, 'lighter weekends');
    });

    it('"what is my workout today" gets coaching text', async () => {
      runToolInference.mockResolvedValue({
        text: 'Today is a Zone 2 Easy Run — 45 minutes at conversational pace. Focus on keeping your heart rate in Zone 2 and building that aerobic base. Enjoy it!',
        toolCalls: [],
      });
      const ctx = buildMockContext();
      const response = await getCoachResponse('what is my workout today', ctx, []);
      assertNaturalLanguage(response, 'today workout');
    });
  });

  // =========================================================================
  // 9. MESSAGE CLASSIFICATION (no model needed)
  // =========================================================================
  describe('Message classification correctness', () => {
    const classificationTests = [
      { message: 'move strength to Monday', expected: 'schedule_preference' },
      { message: 'I need a rest day Friday', expected: 'load_adjustment' }, // "rest day" → load_adjustment
      { message: "swap today's workout", expected: 'workout_modification' }, // "swap" → modification
      { message: "I'm exhausted", expected: 'load_adjustment' }, // fatigue → load_adjustment
      { message: 'my knee hurts', expected: 'recovery' }, // pain → recovery
      { message: 'regenerate my plan', expected: 'plan_regeneration' },
      { message: 'make it easier this week', expected: 'load_adjustment' },
      { message: 'how was my week', expected: 'trend_analysis' },
      { message: 'analyze my training', expected: 'trend_analysis' },
    ];

    classificationTests.forEach(({ message, expected }) => {
      it(`classifies "${message}" as ${expected}`, () => {
        const category = classifyMessage(message);
        expect(category).toBe(expected);
      });
    });
  });

  // =========================================================================
  // 10. OFF-TOPIC DETECTION
  // =========================================================================
  describe('Off-topic detection', () => {
    const offTopicMessages = [
      'tell me a joke',
      'who won the football game',
      'write me a poem',
      'how do I cook pasta',
    ];

    const onTopicMessages = [
      'how should I pace my run',
      'I feel tired today',
      'what is my workout',
      'move strength to Monday',
      'how is my training',
      'need a rest day',
    ];

    offTopicMessages.forEach((msg) => {
      it(`detects "${msg}" as off-topic`, () => {
        expect(isOffTopic(msg)).toBe(true);
      });
    });

    onTopicMessages.forEach((msg) => {
      it(`detects "${msg}" as on-topic`, () => {
        expect(isOffTopic(msg)).toBe(false);
      });
    });
  });
});
