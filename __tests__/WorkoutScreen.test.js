import React from 'react';
import { waitFor } from '@testing-library/react-native';
import WorkoutScreen from '../screens/WorkoutScreen';
import { fetchHealthData, calculateReadiness } from '../services/healthKit';
import {
  clearAsyncStorage,
  seedAsyncStorage,
  mockUser,
  mockProfile,
  mockHealthData,
  mockWorkout,
  renderWithProviders,
} from './test-utils';

jest.mock('../services/healthKit');

describe('WorkoutScreen', () => {
  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    fetchHealthData.mockResolvedValue(mockHealthData);
    calculateReadiness.mockReturnValue(72);
  });

  it('shows empty state when no workout exists', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      expect(getByText('No Workout Yet')).toBeTruthy();
    });
  });

  it('displays workout title and discipline', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      expect(getByText('Tempo Run')).toBeTruthy();
      expect(getByText('RUN')).toBeTruthy();
      expect(getByText('60 min')).toBeTruthy();
    });
  });

  it('displays workout sections', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      expect(getByText('WARMUP')).toBeTruthy();
      expect(getByText('MAIN SET')).toBeTruthy();
      expect(getByText('COOLDOWN')).toBeTruthy();
    });
  });

  it('renders sets as read-only without checkboxes', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText, queryByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      expect(getByText('9 min easy jog')).toBeTruthy();
      expect(queryByText('✓')).toBeNull();
      expect(queryByText(/sets/)).toBeNull();
    });
  });

  it('does not show MARK COMPLETE button', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { queryByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      expect(queryByText('MARK COMPLETE')).toBeNull();
      expect(queryByText('WORKOUT LOGGED')).toBeNull();
    });
  });

  it('displays intensity badge', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      expect(getByText('MODERATE')).toBeTruthy();
    });
  });

  it('displays zone indicators on sets', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getAllByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      const zoneElements = getAllByText(/Zone \d/);
      expect(zoneElements.length).toBeGreaterThan(0);
    });
  });
});
