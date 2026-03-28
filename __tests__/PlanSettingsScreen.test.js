import React from 'react';
import { waitFor } from '@testing-library/react-native';
import PlanSettingsScreen from '../screens/PlanSettingsScreen';
import {
  clearAsyncStorage,
  seedAsyncStorage,
  mockUser,
  mockProfile,
  renderWithProviders,
} from './test-utils';

jest.mock('../services/healthKit');

describe('PlanSettingsScreen', () => {
  const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
  const mockRoute = {};

  beforeEach(async () => {
    await clearAsyncStorage();
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    jest.clearAllMocks();
  });

  it('renders plan settings with schedule preferences section', async () => {
    const { getByText } = renderWithProviders(
      <PlanSettingsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('Plan Settings')).toBeTruthy();
      expect(getByText('RACE CONFIGURATION')).toBeTruthy();
      expect(getByText('SCHEDULE PREFERENCES')).toBeTruthy();
      expect(getByText('TRAINING PLAN DETAILS')).toBeTruthy();
    });
  });

  it('shows weekend preference toggle buttons', async () => {
    const { getByText } = renderWithProviders(
      <PlanSettingsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('Bike Sat / Run Sun')).toBeTruthy();
      expect(getByText('Run Sat / Bike Sun')).toBeTruthy();
    });
  });

  it('shows swim days toggle buttons', async () => {
    const { getByText } = renderWithProviders(
      <PlanSettingsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText('Mon / Wed / Fri')).toBeTruthy();
      expect(getByText('Tue / Thu / Sat')).toBeTruthy();
    });
  });

  it('shows weekly discipline plan', async () => {
    const { getByText } = renderWithProviders(
      <PlanSettingsScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      expect(getByText("This Week's Discipline Plan")).toBeTruthy();
      expect(getByText('Monday')).toBeTruthy();
      expect(getByText('Sunday')).toBeTruthy();
    });
  });
});
