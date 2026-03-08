import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider } from '../context/AuthContext';
import { AppProvider } from '../context/AppContext';
import { ChatProvider } from '../context/ChatContext';

// ── Fixtures ────────────────────────────────────────────────

export const mockUser = {
  id: 'user-123',
  email: 'athlete@test.com',
  name: 'Test Athlete',
  picture: null,
  provider: 'google',
  token: 'mock-token',
};

export const mockProfile = {
  raceDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  distance: 'Full Ironman',
  level: 'Intermediate',
  weeklyHours: '8-10',
  strongestDiscipline: 'Bike',
  weakestDiscipline: 'Swim',
  swimBackground: 'Comfortable',
  previousIronman: '1-2 races',
  injuries: 'None',
  goalTime: '12-14h',
  createdAt: new Date().toISOString(),
};

export const mockHealthData = {
  restingHR: 54,
  hrv: 62,
  sleepHours: 7.5,
  vo2Max: 52,
};

export const mockWorkout = {
  title: 'Tempo Run',
  discipline: 'run',
  duration: 60,
  summary: 'Build running speed with tempo intervals.',
  intensity: 'moderate',
  sections: [
    {
      name: 'Warmup',
      notes: 'Easy jog with dynamic stretches.',
      sets: [
        { description: '9 min easy jog', zone: 1 },
        { description: 'Dynamic warm-up drills', zone: null },
      ],
    },
    {
      name: 'Main Set',
      notes: 'Run at tempo effort.',
      sets: [
        { description: '4x5 min at tempo, 2 min jog recovery', zone: 3 },
        { description: 'Focus on quick turnover', zone: 3 },
      ],
    },
    {
      name: 'Cooldown',
      notes: 'Easy jog and stretch.',
      sets: [
        { description: '6 min easy jog', zone: 1 },
        { description: 'Static stretching 5 min', zone: null },
      ],
    },
  ],
};

export const mockHealthHistory = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.now() - (13 - i) * 86400000).toISOString(),
  restingHR: 50 + (i % 5),
  hrv: 45 + (i % 10),
  sleepHours: 6.5 + (i % 3) * 0.5,
}));

export const mockWorkoutHistory = [
  { ...mockWorkout, completedAt: new Date().toISOString(), completedSets: 4, totalSets: 6 },
];

// ── Helpers ─────────────────────────────────────────────────

export async function clearAsyncStorage() {
  await AsyncStorage.clear();
}

export async function seedAsyncStorage({ user, profile, workout, workoutHistory, chatHistory }) {
  if (user) await AsyncStorage.setItem('authUser', JSON.stringify(user));
  if (profile) await AsyncStorage.setItem('athleteProfile', JSON.stringify(profile));
  if (workout) {
    await AsyncStorage.setItem(
      'todayWorkout',
      JSON.stringify({ date: new Date().toDateString(), workout })
    );
  }
  if (workoutHistory) {
    await AsyncStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
  }
  if (chatHistory) {
    await AsyncStorage.setItem('chatConversation', JSON.stringify(chatHistory));
  }
}

export function renderWithProviders(ui, { withChat = false } = {}) {
  const wrapper = withChat
    ? ({ children }) => (
        <AuthProvider>
          <AppProvider>
            <ChatProvider>
              <NavigationContainer>{children}</NavigationContainer>
            </ChatProvider>
          </AppProvider>
        </AuthProvider>
      )
    : ({ children }) => (
        <AuthProvider>
          <AppProvider>
            <NavigationContainer>{children}</NavigationContainer>
          </AppProvider>
        </AuthProvider>
      );

  return render(ui, { wrapper });
}
