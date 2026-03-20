import React from 'react';
import { waitFor } from '@testing-library/react-native';
import DashboardScreen from '../screens/DashboardScreen';
import { fetchHealthData, calculateReadiness, fetchCompletedWorkouts } from '../services/healthKit';
import { generateWorkoutLocally, generateAlternativeWorkout } from '../services/localModel';
import {
  clearAsyncStorage,
  seedAsyncStorage,
  mockUser,
  mockProfile,
  mockHealthData,
  mockWorkout,
  mockAlternativeWorkout,
  renderWithProviders,
} from './test-utils';

jest.mock('../services/healthKit');
jest.mock('../services/localModel');
jest.mock('../services/chatService', () => ({
  getCoachResponse: jest.fn().mockResolvedValue('Coach response'),
  buildConversationSummary: jest.fn().mockReturnValue(''),
  generateProactiveGreeting: jest.fn().mockResolvedValue('Good morning! Great job yesterday.'),
  generateWeeklyReview: jest.fn().mockResolvedValue('Weekly review text'),
}));

describe('DashboardScreen', () => {
  const mockNavigation = { navigate: jest.fn() };

  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    fetchHealthData.mockResolvedValue(mockHealthData);
    calculateReadiness.mockReturnValue(72);
    fetchCompletedWorkouts.mockResolvedValue([]);
    generateWorkoutLocally.mockResolvedValue(mockWorkout);
    generateAlternativeWorkout.mockResolvedValue(mockAlternativeWorkout);
    // Provide a weekly plan aligned with mockWorkout.discipline ('run') for every day
    // so the discipline guard in DashboardScreen passes through without overwriting
    const { getWeeklyDisciplinePlan, analyzeRecentWorkouts } = require('../services/localModel');
    getWeeklyDisciplinePlan.mockReturnValue(['run', 'run', 'run', 'run', 'run', 'run', 'run']);
    if (analyzeRecentWorkouts) analyzeRecentWorkouts.mockResolvedValue(null);
  });

  it('renders DailyTrain header', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('DailyTrain')).toBeTruthy();
    });
  });

  it('displays overall readiness score', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('OVERALL READINESS')).toBeTruthy();
    });
  });

  it('shows correct readiness label for moderate score', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('MODERATE EFFORT')).toBeTruthy();
    });
  });

  it('displays health metrics', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('54')).toBeTruthy();
      expect(getByText('RHR')).toBeTruthy();
      expect(getByText('62')).toBeTruthy();
      expect(getByText('HRV')).toBeTruthy();
      expect(getByText('SLEEP')).toBeTruthy();
    });
  });

  it('displays days to race countdown', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('DAYS TO RACE')).toBeTruthy();
    });
  });

  it('displays workout with full details after generation', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText, getAllByText } = renderWithProviders(
      <DashboardScreen navigation={mockNavigation} />,
      { withChat: true }
    );

    await waitFor(() => {
      expect(getByText('Tempo Run')).toBeTruthy();
      expect(getByText('RUN')).toBeTruthy();
      // "60 min" may appear in both main and alternative workout
      expect(getAllByText('60 min').length).toBeGreaterThanOrEqual(1);
      expect(getByText('VIEW WORKOUT')).toBeTruthy();
    });
  });

  it('renders today session section title', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText("TODAY'S SESSION")).toBeTruthy();
    });
  });

  it('displays inline workout sections', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile, workout: mockWorkout });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('WARMUP')).toBeTruthy();
      expect(getByText('MAIN SET')).toBeTruthy();
      expect(getByText('COOLDOWN')).toBeTruthy();
    });
  });

  it('shows alternative workout card', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('ALTERNATIVE OPTION')).toBeTruthy();
      expect(getByText('Endurance Swim')).toBeTruthy();
      expect(getByText('SWITCH TO THIS')).toBeTruthy();
    });
  });

  it('shows previous sessions when Apple Health has completed workouts', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(7, 0, 0, 0);
    const yesterdayWorkout = {
      id: 'hk_yesterday',
      discipline: 'run',
      startDate: yesterday.toISOString(),
      endDate: new Date(yesterday.getTime() + 45 * 60000).toISOString(),
      durationMinutes: 45,
      calories: 400,
      distanceMeters: 7000,
      source: 'Apple Watch',
    };
    fetchCompletedWorkouts.mockResolvedValue([yesterdayWorkout]);

    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
    });

    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />, {
      withChat: true,
    });

    await waitFor(() => {
      expect(getByText('PREVIOUS SESSIONS')).toBeTruthy();
    });
  });
});
