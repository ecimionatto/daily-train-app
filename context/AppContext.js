import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchHealthData,
  fetchHealthHistory,
  calculateReadiness,
  fetchCompletedWorkouts,
  computeAndSaveHRProfile,
} from '../services/healthKit';
import { analyzeHealthTrends, analyzeWorkoutTrends } from '../services/trendAnalysis';
import {
  findRecentCompletedWorkouts,
  calculateRecentComplianceScore,
  calculateRecentActivityScore,
  calculateRacePreparationScore,
  calculateOverallReadiness,
  calculateDailyComplianceScore,
  getCompletionFeedback,
} from '../services/workoutScoring';
import {
  initLocalModel,
  isModelReady,
  onModelProgress,
  getWeeklyDisciplinePlan,
  getBaseDuration,
  generateWorkoutLocally,
  sanitizeWorkout,
} from '../services/localModel';
import { getDisciplinesForProfile } from '../services/raceConfig';

const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [athleteProfile, setAthleteProfile] = useState(undefined);
  const [healthData, setHealthData] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [readinessScore, setReadinessScore] = useState(null);
  const [alternativeWorkout, setAlternativeWorkout] = useState(null);
  const [recentScore, setRecentScore] = useState(null);
  const [tomorrowWorkout, setTomorrowWorkout] = useState(null);
  const [tomorrowAlternatives, setTomorrowAlternatives] = useState([]);
  const [tomorrowAlternativeIndex, setTomorrowAlternativeIndex] = useState(0);
  const [generatingTomorrow, setGeneratingTomorrow] = useState(false);
  const [overallReadiness, setOverallReadiness] = useState(null);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [completedWorkouts, setCompletedWorkouts] = useState([]);
  const [todayWorkoutStatus, setTodayWorkoutStatus] = useState('pending');
  const [todayMatchedWorkout, setTodayMatchedWorkout] = useState(null);
  const [trends, setTrends] = useState(null);
  const [modelStatus, setModelStatus] = useState('idle');
  const [modelProgress, setModelProgress] = useState(0);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (athleteProfile) {
      migrateProfileIfNeeded(athleteProfile);
      loadHealthData();
      loadCachedWorkout();
      loadCachedTomorrowWorkout();
      loadWorkoutHistory();
      loadCompletedWorkouts();
      loadLocalModel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteProfile]);

  useEffect(() => {
    if (readinessScore !== null) {
      computeRecentScore(completedWorkouts);
      computeOverallReadiness(readinessScore, workoutHistory, completedWorkouts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutHistory, completedWorkouts, readinessScore]);

  useEffect(() => {
    detectTodayCompletion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedWorkouts, todayWorkout]);

  useEffect(() => {
    if (completedWorkouts && completedWorkouts.length > 0) {
      computeTrends();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedWorkouts, healthData]);

  async function loadProfile() {
    try {
      const stored = await AsyncStorage.getItem('athleteProfile');
      setAthleteProfile(stored ? JSON.parse(stored) : null);
    } catch (e) {
      console.warn('Failed to load profile:', e);
      setAthleteProfile(null);
    }
  }

  async function saveProfile(profile) {
    try {
      await AsyncStorage.setItem('athleteProfile', JSON.stringify(profile));
      setAthleteProfile(profile);
    } catch (e) {
      console.warn('Failed to save profile:', e);
    }
  }

  async function loadHealthData() {
    try {
      const data = await fetchHealthData();
      setHealthData(data);
      const score = calculateReadiness(data);
      setReadinessScore(score);
    } catch (e) {
      console.warn('Failed to load health data:', e);
    }
  }

  async function loadLocalModel() {
    if (isModelReady()) {
      setModelStatus('ready');
      return;
    }
    setModelStatus('downloading');
    onModelProgress((pct) => setModelProgress(pct));
    try {
      const ok = await initLocalModel();
      setModelStatus(ok ? 'ready' : 'error');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Failed to load AI model:', e.message || e);
      setModelStatus('error');
    }
  }

  async function loadCachedWorkout() {
    try {
      const cached = await AsyncStorage.getItem('todayWorkout');
      if (!cached) return;

      const parsed = JSON.parse(cached);
      const today = new Date().toDateString();
      if (parsed.date !== today) return; // stale date — ignore

      // Validate that the cached discipline still matches the plan.
      // If the plan was regenerated or rebuilt, the cache may say "bike"
      // while the plan now prescribes "run". Discard and regenerate if so.
      const phase = getTrainingPhase();
      const weekPlan = getWeeklyDisciplinePlan(phase, athleteProfile);
      const prescribedDiscipline = weekPlan[new Date().getDay()];
      const cachedDiscipline = parsed.workout?.discipline;

      if (cachedDiscipline && prescribedDiscipline && cachedDiscipline !== prescribedDiscipline) {
        // eslint-disable-next-line no-console
        console.log(
          `[AppContext] Cached workout discipline "${cachedDiscipline}" does not match plan "${prescribedDiscipline}" — clearing cache`
        );
        await AsyncStorage.removeItem('todayWorkout');
        return;
      }

      // Re-run sanitizer on cached workout to fix stale zone-intensity mismatches
      // (e.g. AI-generated "Tempo Run" with Zone 2 sections from before the fix).
      setTodayWorkout(sanitizeWorkout(parsed.workout));
    } catch (e) {
      console.warn('Failed to load cached workout:', e);
    }
  }

  async function loadWorkoutHistory() {
    try {
      const raw = await AsyncStorage.getItem('workoutHistory');
      if (raw) {
        setWorkoutHistory(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('Failed to load workout history:', e);
    }
  }

  async function loadCompletedWorkouts() {
    try {
      const enrichOptions = {
        restingHR: healthData?.restingHR || null,
        age: athleteProfile?.age || null,
      };
      const workouts = await fetchCompletedWorkouts(14, enrichOptions);
      setCompletedWorkouts(workouts);
    } catch (e) {
      console.warn('Failed to load completed workouts:', e);
    }
  }

  async function migrateProfileIfNeeded(profile) {
    if (!profile.raceType) {
      const migrated = {
        ...profile,
        raceType: 'triathlon',
        previousRaces: profile.previousIronman || profile.previousRaces || 'First timer',
      };
      delete migrated.previousIronman;
      await saveProfile(migrated);
    }
    // v2: clear cached workout so discipline enforcement fix takes effect
    const WORKOUT_MIGRATION_V2_KEY = 'appMigration_v2_clearDisciplineCache';
    try {
      const done = await AsyncStorage.getItem(WORKOUT_MIGRATION_V2_KEY);
      if (!done) {
        await AsyncStorage.removeItem('todayWorkout');
        await AsyncStorage.setItem(WORKOUT_MIGRATION_V2_KEY, 'done');
        // eslint-disable-next-line no-console
        console.log('[AppContext] v2 migration: cleared stale todayWorkout cache');
      }
    } catch (e) {
      console.warn('[AppContext] v2 migration failed:', e);
    }

    // v3: clear cached workout so zone-intensity consistency fix takes effect
    // (AI-generated Tempo Run workouts with Zone 2 sections are now corrected on generation;
    //  stale cache entries pre-dating this fix must be discarded and regenerated.)
    const WORKOUT_MIGRATION_V3_KEY = 'appMigration_v3_clearZoneCache';
    try {
      const done = await AsyncStorage.getItem(WORKOUT_MIGRATION_V3_KEY);
      if (!done) {
        await AsyncStorage.removeItem('todayWorkout');
        await AsyncStorage.setItem(WORKOUT_MIGRATION_V3_KEY, 'done');
        // eslint-disable-next-line no-console
        console.log('[AppContext] v3 migration: cleared stale zone-inconsistent workout cache');
      }
    } catch (e) {
      console.warn('[AppContext] v3 migration failed:', e);
    }
  }

  async function saveTodayWorkout(workout) {
    try {
      // Guard: only save if discipline matches the plan for today.
      // Prevents caching a generated workout with the wrong discipline
      // (which would cause the coach to contradict Week/Home screens).
      const phase = getTrainingPhase();
      const weekPlan = getWeeklyDisciplinePlan(phase, athleteProfile);
      const prescribedDiscipline = weekPlan[new Date().getDay()];
      if (
        workout?.discipline &&
        prescribedDiscipline &&
        workout.discipline !== prescribedDiscipline
      ) {
        // eslint-disable-next-line no-console
        console.log(
          `[AppContext] Refusing to save workout with discipline "${workout.discipline}" — plan prescribes "${prescribedDiscipline}" today`
        );
        return;
      }
      const today = new Date().toDateString();
      await AsyncStorage.setItem('todayWorkout', JSON.stringify({ date: today, workout }));
      setTodayWorkout(workout);
    } catch (e) {
      console.warn('Failed to save workout:', e);
    }
  }

  async function swapTodayWorkout(newWorkout) {
    try {
      const today = new Date().toDateString();
      await AsyncStorage.setItem(
        'todayWorkout',
        JSON.stringify({ date: today, workout: newWorkout })
      );
      setTodayWorkout(newWorkout);
    } catch (e) {
      console.warn('Failed to swap workout:', e);
    }
  }

  /**
   * Reset the training plan by clearing cached workouts from AsyncStorage.
   * Preserves athleteProfile — only clears generated workout data.
   * Re-fetches completed workouts from Apple Health after reset.
   */
  async function resetTrainingPlan() {
    try {
      await AsyncStorage.multiRemove(['todayWorkout', 'tomorrowWorkout', 'workoutHistory']);
      setTodayWorkout(null);
      setTomorrowWorkout(null);
      setWorkoutHistory([]);
      setCompletedWorkouts([]);
      await loadCompletedWorkouts();
      // Recompute HR profile from fresh 6-month history after plan reset.
      // Wrapped in Promise.resolve so test auto-mocks don't throw.
      Promise.resolve(computeAndSaveHRProfile(athleteProfile, saveProfile)).catch(() => {});
    } catch (e) {
      console.warn('Failed to reset training plan:', e);
    }
  }

  /**
   * Clear the cached today workout and reset state to null.
   * Used after coach-driven plan changes so DashboardScreen regenerates
   * a fresh workout based on the updated athlete profile.
   */
  async function clearTodayWorkout() {
    try {
      await AsyncStorage.removeItem('todayWorkout');
      setTodayWorkout(null);
    } catch (e) {
      console.warn('Failed to clear today workout:', e);
    }
  }

  function saveAlternativeWorkout(workout) {
    setAlternativeWorkout(workout);
  }

  async function loadCachedTomorrowWorkout() {
    try {
      const cached = await AsyncStorage.getItem('tomorrowWorkout');
      if (cached) {
        const parsed = JSON.parse(cached);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (parsed.date === tomorrow.toDateString()) {
          setTomorrowWorkout(parsed.workout);
          setTomorrowAlternatives(parsed.alternatives || []);
          setTomorrowAlternativeIndex(parsed.altIndex || 0);
        } else {
          // Stale cache — clear it
          await AsyncStorage.removeItem('tomorrowWorkout');
        }
      }
    } catch (e) {
      console.warn('Failed to load cached tomorrow workout:', e);
    }
  }

  async function saveTomorrowCache(workout, alternatives, altIndex) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await AsyncStorage.setItem(
      'tomorrowWorkout',
      JSON.stringify({ date: tomorrow.toDateString(), workout, alternatives, altIndex })
    );
  }

  async function generateAndSaveTomorrow() {
    if (!athleteProfile) return;
    setGeneratingTomorrow(true);
    try {
      const phase = getTrainingPhase();
      const daysToRace = getDaysToRace();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDay = tomorrow.getDay();
      const weekPlan = getWeeklyDisciplinePlan(phase, athleteProfile);
      const primaryDiscipline = weekPlan[tomorrowDay];
      const disciplines = getDisciplinesForProfile(athleteProfile).filter(
        (d) => d !== 'rest' && d !== 'strength'
      );

      const baseParams = {
        profile: athleteProfile,
        healthData,
        readinessScore,
        phase,
        daysToRace,
        completedWorkouts,
        trends,
        targetDate: tomorrow,
      };

      // Generate primary workout
      const primary = await generateWorkoutLocally({
        ...baseParams,
        targetDiscipline: primaryDiscipline,
      });

      // Generate up to 2 alternatives with different disciplines
      const altDisciplines = disciplines.filter((d) => d !== primary.discipline).slice(0, 2);
      const alts = await Promise.all(
        altDisciplines.map((d) =>
          generateWorkoutLocally({ ...baseParams, targetDiscipline: d }).catch(() => null)
        )
      );
      const alternatives = [primary, ...alts.filter(Boolean)];

      setTomorrowWorkout(primary);
      setTomorrowAlternatives(alternatives);
      setTomorrowAlternativeIndex(0);
      await saveTomorrowCache(primary, alternatives, 0);
    } catch (e) {
      console.warn('Failed to generate tomorrow workout:', e);
    }
    setGeneratingTomorrow(false);
  }

  async function rotateTomorrowWorkout() {
    if (!tomorrowAlternatives || tomorrowAlternatives.length <= 1) return;
    const nextIndex = (tomorrowAlternativeIndex + 1) % tomorrowAlternatives.length;
    const nextWorkout = tomorrowAlternatives[nextIndex];
    setTomorrowAlternativeIndex(nextIndex);
    setTomorrowWorkout(nextWorkout);
    await saveTomorrowCache(nextWorkout, tomorrowAlternatives, nextIndex);
  }

  function computeRecentScore(healthWorkouts) {
    // Build per-day breakdown for last 3 days including today
    const recentDays = findRecentCompletedWorkouts(healthWorkouts, 3);
    if (recentDays.length === 0) {
      setRecentScore(null);
      return;
    }

    const phase = getTrainingPhase();
    const baseDuration = athleteProfile ? getBaseDuration(phase, athleteProfile.weeklyHours) : 60;
    const plan = athleteProfile ? getWeeklyDisciplinePlan(phase, athleteProfile) : null;

    const scoredDays = recentDays.map(({ dateLabel, dateString, workouts }) => {
      const date = new Date(dateString);
      const dayOfWeek = date.getDay();
      const prescribedDiscipline = plan ? plan[dayOfWeek] : null;
      const prescribedWorkout = prescribedDiscipline
        ? { discipline: prescribedDiscipline, duration: baseDuration }
        : null;
      const complianceScore = calculateDailyComplianceScore(prescribedWorkout, workouts);
      const score = complianceScore ?? 0;
      const feedback = getCompletionFeedback(score);

      return {
        dateLabel,
        dateString,
        prescribedDiscipline,
        prescribedDuration: baseDuration,
        completionScore: score,
        feedback,
        workouts: workouts.map((w) => ({
          title:
            w.activityName ||
            `${w.discipline?.charAt(0).toUpperCase()}${w.discipline?.slice(1)} Session`,
          discipline: w.discipline,
          duration: w.durationMinutes,
          startDate: w.startDate,
        })),
      };
    });

    setRecentScore(scoredDays);
  }

  function detectTodayCompletion() {
    if (!todayWorkout || !completedWorkouts || completedWorkouts.length === 0) {
      setTodayWorkoutStatus('pending');
      setTodayMatchedWorkout(null);
      return;
    }

    const today = new Date().toDateString();
    const todayWorkouts = completedWorkouts.filter(
      (w) => w.startDate && new Date(w.startDate).toDateString() === today
    );

    if (todayWorkouts.length === 0) {
      setTodayWorkoutStatus('pending');
      setTodayMatchedWorkout(null);
      return;
    }

    // Check if any today workout matches prescribed discipline
    const matched = todayWorkouts.find((w) => w.discipline === todayWorkout.discipline);
    if (matched) {
      const durationRatio = (matched.durationMinutes || 0) / (todayWorkout.duration || 60);
      if (durationRatio >= 0.8) {
        setTodayWorkoutStatus('completed');
      } else {
        setTodayWorkoutStatus('partial');
      }
      setTodayMatchedWorkout(matched);
    } else if (todayWorkouts.length > 0) {
      // Did a different workout than prescribed
      setTodayWorkoutStatus('partial');
      setTodayMatchedWorkout(todayWorkouts[0]);
    } else {
      setTodayWorkoutStatus('pending');
      setTodayMatchedWorkout(null);
    }
  }

  async function computeTrends() {
    try {
      const healthHistory = await fetchHealthHistory(14);
      const healthTrends = analyzeHealthTrends(healthHistory);
      const workoutTrends = analyzeWorkoutTrends(completedWorkouts, 14);
      setTrends({ health: healthTrends, workout: workoutTrends });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Trends] Failed to compute:', e.message || e);
    }
  }

  function computeOverallReadiness(healthScore, history, healthWorkouts) {
    const phase = getTrainingPhase();
    const daysToRace = getDaysToRace();

    // Prefer Apple Health activity score, fall back to manual compliance
    const activityScore = calculateRecentActivityScore(healthWorkouts, 7);
    const compliance = activityScore ?? calculateRecentComplianceScore(history, 7) ?? 50;

    const racePrep = calculateRacePreparationScore(phase, daysToRace, compliance);
    const overall = calculateOverallReadiness(healthScore, compliance, racePrep);
    setOverallReadiness({
      overall,
      health: healthScore,
      compliance,
      racePrep,
    });
  }

  function getTrainingPhase() {
    if (!athleteProfile?.raceDate) return 'BASE';
    const now = new Date();
    const race = new Date(athleteProfile.raceDate);
    const weeksOut = Math.ceil((race - now) / (7 * 24 * 60 * 60 * 1000));

    if (weeksOut < 2) return 'RACE_WEEK';
    if (weeksOut < 6) return 'TAPER';
    if (weeksOut < 12) return 'PEAK';
    if (weeksOut < 20) return 'BUILD';
    return 'BASE';
  }

  function getDaysToRace() {
    if (!athleteProfile?.raceDate) return null;
    const now = new Date();
    const race = new Date(athleteProfile.raceDate);
    return Math.ceil((race - now) / (24 * 60 * 60 * 1000));
  }

  const value = {
    athleteProfile,
    saveProfile,
    healthData,
    loadHealthData,
    todayWorkout,
    saveTodayWorkout,
    swapTodayWorkout,
    clearTodayWorkout,
    readinessScore,
    getTrainingPhase,
    getDaysToRace,
    alternativeWorkout,
    saveAlternativeWorkout,
    recentScore,
    overallReadiness,
    workoutHistory,
    loadWorkoutHistory,
    completedWorkouts,
    loadCompletedWorkouts,
    todayWorkoutStatus,
    todayMatchedWorkout,
    trends,
    modelStatus,
    modelProgress,
    tomorrowWorkout,
    tomorrowAlternatives,
    tomorrowAlternativeIndex,
    generatingTomorrow,
    generateAndSaveTomorrow,
    rotateTomorrowWorkout,
    resetTrainingPlan,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
