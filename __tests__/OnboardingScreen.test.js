import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from '../screens/OnboardingScreen';
import { clearAsyncStorage, seedAsyncStorage, mockUser, renderWithProviders } from './test-utils';

jest.mock('../services/healthKit');
jest.mock('../services/localModel', () => ({
  ...jest.requireActual('../services/localModel'),
  generateWeeklyTargets: jest.fn().mockReturnValue({
    targets: {
      swim: { count: 3, totalMinutes: 150 },
      bike: { count: 3, totalMinutes: 225 },
      run: { count: 3, totalMinutes: 165 },
      strength: { count: 1, totalMinutes: 40 },
    },
  }),
}));

describe('OnboardingScreen', () => {
  const mockOnComplete = jest.fn();

  beforeEach(async () => {
    await clearAsyncStorage();
    await seedAsyncStorage({ user: mockUser });
    jest.clearAllMocks();
  });

  it('renders race date step first', () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    expect(getByText('When is your race?')).toBeTruthy();
    expect(getByText('NEXT')).toBeTruthy();
  });

  it('shows triathlon distance selection after date', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));

    await waitFor(() => {
      expect(getByText('What triathlon distance are you targeting?')).toBeTruthy();
      expect(getByText('Sprint Triathlon')).toBeTruthy();
      expect(getByText('Full Ironman (140.6)')).toBeTruthy();
    });
  });

  it('completes full triathlon onboarding flow', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    // Step 0: Date → NEXT
    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('Half Ironman (70.3)'));

    // Step 1: distance
    fireEvent.press(getByText('Half Ironman (70.3)'));
    await waitFor(() => getByText('How many hours per week can you train?'));

    // Step 2: weeklyHours
    fireEvent.press(getByText('8-10'));
    await waitFor(() => getByText("What's your strongest discipline?"));

    // Step 3: strongestDiscipline
    fireEvent.press(getByText('Bike'));
    await waitFor(() => getByText("What's your weakest discipline?"));

    // Step 4: weakestDiscipline
    fireEvent.press(getByText('Swim'));
    await waitFor(() => getByText('Swimming background?'));

    // Step 5: swimBackground
    fireEvent.press(getByText('Comfortable'));
    await waitFor(() => getByText('When do you prefer your long sessions?'));

    // Step 6: weekendPreference
    fireEvent.press(getByText('Bike Saturday / Run Sunday'));
    await waitFor(() => getByText('Which days do you prefer to swim?'));

    // Step 7: swimDays
    fireEvent.press(getByText('Mon / Wed / Fri'));
    await waitFor(() => getByText('Previous triathlon race experience?'));

    // Step 8: previousRaces
    fireEvent.press(getByText('First timer'));
    await waitFor(() => getByText('Any current injury concerns?'));

    // Step 9: injuries
    fireEvent.press(getByText('None'));
    await waitFor(() => getByText("What's your target finish time?"));

    // Step 10: goalTime
    fireEvent.press(getByText('5:30-6:30'));

    // Step 11: history analysis (no data path)
    await waitFor(() => getByText('Training History'));
    fireEvent.press(getByText('GET STARTED'));

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('saves triathlon raceType and distance to profile', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('Olympic Triathlon'));
    fireEvent.press(getByText('Olympic Triathlon'));
    await waitFor(() => getByText('8-10'));
    fireEvent.press(getByText('8-10'));
    await waitFor(() => getByText('Bike'));
    fireEvent.press(getByText('Bike'));
    await waitFor(() => getByText('Swim'));
    fireEvent.press(getByText('Swim'));
    await waitFor(() => getByText('Comfortable'));
    fireEvent.press(getByText('Comfortable'));
    await waitFor(() => getByText('Bike Saturday / Run Sunday'));
    fireEvent.press(getByText('Run Saturday / Bike Sunday'));
    await waitFor(() => getByText('Mon / Wed / Fri'));
    fireEvent.press(getByText('Tue / Thu / Sat'));
    await waitFor(() => getByText('First timer'));
    fireEvent.press(getByText('First timer'));
    await waitFor(() => getByText('None'));
    fireEvent.press(getByText('None'));
    await waitFor(() => getByText('Sub 2:00'));
    fireEvent.press(getByText('Sub 2:00'));

    // History analysis step (no data path)
    await waitFor(() => getByText('Training History'));
    fireEvent.press(getByText('GET STARTED'));

    await waitFor(async () => {
      const stored = await AsyncStorage.getItem('athleteProfile');
      const profile = JSON.parse(stored);
      expect(profile.raceType).toBe('triathlon');
      expect(profile.distance).toBe('Olympic Triathlon');
      expect(profile.weeklyHours).toBe('8-10');
      expect(profile.schedulePreferences.weekendPreference).toBe('run-sat-bike-sun');
      expect(profile.schedulePreferences.swimDays).toBe('tts');
    });
  });

  it('allows going back to previous step', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('What triathlon distance are you targeting?'));

    fireEvent.press(getByText('BACK'));

    await waitFor(() => {
      expect(getByText('When is your race?')).toBeTruthy();
    });
  });
});
