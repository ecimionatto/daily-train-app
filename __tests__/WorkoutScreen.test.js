import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  it('shows initial progress as 0 sets', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => {
      expect(getByText('0 / 6 sets')).toBeTruthy();
    });
  });

  it('toggles set completion on press', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => getByText('9 min easy jog'));
    fireEvent.press(getByText('9 min easy jog'));

    await waitFor(() => {
      expect(getByText('1 / 6 sets')).toBeTruthy();
    });
  });

  it('shows checkmark when set is completed', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => getByText('9 min easy jog'));
    fireEvent.press(getByText('9 min easy jog'));

    await waitFor(() => {
      expect(getByText('✓')).toBeTruthy();
    });
  });

  it('marks workout complete and saves to AsyncStorage', async () => {
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
      workout: mockWorkout,
    });
    const { getByText } = renderWithProviders(<WorkoutScreen />);

    await waitFor(() => getByText('MARK COMPLETE'));
    fireEvent.press(getByText('MARK COMPLETE'));

    await waitFor(() => {
      expect(getByText('WORKOUT LOGGED')).toBeTruthy();
    });

    const historyRaw = await AsyncStorage.getItem('workoutHistory');
    const history = JSON.parse(historyRaw);
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe('Tempo Run');
    expect(history[0].completedAt).toBeDefined();
  });
});
