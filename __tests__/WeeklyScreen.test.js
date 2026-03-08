import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import WeeklyScreen from '../screens/WeeklyScreen';
import { fetchHealthData, calculateReadiness } from '../services/healthKit';
import { generateWeeklySummaryLocally } from '../services/localModel';
import {
  clearAsyncStorage,
  seedAsyncStorage,
  mockUser,
  mockProfile,
  mockHealthData,
  mockWorkoutHistory,
  renderWithProviders,
} from './test-utils';

jest.mock('../services/healthKit');
jest.mock('../services/localModel');

describe('WeeklyScreen', () => {
  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    fetchHealthData.mockResolvedValue(mockHealthData);
    calculateReadiness.mockReturnValue(72);
    generateWeeklySummaryLocally.mockResolvedValue('Great week of training!');
  });

  it('renders This Week header', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen />);

    await waitFor(() => {
      expect(getByText('This Week')).toBeTruthy();
    });
  });

  it('renders weekly grid with day labels', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen />);

    await waitFor(() => {
      expect(getByText('Mon')).toBeTruthy();
      expect(getByText('Tue')).toBeTruthy();
      expect(getByText('Wed')).toBeTruthy();
      expect(getByText('Thu')).toBeTruthy();
      expect(getByText('Fri')).toBeTruthy();
      expect(getByText('Sat')).toBeTruthy();
      expect(getByText('Sun')).toBeTruthy();
    });
  });

  it('renders discipline legend', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen />);

    await waitFor(() => {
      expect(getByText('Swim')).toBeTruthy();
      expect(getByText('Bike')).toBeTruthy();
      expect(getByText('Run')).toBeTruthy();
      expect(getByText('Rest')).toBeTruthy();
      expect(getByText('Strength')).toBeTruthy();
    });
  });

  it('shows empty breakdown when no workouts completed', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen />);

    await waitFor(() => {
      expect(getByText('No completed workouts yet')).toBeTruthy();
    });
  });

  it('displays session count with workout history', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workoutHistory: mockWorkoutHistory,
    });
    const { getByText } = renderWithProviders(<WeeklyScreen />);

    await waitFor(() => {
      expect(getByText(/1 sessions/)).toBeTruthy();
    });
  });

  it('generates AI weekly summary on button press', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workoutHistory: mockWorkoutHistory,
    });
    const { getByText } = renderWithProviders(<WeeklyScreen />);

    await waitFor(() => getByText('GET WEEKLY ANALYSIS'));
    fireEvent.press(getByText('GET WEEKLY ANALYSIS'));

    await waitFor(() => {
      expect(getByText('Great week of training!')).toBeTruthy();
    });
  });
});
