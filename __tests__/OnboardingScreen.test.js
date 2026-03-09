import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from '../screens/OnboardingScreen';
import { clearAsyncStorage, seedAsyncStorage, mockUser, renderWithProviders } from './test-utils';

jest.mock('../services/healthKit');

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

  it('shows race type selection after date', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));

    await waitFor(() => {
      expect(getByText('What type of race are you training for?')).toBeTruthy();
      expect(getByText('Triathlon')).toBeTruthy();
      expect(getByText('Running')).toBeTruthy();
    });
  });

  it('shows triathlon distances when Triathlon selected', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('Triathlon'));
    fireEvent.press(getByText('Triathlon'));

    await waitFor(() => {
      expect(getByText('What distance?')).toBeTruthy();
      expect(getByText('Sprint Triathlon')).toBeTruthy();
      expect(getByText('Full Ironman (140.6)')).toBeTruthy();
    });
  });

  it('shows running distances when Running selected', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('Running'));
    fireEvent.press(getByText('Running'));

    await waitFor(() => {
      expect(getByText('What distance?')).toBeTruthy();
      expect(getByText('5K')).toBeTruthy();
      expect(getByText('Marathon')).toBeTruthy();
    });
  });

  it('skips swim/bike questions for running race type', async () => {
    const { getByText, queryByText } = renderWithProviders(
      <OnboardingScreen onComplete={mockOnComplete} />
    );

    // Date → NEXT
    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('Running'));

    // Race type → Running
    fireEvent.press(getByText('Running'));
    await waitFor(() => getByText('Marathon'));

    // Distance → Marathon
    fireEvent.press(getByText('Marathon'));
    await waitFor(() => getByText('How many hours per week can you train?'));

    // Weekly hours → 8-10
    fireEvent.press(getByText('8-10'));

    // Should go to experience, NOT strongest discipline
    await waitFor(() => {
      expect(getByText('Previous race experience at this distance?')).toBeTruthy();
      expect(queryByText("What's your strongest discipline?")).toBeNull();
    });
  });

  it('completes full triathlon onboarding flow', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    // Step 0: Date → NEXT
    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('Triathlon'));

    // Step 1: raceType
    fireEvent.press(getByText('Triathlon'));
    await waitFor(() => getByText('Half Ironman (70.3)'));

    // Step 2: distance
    fireEvent.press(getByText('Half Ironman (70.3)'));
    await waitFor(() => getByText('How many hours per week can you train?'));

    // Step 3: weeklyHours
    fireEvent.press(getByText('8-10'));
    await waitFor(() => getByText("What's your strongest discipline?"));

    // Step 4: strongestDiscipline
    fireEvent.press(getByText('Bike'));
    await waitFor(() => getByText("What's your weakest discipline?"));

    // Step 5: weakestDiscipline
    fireEvent.press(getByText('Swim'));
    await waitFor(() => getByText('Swimming background?'));

    // Step 6: swimBackground
    fireEvent.press(getByText('Comfortable'));
    await waitFor(() => getByText('Previous triathlon race experience?'));

    // Step 7: previousRaces
    fireEvent.press(getByText('First timer'));
    await waitFor(() => getByText('Any current injury concerns?'));

    // Step 8: injuries
    fireEvent.press(getByText('None'));
    await waitFor(() => getByText("What's your target finish time?"));

    // Step 9: goalTime
    fireEvent.press(getByText('5:30-6:30'));

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('saves raceType and distance to profile', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    // Quick running flow
    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('Running'));
    fireEvent.press(getByText('Running'));
    await waitFor(() => getByText('10K'));
    fireEvent.press(getByText('10K'));
    await waitFor(() => getByText('8-10'));
    fireEvent.press(getByText('8-10'));
    await waitFor(() => getByText('First timer'));
    fireEvent.press(getByText('First timer'));
    await waitFor(() => getByText('None'));
    fireEvent.press(getByText('None'));
    await waitFor(() => getByText('Sub 45min'));
    fireEvent.press(getByText('Sub 45min'));

    await waitFor(async () => {
      const stored = await AsyncStorage.getItem('athleteProfile');
      const profile = JSON.parse(stored);
      expect(profile.raceType).toBe('running');
      expect(profile.distance).toBe('10K');
      expect(profile.weeklyHours).toBe('8-10');
    });
  });

  it('allows going back to previous step', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('What type of race are you training for?'));

    fireEvent.press(getByText('BACK'));

    await waitFor(() => {
      expect(getByText('When is your race?')).toBeTruthy();
    });
  });
});
