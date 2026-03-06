// ============================================
// IMPORTANT: Replace with your Anthropic API key
// For production, use environment variables or a backend proxy
// ============================================
const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

async function callClaude(systemPrompt, userPrompt) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Generate a daily workout based on athlete profile and health data.
 * Returns a structured workout object.
 */
export async function generateDailyWorkout({
  profile,
  healthData,
  readinessScore,
  phase,
  daysToRace,
}) {
  const systemPrompt = `You are an elite Ironman triathlon coach. You create personalized daily workouts based on the athlete's profile, current health metrics, training phase, and readiness score.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation, no extra text.

The JSON must follow this exact structure:
{
  "title": "string - descriptive workout title",
  "discipline": "swim" | "bike" | "run" | "strength" | "rest",
  "duration": number (minutes),
  "summary": "string - 1-2 sentence overview",
  "intensity": "easy" | "moderate" | "hard" | "recovery",
  "sections": [
    {
      "name": "string - e.g. Warmup, Main Set, Cooldown",
      "notes": "string - optional coaching notes",
      "sets": [
        {
          "description": "string - what to do",
          "zone": number (1-5) or null
        }
      ]
    }
  ]
}

Training zones:
- Zone 1: Easy/Recovery (RPE 1-3)
- Zone 2: Aerobic endurance (RPE 4-5)
- Zone 3: Tempo (RPE 6-7)
- Zone 4: Threshold (RPE 8)
- Zone 5: VO2max/sprint (RPE 9-10)

Readiness interpretation:
- Score < 55: Recovery day — easy spin, yoga, or full rest
- Score 55-75: Moderate effort — Zone 2 with short Zone 3 intervals
- Score > 75: Ready to push — quality session with Zone 3-4 intervals`;

  const userPrompt = `Generate today's workout.

ATHLETE PROFILE:
- Distance: ${profile.distance}
- Level: ${profile.level}
- Weekly hours: ${profile.weeklyHours}
- Strongest: ${profile.strongestDiscipline}
- Weakest: ${profile.weakestDiscipline}
- Swim background: ${profile.swimBackground}
- Previous Ironman: ${profile.previousIronman}
- Injuries: ${profile.injuries}
- Goal time: ${profile.goalTime}

CURRENT STATUS:
- Training phase: ${phase}
- Days to race: ${daysToRace}
- Readiness score: ${readinessScore}/100
- Resting HR: ${healthData?.restingHR || 'N/A'} bpm
- HRV: ${healthData?.hrv || 'N/A'} ms
- Sleep: ${healthData?.sleepHours?.toFixed(1) || 'N/A'} hours
- VO2Max: ${healthData?.vo2Max || 'N/A'} ml/kg/min

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.`;

  try {
    const response = await callClaude(systemPrompt, userPrompt);
    // Parse JSON from response, handling potential markdown wrapping
    const jsonStr = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('Failed to generate workout:', e);
    return getFallbackWorkout(readinessScore, phase);
  }
}

/**
 * Generate a weekly training summary and recommendations.
 * Returns a plain text summary string.
 */
export async function generateWeeklySummary({ profile, weekHistory, phase }) {
  const systemPrompt = `You are an elite Ironman triathlon coach reviewing an athlete's training week. Provide a concise, actionable weekly debrief in 3-5 paragraphs. Include:
1. What went well this week
2. Areas for improvement
3. Key focus for next week
4. Any recovery or nutrition recommendations

Keep it conversational but authoritative. Respond with plain text only, no JSON.`;

  const workoutSummary = weekHistory
    .map(
      (w) =>
        `${w.discipline}: ${w.title} (${w.duration}min, ${w.completedSets}/${w.totalSets} sets)`
    )
    .join('\n');

  const userPrompt = `Review this training week:

ATHLETE:
- Distance: ${profile.distance}
- Level: ${profile.level}
- Phase: ${phase}

WORKOUTS COMPLETED:
${workoutSummary || 'No workouts logged this week.'}

Total sessions: ${weekHistory.length}
Total time: ${weekHistory.reduce((sum, w) => sum + (w.duration || 0), 0)} minutes`;

  try {
    return await callClaude(systemPrompt, userPrompt);
  } catch (e) {
    console.warn('Failed to generate weekly summary:', e);
    return 'Unable to generate weekly summary. Check your API key and try again.';
  }
}

/**
 * Fallback workout when Claude API is unavailable.
 */
function getFallbackWorkout(readinessScore, _phase) {
  if (readinessScore < 55) {
    return {
      title: 'Active Recovery',
      discipline: 'rest',
      duration: 30,
      summary: 'Your readiness is low today. Focus on gentle movement and recovery.',
      intensity: 'recovery',
      sections: [
        {
          name: 'Recovery Session',
          notes: 'Keep everything easy. Focus on breathing and mobility.',
          sets: [
            { description: '10 min easy walk or gentle spin', zone: 1 },
            { description: '10 min stretching and foam rolling', zone: null },
            { description: '10 min yoga or mobility work', zone: null },
          ],
        },
      ],
    };
  }

  return {
    title: 'Zone 2 Endurance',
    discipline: 'bike',
    duration: 60,
    summary: 'Steady aerobic ride to build your base. Keep heart rate in Zone 2.',
    intensity: 'moderate',
    sections: [
      {
        name: 'Warmup',
        notes: 'Gradually increase effort.',
        sets: [
          { description: '10 min easy spinning, RPE 2-3', zone: 1 },
          { description: '5 min build to Zone 2 effort', zone: 2 },
        ],
      },
      {
        name: 'Main Set',
        notes: 'Maintain steady Zone 2 effort throughout.',
        sets: [
          { description: '35 min steady Zone 2 riding', zone: 2 },
          { description: 'Focus on smooth pedaling at 85-95 RPM', zone: 2 },
        ],
      },
      {
        name: 'Cooldown',
        notes: 'Easy spinning to flush the legs.',
        sets: [{ description: '10 min easy spin, gradually reduce effort', zone: 1 }],
      },
    ],
  };
}
