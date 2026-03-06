/**
 * Local on-device AI inference using Qwen 3.5 (0.6B quantized)
 *
 * This service runs Qwen 3.5 locally on iPhone using llama.cpp via a
 * React Native native module bridge. No API calls needed — all inference
 * happens on-device for privacy and offline capability.
 *
 * SETUP REQUIRED:
 * 1. Eject from Expo: npx expo prebuild --platform ios
 * 2. Add the llama.cpp Swift bridge (see ios/IronCoach/LlamaModule.swift)
 * 3. Download the quantized Qwen 3.5 model (~400MB for Q4_K_M):
 *    https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF
 * 4. Place the .gguf file in the app bundle or download on first launch
 *
 * Until the native module is built, this falls back to a rule-based
 * workout generator that works without any model.
 */

import { NativeModules, Platform } from 'react-native';

const { LlamaModule } = NativeModules;

let modelLoaded = false;

/**
 * Initialize the local model. Call once on app start.
 * Downloads the model if not cached, loads it into memory.
 */
export async function initLocalModel() {
  if (Platform.OS !== 'ios' || !LlamaModule) {
    console.warn('Local model only available on iOS with native module');
    return false;
  }

  try {
    const result = await LlamaModule.loadModel('qwen3.5-0.6b-q4_k_m.gguf');
    modelLoaded = result;
    return result;
  } catch (e) {
    console.warn('Failed to load local model:', e);
    return false;
  }
}

/**
 * Run inference on the local Qwen 3.5 model.
 * Falls back to rule-based generation if model isn't available.
 */
export async function runInference(systemPrompt, userPrompt) {
  if (modelLoaded && LlamaModule) {
    try {
      const response = await LlamaModule.generate({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 1024,
        temperature: 0.7,
        topP: 0.9,
      });
      return response;
    } catch (e) {
      console.warn('Local model inference failed:', e);
      return null;
    }
  }
  return null;
}

/**
 * Generate a daily workout using local model or rule-based fallback.
 */
export async function generateWorkoutLocally({
  profile,
  healthData,
  readinessScore,
  phase,
  daysToRace,
}) {
  const systemPrompt = `You are an elite Ironman triathlon coach. Generate a JSON workout.
Respond ONLY with valid JSON matching this structure:
{"title":"string","discipline":"swim|bike|run|strength|rest","duration":number,"summary":"string","intensity":"easy|moderate|hard|recovery","sections":[{"name":"string","notes":"string","sets":[{"description":"string","zone":number|null}]}]}`;

  const userPrompt = `Athlete: ${profile.level}, ${profile.distance}, weekly hrs: ${profile.weeklyHours}, strongest: ${profile.strongestDiscipline}, weakest: ${profile.weakestDiscipline}, injuries: ${profile.injuries}, goal: ${profile.goalTime}.
Status: phase=${phase}, days to race=${daysToRace}, readiness=${readinessScore}/100, RHR=${healthData?.restingHR || 'N/A'}bpm, HRV=${healthData?.hrv || 'N/A'}ms, sleep=${healthData?.sleepHours?.toFixed(1) || 'N/A'}h.
Day: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.`;

  // Try local model first
  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) {
    try {
      const jsonStr = modelResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(jsonStr);
    } catch {
      console.warn('Failed to parse local model output, using fallback');
    }
  }

  // Rule-based fallback (no model needed)
  return generateRuleBasedWorkout({ profile, healthData, readinessScore, phase, daysToRace });
}

/**
 * Generate a weekly summary using local model or simple aggregation.
 */
export async function generateWeeklySummaryLocally({ profile, weekHistory, phase }) {
  const workoutList = weekHistory
    .map((w) => `${w.discipline}: ${w.title} (${w.duration}min)`)
    .join(', ');

  const systemPrompt =
    'You are an Ironman coach. Give a 2-3 paragraph weekly debrief. Plain text only.';
  const userPrompt = `Athlete: ${profile.level}, phase: ${phase}. Workouts: ${workoutList || 'none'}, total sessions: ${weekHistory.length}.`;

  const modelResponse = await runInference(systemPrompt, userPrompt);
  if (modelResponse) return modelResponse;

  // Simple fallback summary
  const totalMin = weekHistory.reduce((sum, w) => sum + (w.duration || 0), 0);
  const disciplines = {};
  weekHistory.forEach((w) => {
    const d = w.discipline?.toLowerCase() || 'other';
    disciplines[d] = (disciplines[d] || 0) + 1;
  });

  const parts = [
    `This week you completed ${weekHistory.length} sessions totaling ${Math.round(totalMin / 60)} hours and ${totalMin % 60} minutes of training.`,
  ];

  if (Object.keys(disciplines).length > 0) {
    const breakdown = Object.entries(disciplines)
      .map(([d, count]) => `${count} ${d}`)
      .join(', ');
    parts.push(`Breakdown: ${breakdown}.`);
  }

  parts.push(
    `You're in the ${phase.toLowerCase().replace('_', ' ')} phase. ${readinessMessage(phase)}`
  );

  return parts.join(' ');
}

