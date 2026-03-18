import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchHealthData,
  fetchHealthHistory,
  calculateReadiness,
  fetchCompletedWorkouts,
} from '../services/healthKit';
import { analyzeHealthTrends, analyzeWorkoutTrends } from '../services/trendAnalysis';
import {
  findYesterdayCompletedWorkouts,
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
} from '../services/localModel';

const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [readinessScore, setReadinessScore] = useState(null);
  const [alternativeWorkout, setAlternativeWorkout] = useState(null);
  const [yesterdayScore, setYesterdayScore] = useState(null);
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
      loadWorkoutHistory();
      loadCompletedWorkouts();
      loadLocalModel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteProfile]);

  useEffect(() => {
    if (readinessScore !== null) {
      computeYesterdayScore(workoutHistory, completedWorkouts);
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
      if (stored) setAthleteProfile(JSON.parse(stored));
    } catch (e) {
      console.warn('Failed to load profile:', e);
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
      if (cached) {
        const parsed = JSON.parse(cached);
        const today = new Date().toDateString();
        if (parsed.date === today) {
          setTodayWorkout(parsed.workout);
        }
      }
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
  }

  async function saveTodayWorkout(workout) {
    try {
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

  function computeYesterdayScore(_history, healthWorkouts) {
    // Only use Apple Health data — no manual fallback
    const yesterdayHealthWorkouts = findYesterdayCompletedWorkouts(healthWorkouts);
    if (yesterdayHealthWorkouts.length === 0) {
      setYesterdayScore(null);
      return;
    }

    // Reconstruct what was prescribed yesterday
    const phase = getTrainingPhase();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = yesterday.getDay();
    const plan = athleteProfile ? getWeeklyDisciplinePlan(phase, athleteProfile) : null;
    const prescribedDiscipline = plan ? plan[yesterdayDay] : null;
    const prescribedDuration = athleteProfile
      ? getBaseDuration(phase, athleteProfile.weeklyHours)
      : 60;

    // Build prescribed workout for compliance comparison
    const prescribedWorkout = prescribedDiscipline
      ? { discipline: prescribedDiscipline, duration: prescribedDuration }
      : null;

    // Use compliance scoring (compares discipline + duration match)
    const complianceScore = calculateDailyComplianceScore(
      prescribedWorkout,
      yesterdayHealthWorkouts
    );
    const score = complianceScore ?? 0;
    const feedback = getCompletionFeedback(score);

    const allWorkouts = yesterdayHealthWorkouts.map((w) => ({
      title:
        w.activityName ||
        `${w.discipline?.charAt(0).toUpperCase()}${w.discipline?.slice(1)} Session`,
      discipline: w.discipline,
      duration: w.durationMinutes,
      startDate: w.startDate,
    }));

    setYesterdayScore({
      completionScore: score,
      prescribedDiscipline,
      prescribedDuration,
      feedback,
      completedWorkout: allWorkouts[allWorkouts.length - 1],
      allWorkouts,
    });
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
    yesterdayScore,
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
