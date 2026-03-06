import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchHealthData, calculateReadiness } from '../services/healthKit';

const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [readinessScore, setReadinessScore] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (athleteProfile) {
      loadHealthData();
      loadCachedWorkout();
    }
  }, [athleteProfile]);

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

  async function saveTodayWorkout(workout) {
    try {
      const today = new Date().toDateString();
      await AsyncStorage.setItem(
        'todayWorkout',
        JSON.stringify({ date: today, workout })
      );
      setTodayWorkout(workout);
    } catch (e) {
      console.warn('Failed to save workout:', e);
    }
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
    readinessScore,
    getTrainingPhase,
    getDaysToRace,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
