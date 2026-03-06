import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const stored = await AsyncStorage.getItem('authUser');
      if (stored) setUser(JSON.parse(stored));
    } catch (e) {
      console.warn('Failed to load auth user:', e);
    }
    setLoading(false);
  }

  async function signIn(userData) {
    try {
      await AsyncStorage.setItem('authUser', JSON.stringify(userData));
      setUser(userData);
    } catch (e) {
      console.warn('Failed to save auth user:', e);
    }
  }

  async function signOut() {
    try {
      await AsyncStorage.removeItem('authUser');
      await AsyncStorage.removeItem('athleteProfile');
      await AsyncStorage.removeItem('todayWorkout');
      await AsyncStorage.removeItem('workoutHistory');
      setUser(null);
    } catch (e) {
      console.warn('Failed to sign out:', e);
    }
  }

  const value = {
    user,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
