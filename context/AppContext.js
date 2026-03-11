import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchHealthData, calculateReadiness, fetchCompletedWorkouts } from '../services/healthKit';
import {
  findYesterdayWorkouts,
  findYesterdayCompletedWorkouts,
  calculateCompletionScore,
  calculateRecentComplianceScore,
  calculateRecentActivityScore,
  calculateRacePreparationScore,
  calculateOverallReadiness,
  getCompletionFeedback,
} from '../services/workoutScoring';
import { initLocalModel, isModelReady, onModelProgress } from '../services/localModel';

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
      console.warn('Failed to load AI model:', e);
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
      const workouts = await fetchCompletedWorkouts(14);
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

  function saveAlternativeWorkout(workout) {
    setAlternativeWorkout(workout);
  }

  function computeYesterdayScore(history, healthWorkouts) {
    // Try Apple Health completed workouts first
    const yesterdayHealthWorkouts = findYesterdayCompletedWorkouts(healthWorkouts);
    if (yesterdayHealthWorkouts.length > 0) {
      const latest = yesterdayHealthWorkouts[yesterdayHealthWorkouts.length - 1];
      const durationScore = Math.min(Math.round((latest.durationMinutes / 60) * 100), 100);
      const feedback = getCompletionFeedback(durationScore);
      setYesterdayScore({
        completionScore: durationScore,
        feedback,
        completedWorkout: {
          title: `${latest.discipline?.charAt(0).toUpperCase()}${latest.discipline?.slice(1)} Session`,
          discipline: latest.discipline,
          duration: latest.durationMinutes,
          startDate: latest.startDate,
        },
      });
      return;
    }

    // Fall back to manual workout history
    const yesterdayWorkouts = findYesterdayWorkouts(history);
    if (yesterdayWorkouts.length === 0) {
      setYesterdayScore(null);
      return;
    }
    const latest = yesterdayWorkouts[yesterdayWorkouts.length - 1];
    const completionScore = calculateCompletionScore(latest);
    const feedback = getCompletionFeedback(completionScore);
    setYesterdayScore({
      completionScore,
      feedback,
      completedWorkout: latest,
    });
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
    modelStatus,
    modelProgress,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
