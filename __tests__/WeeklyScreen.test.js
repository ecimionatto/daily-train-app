import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import WeeklyScreen from '../screens/WeeklyScreen';
import { fetchHealthData, calculateReadiness, fetchCompletedWorkouts } from '../services/healthKit';
import { generateWeeklySummaryLocally, getWeeklyDisciplinePlan } from '../services/localModel';
import {
  clearAsyncStorage,
  seedAsyncStorage,
  mockUser,
  mockProfile,
  mockHealthData,
  mockCompletedWorkouts,
  renderWithProviders,
} from './test-utils';

jest.mock('../services/healthKit');
jest.mock('../services/localModel');

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

// BASE phase plan: Sun=swim, Mon=rest, Tue=run, Wed=bike, Thu=swim, Fri=run, Sat=bike
const MOCK_WEEK_PLAN = ['swim', 'rest', 'run', 'bike', 'swim', 'run', 'bike'];

describe('WeeklyScreen', () => {
  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    fetchHealthData.mockResolvedValue(mockHealthData);
    calculateReadiness.mockReturnValue(72);
    fetchCompletedWorkouts.mockResolvedValue([]);
    generateWeeklySummaryLocally.mockResolvedValue('Great week of training!');
    getWeeklyDisciplinePlan.mockReturnValue(MOCK_WEEK_PLAN);
  });

  it('renders This Week header', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('This Week')).toBeTruthy();
    });
  });

  it('renders weekly grid with day labels', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

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
    const { getByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

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
    const { getByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('No completed workouts yet')).toBeTruthy();
    });
  });

  it('shows training plan subtitle when profile has a race date', async () => {
    fetchCompletedWorkouts.mockResolvedValue(mockCompletedWorkouts);
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
    });
    const { queryByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

    await waitFor(() => {
      // Subtitle shows "Week X of training plan" or "Phase: BUILD" etc.
      const weekSubtitle = queryByText(/Week \d+ of training plan/);
      const phaseSubtitle = queryByText(/Phase:/);
      expect(weekSubtitle || phaseSubtitle).toBeTruthy();
    });
  });

  it('generates AI weekly summary on button press', async () => {
    fetchCompletedWorkouts.mockResolvedValue(mockCompletedWorkouts);
    await seedAsyncStorage({
      user: mockUser,
      profile: mockProfile,
    });
    const { getByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

    await waitFor(() => getByText('GET WEEKLY ANALYSIS'));
    fireEvent.press(getByText('GET WEEKLY ANALYSIS'));

    await waitFor(() => {
      expect(getByText('Great week of training!')).toBeTruthy();
    });
  });

  it('renders PLAN SETTINGS button', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('PLAN SETTINGS')).toBeTruthy();
    });
  });

  it('navigates to PlanSettings when PLAN SETTINGS button is pressed', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<WeeklyScreen navigation={mockNavigation} />);

    await waitFor(() => getByText('PLAN SETTINGS'));
    fireEvent.press(getByText('PLAN SETTINGS'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('PlanSettings');
  });
});
