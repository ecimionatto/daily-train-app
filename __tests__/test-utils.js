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
  raceType: 'triathlon',
  distance: 'Full Ironman (140.6)',
  level: 'Intermediate',
  weeklyHours: '8-10',
  strongestDiscipline: 'Bike',
  weakestDiscipline: 'Swim',
  swimBackground: 'Comfortable',
  previousRaces: '1-2 races',
  injuries: 'None',
  goalTime: '12-14h',
  createdAt: new Date().toISOString(),
};

export const mockRunningProfile = {
  raceDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  raceType: 'running',
  distance: 'Marathon',
  level: 'Intermediate',
  weeklyHours: '8-10',
  strongestDiscipline: 'Run',
  weakestDiscipline: 'Run',
  swimBackground: 'N/A',
  previousRaces: 'First timer',
  injuries: 'None',
  goalTime: 'Sub 4:00',
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

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

export const mockWorkoutHistoryWithYesterday = [
  {
    ...mockWorkout,
    completedAt: yesterday.toISOString(),
    completedSets: 5,
    totalSets: 6,
  },
];

export const mockCompletedWorkouts = [
  {
    id: 'hw-1',
    discipline: 'run',
    startDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    endDate: new Date(Date.now() - 2 * 86400000 + 3600000).toISOString(),
    durationMinutes: 60,
    calories: 550,
    distanceMeters: 10000,
    source: 'Apple Watch',
  },
  {
    id: 'hw-2',
    discipline: 'swim',
    startDate: new Date(Date.now() - 1 * 86400000).toISOString(),
    endDate: new Date(Date.now() - 1 * 86400000 + 2700000).toISOString(),
    durationMinutes: 45,
    calories: 400,
    distanceMeters: 2000,
    source: 'Apple Watch',
  },
  {
    id: 'hw-3',
    discipline: 'bike',
    startDate: new Date(Date.now() - 3600000).toISOString(),
    endDate: new Date().toISOString(),
    durationMinutes: 60,
    calories: 600,
    distanceMeters: 30000,
    source: 'Apple Watch',
  },
];

export const mockAlternativeWorkout = {
  title: 'Endurance Swim',
  discipline: 'swim',
  duration: 60,
  summary: 'Steady aerobic swimming to build endurance and technique.',
  intensity: 'moderate',
  sections: [
    {
      name: 'Warmup',
      notes: 'Easy swimming with drill focus.',
      sets: [
        { description: '10 min easy free', zone: 1 },
        { description: '4x50m drill/swim by 25', zone: 2 },
      ],
    },
    {
      name: 'Main Set',
      notes: 'Hold steady pace.',
      sets: [{ description: '30 min steady swimming', zone: 2 }],
    },
    {
      name: 'Cooldown',
      notes: 'Easy swimming to flush.',
      sets: [{ description: '6 min easy backstroke', zone: 1 }],
    },
  ],
};

export const mockYesterdayScore = {
  completionScore: 83,
  feedback: { label: 'Solid session', message: 'Good work getting through the key sets.' },
  completedWorkout: {
    ...mockWorkout,
    completedSets: 5,
    totalSets: 6,
    completedAt: yesterday.toISOString(),
  },
};

export const mockOverallReadiness = {
  overall: 78,
  health: 82,
  compliance: 75,
  racePrep: 72,
};

// ── Helpers ─────────────────────────────────────────────────

export async function clearAsyncStorage() {
  await AsyncStorage.clear();
}

export async function seedAsyncStorage({
  user,
  profile,
  workout,
  workoutHistory,
  chatHistory,
  lastGreetingDate,
}) {
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
  if (lastGreetingDate) {
    await AsyncStorage.setItem('lastGreetingDate', lastGreetingDate);
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
