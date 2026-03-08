import React from 'react';
import { waitFor } from '@testing-library/react-native';
import RecoveryScreen from '../screens/RecoveryScreen';
import { fetchHealthData, fetchHealthHistory, calculateReadiness } from '../services/healthKit';
import {
  clearAsyncStorage,
  seedAsyncStorage,
  mockUser,
  mockProfile,
  mockHealthData,
  mockHealthHistory,
  renderWithProviders,
} from './test-utils';

jest.mock('../services/healthKit');

describe('RecoveryScreen', () => {
  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    fetchHealthData.mockResolvedValue(mockHealthData);
    fetchHealthHistory.mockResolvedValue(mockHealthHistory);
    calculateReadiness.mockReturnValue(72);
  });

  it('renders Recovery title and subtitle', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<RecoveryScreen />);

    await waitFor(() => {
      expect(getByText('Recovery')).toBeTruthy();
      expect(getByText('14-Day Health Trends')).toBeTruthy();
    });
  });

  it('displays readiness score', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<RecoveryScreen />);

    await waitFor(() => {
      expect(getByText('72')).toBeTruthy();
      expect(getByText('/100')).toBeTruthy();
    });
  });

  it('displays HRV trend card', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<RecoveryScreen />);

    await waitFor(() => {
      expect(getByText('HRV (SDNN)')).toBeTruthy();
    });
  });

  it('displays resting heart rate card', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<RecoveryScreen />);

    await waitFor(() => {
      expect(getByText('RESTING HEART RATE')).toBeTruthy();
    });
  });

  it('displays sleep trend card with quality grade', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<RecoveryScreen />);

    await waitFor(() => {
      expect(getByText('SLEEP')).toBeTruthy();
      expect(getByText('GOOD')).toBeTruthy();
    });
  });

  it('shows trend hints for each metric', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<RecoveryScreen />);

    await waitFor(() => {
      expect(getByText('Higher HRV = better recovery and readiness')).toBeTruthy();
      expect(getByText('Lower RHR = better cardiovascular fitness')).toBeTruthy();
      expect(getByText('Aim for 7-9 hours for optimal recovery')).toBeTruthy();
    });
  });
});