function readinessMessage(phase) {
  const messages = {
    BASE: 'Focus on building consistent volume. Keep most sessions in Zone 2 and prioritize sleep.',
    BUILD: 'Time to add some intensity. Include one quality session per discipline each week.',
    PEAK: 'Your biggest training weeks are here. Balance hard sessions with adequate recovery.',
    TAPER: 'Volume is dropping but keep intensity up. Trust the process and prioritize rest.',
    RACE_WEEK: "Stay calm and stick to easy movement. You've done the work. Time to race.",
  };
  return messages[phase] || messages.BASE;
}

/**
 * Rule-based workout generator — works without any model.
 * Uses readiness score, training phase, day of week, and athlete profile
 * to construct a structured workout.
 */
function generateRuleBasedWorkout({ profile, _healthData, readinessScore, phase, _daysToRace }) {
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
  const score = readinessScore || 65;

  // Recovery day
  if (score < 55) {
    return {
      title: 'Active Recovery',
      discipline: 'rest',
      duration: 30,
      summary: 'Your readiness is low. Focus on gentle movement and recovery.',
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

  // Map days to disciplines with weekly structure
  const weekPlan = getWeeklyDisciplinePlan(phase, profile);
  const todayPlan = weekPlan[dayOfWeek];

  // Adjust duration based on phase and available hours
  const baseDuration = getBaseDuration(phase, profile.weeklyHours);
  const adjustedDuration =
    score >= 75 ? Math.round(baseDuration * 1.1) : Math.round(baseDuration * 0.9);

  return buildWorkout(todayPlan, adjustedDuration, score, phase, profile);
}

function getWeeklyDisciplinePlan(phase, profile) {
  const weak = profile.weakestDiscipline?.toLowerCase() || 'swim';
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  const plans = {
    BASE: ['rest', 'swim', 'bike', 'run', 'swim', 'strength', 'bike'],
    BUILD: ['rest', 'swim', 'bike', 'run', 'swim', 'bike', 'run'],
    PEAK: ['rest', weak, 'bike', 'run', 'swim', 'bike', 'run'],
    TAPER: ['rest', 'swim', 'bike', 'run', 'rest', 'swim', 'bike'],
    RACE_WEEK: ['rest', 'swim', 'bike', 'run', 'rest', 'rest', 'rest'],
  };
  return plans[phase] || plans.BASE;
}

function getBaseDuration(phase, weeklyHours) {
  const hoursMap = { '5-7': 50, '8-10': 70, '11-14': 85, '15+': 100 };
  const base = hoursMap[weeklyHours] || 60;
  const phaseMultiplier = {
    BASE: 0.9,
    BUILD: 1.0,
    PEAK: 1.1,
    TAPER: 0.7,
    RACE_WEEK: 0.4,
  };
  return Math.round(base * (phaseMultiplier[phase] || 1));
}

function buildWorkout(discipline, duration, readiness, _phase, _profile) {
  const intensity = readiness >= 75 ? 'hard' : 'moderate';

  const workouts = {
    swim: {
      title: intensity === 'hard' ? 'Threshold Swim' : 'Endurance Swim',
      discipline: 'swim',
      duration,
      summary:
        intensity === 'hard'
          ? 'Build threshold pace with structured intervals.'
          : 'Steady aerobic swimming to build endurance and technique.',
      intensity,
      sections: [
        {
          name: 'Warmup',
          notes: 'Easy swimming with drill focus.',
          sets: [
            { description: `${Math.round(duration * 0.15)} min easy free`, zone: 1 },
            { description: '4x50m drill/swim by 25', zone: 2 },
          ],
        },
        {
          name: 'Main Set',
          notes: intensity === 'hard' ? 'Push threshold pace on intervals.' : 'Hold steady pace.',
          sets:
            intensity === 'hard'
              ? [
                  { description: '6x200m at threshold pace, 20s rest', zone: 4 },
                  { description: '4x100m descending 1-4, 15s rest', zone: 3 },
                ]
              : [
                  { description: `${Math.round(duration * 0.5)} min steady swimming`, zone: 2 },
                  { description: 'Focus on bilateral breathing and catch', zone: 2 },
                ],
        },
        {
          name: 'Cooldown',
          notes: 'Easy swimming to flush.',
          sets: [{ description: `${Math.round(duration * 0.1)} min easy backstroke`, zone: 1 }],
        },
      ],
    },
    bike: {
      title: intensity === 'hard' ? 'Tempo Ride' : 'Zone 2 Endurance Ride',
      discipline: 'bike',
      duration,
      summary:
        intensity === 'hard'
          ? 'Build power at tempo with structured intervals.'
          : 'Steady aerobic ride to build your cycling base.',
      intensity,
      sections: [
        {
          name: 'Warmup',
          notes: 'Gradually increase effort.',
          sets: [{ description: `${Math.round(duration * 0.15)} min easy spinning`, zone: 1 }],
        },
        {
          name: 'Main Set',
          notes:
            intensity === 'hard' ? 'Tempo intervals with recovery.' : 'Maintain Zone 2 effort.',
          sets:
            intensity === 'hard'
              ? [
                  { description: '3x10 min at tempo, 3 min easy between', zone: 3 },
                  { description: 'Maintain 85-95 RPM during intervals', zone: 3 },
                ]
              : [
                  { description: `${Math.round(duration * 0.7)} min steady Zone 2`, zone: 2 },
                  { description: 'Smooth pedaling at 85-95 RPM', zone: 2 },
                ],
        },
        {
          name: 'Cooldown',
          notes: 'Easy spin to recover.',
          sets: [{ description: `${Math.round(duration * 0.1)} min easy spin`, zone: 1 }],
        },
      ],
    },
    run: {
      title: intensity === 'hard' ? 'Tempo Run' : 'Easy Aerobic Run',
      discipline: 'run',
      duration,
      summary:
        intensity === 'hard'
          ? 'Build running speed with tempo intervals.'
          : 'Relaxed aerobic run to build endurance.',
      intensity,
      sections: [
        {
          name: 'Warmup',
          notes: 'Easy jog with dynamic stretches.',
          sets: [
            { description: `${Math.round(duration * 0.15)} min easy jog`, zone: 1 },
            { description: 'Dynamic warm-up drills', zone: null },
          ],
        },
        {
          name: 'Main Set',
          notes: intensity === 'hard' ? 'Run at tempo effort.' : 'Keep it conversational.',
          sets:
            intensity === 'hard'
              ? [
                  { description: '4x5 min at tempo, 2 min jog recovery', zone: 3 },
                  { description: 'Focus on quick turnover ~170-180 spm', zone: 3 },
                ]
              : [
                  { description: `${Math.round(duration * 0.7)} min easy running`, zone: 2 },
                  { description: 'You should be able to hold a conversation', zone: 2 },
                ],
        },
        {
          name: 'Cooldown',
          notes: 'Easy jog and stretch.',
          sets: [
            { description: `${Math.round(duration * 0.1)} min easy jog`, zone: 1 },
            { description: 'Static stretching 5 min', zone: null },
          ],
        },
      ],
    },
    strength: {
      title: 'Functional Strength',
      discipline: 'strength',
      duration: Math.min(duration, 45),
      summary: 'Core and functional strength to prevent injury and improve efficiency.',
      intensity: 'moderate',
      sections: [
        {
          name: 'Warmup',
          notes: 'Activate key muscle groups.',
          sets: [
            { description: '5 min light cardio', zone: 1 },
            { description: 'Band activation: glutes, shoulders', zone: null },
          ],
        },
        {
          name: 'Main Set',
          notes: '3 rounds through.',
          sets: [
            { description: '12 single-leg deadlifts each side', zone: null },
            { description: '10 push-ups', zone: null },
            { description: '15 goblet squats', zone: null },
            { description: '30s side plank each side', zone: null },
            { description: '12 band pull-aparts', zone: null },
            { description: '60s rest between rounds', zone: null },
          ],
        },
        {
          name: 'Cooldown',
          notes: 'Stretch and foam roll.',
          sets: [{ description: '10 min stretching and foam rolling', zone: null }],
        },
      ],
    },
    rest: {
      title: 'Rest Day',
      discipline: 'rest',
      duration: 0,
      summary: 'Full rest day. Your body adapts and gets stronger during recovery.',
      intensity: 'recovery',
      sections: [
        {
          name: 'Recovery',
          notes: 'Optional light activity only.',
          sets: [
            { description: 'Light walk or gentle yoga if desired', zone: 1 },
            { description: 'Focus on hydration and nutrition', zone: null },
            { description: 'Aim for 8+ hours of sleep tonight', zone: null },
          ],
        },
      ],
    },
  };

  return workouts[discipline] || workouts.rest;
}
