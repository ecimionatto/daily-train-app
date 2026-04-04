/**
 * Tool schemas for the on-device AI coach agent.
 *
 * These schemas follow the OpenAI-compatible function calling format
 * supported by llama.rn's completion API. The Hammer 2.1 model uses
 * these to decide which tool to call and extract structured arguments
 * from natural language.
 *
 * Each tool maps to a skill executor in services/skills/.
 */

export const COACH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_schedule',
      description:
        'Update weekly training schedule. Call when athlete wants to move, change, or set days for any discipline (strength, swim, rest, long sessions, weekend preference).',
      parameters: {
        type: 'object',
        properties: {
          strengthDays: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: 'Day indices for strength sessions (0=Sun, 1=Mon, ..., 6=Sat)',
          },
          restDays: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: 'Day indices for rest days',
          },
          longDays: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: 'Day indices for long endurance sessions',
          },
          avoidDays: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: 'Day indices to avoid training',
          },
          swimDays: {
            type: 'string',
            enum: ['mwf', 'tts'],
            description: 'Swim day pattern: mwf = Mon/Wed/Fri, tts = Tue/Thu/Sat',
          },
          weekendPreference: {
            type: 'string',
            enum: ['bike-sat-run-sun', 'run-sat-bike-sun'],
            description: 'Which long discipline goes on which weekend day',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_workout',
      description:
        "Replace today's workout with a different discipline or modified version. Call when athlete can't do today's workout, wants something different, or has constraints (injury, time, equipment).",
      parameters: {
        type: 'object',
        properties: {
          targetDiscipline: {
            type: 'string',
            enum: ['swim', 'bike', 'run', 'strength', 'rest'],
            description: 'Discipline to swap to (optional, agent picks if omitted)',
          },
          reason: {
            type: 'string',
            description: 'Why the swap is needed (injury, time constraint, preference)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_load',
      description:
        'Temporarily reduce or increase training load. Call when athlete mentions fatigue, injury, wanting easier/harder sessions, needing rest days, or focusing on a specific discipline.',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['reduce', 'increase'],
            description: 'Whether to reduce or increase load',
          },
          durationDays: {
            type: 'integer',
            minimum: 1,
            maximum: 14,
            description:
              'How many days the adjustment lasts (default 3 for reduce, 7 for increase)',
          },
          disciplineFocus: {
            type: 'string',
            enum: ['swim', 'bike', 'run'],
            description: 'Discipline to focus on if athlete requests more of one sport',
          },
          restTomorrow: {
            type: 'boolean',
            description: 'Set to true if athlete explicitly asks for tomorrow off',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description:
        'Update race date, distance, or race type. Call when athlete mentions a new race, changed race date, or wants to switch distance.',
      parameters: {
        type: 'object',
        properties: {
          raceDate: {
            type: 'string',
            description: 'New race date in YYYY-MM-DD format',
          },
          distance: {
            type: 'string',
            description: 'New distance key (e.g. "Half Ironman (70.3)", "Olympic", "Marathon")',
          },
          raceType: {
            type: 'string',
            enum: ['triathlon', 'running'],
            description: 'Race type',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_trends',
      description:
        "Analyze the athlete's recent training trends, compliance, and health data. Call when athlete asks how they're doing, wants a review, asks for recommendations, or says 'analyze my training'.",
      parameters: {
        type: 'object',
        properties: {
          windowDays: {
            type: 'integer',
            minimum: 7,
            maximum: 30,
            description: 'Number of days to analyze (default 14)',
          },
        },
      },
    },
  },
];

/**
 * Map tool names to skill executor keys.
 */
export const TOOL_TO_EXECUTOR = {
  set_schedule: 'setSchedule',
  swap_workout: 'swapWorkout',
  adjust_load: 'adjustLoad',
  update_plan: 'updatePlan',
  analyze_trends: 'trendRecommendation',
};
