import React from 'react';
import { waitFor } from '@testing-library/react-native';
import DashboardScreen from '../screens/DashboardScreen';
import { fetchHealthData, calculateReadiness } from '../services/healthKit';
import { generateWorkoutLocally } from '../services/localModel';
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
jest.mock('../services/localModel');

describe('DashboardScreen', () => {
  const mockNavigation = { navigate: jest.fn() };

  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    fetchHealthData.mockResolvedValue(mockHealthData);
    calculateReadiness.mockReturnValue(72);
    generateWorkoutLocally.mockResolvedValue(mockWorkout);
  });

  it('renders IronCoach header', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('IronCoach')).toBeTruthy();
    });
  });

  it('displays readiness score', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('72')).toBeTruthy();
      expect(getByText('READINESS')).toBeTruthy();
    });
  });

  it('shows correct readiness label for moderate score', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('MODERATE EFFORT')).toBeTruthy();
    });
  });

  it('displays health metrics', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />);

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
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('DAYS TO RACE')).toBeTruthy();
    });
  });

  it('displays workout preview after auto-generation', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('Tempo Run')).toBeTruthy();
      expect(getByText('RUN')).toBeTruthy();
      expect(getByText('60 min')).toBeTruthy();
      expect(getByText('VIEW FULL WORKOUT')).toBeTruthy();
    });
  });

  it('renders today session section title', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<DashboardScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText("TODAY'S SESSION")).toBeTruthy();
    });
  });
});
