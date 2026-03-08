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
    expect(getByText('STEP 1 OF 8')).toBeTruthy();
    expect(getByText('NEXT')).toBeTruthy();
  });

  it('advances to first question on NEXT press', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));

    await waitFor(() => {
      expect(getByText('How many hours per week can you train?')).toBeTruthy();
      expect(getByText('STEP 2 OF 8')).toBeTruthy();
    });
  });

  it('selects an option and auto-advances to next question', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('How many hours per week can you train?'));

    fireEvent.press(getByText('8-10'));

    await waitFor(() => {
      expect(getByText("What's your strongest discipline?")).toBeTruthy();
    });
  });

  it('allows going back to previous step', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('How many hours per week can you train?'));

    fireEvent.press(getByText('BACK'));

    await waitFor(() => {
      expect(getByText('When is your race?')).toBeTruthy();
    });
  });

  it('completes full onboarding flow through all questions', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    // Step 0: Date → NEXT
    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('How many hours per week can you train?'));

    // Step 1: weeklyHours
    fireEvent.press(getByText('8-10'));
    await waitFor(() => getByText("What's your strongest discipline?"));

    // Step 2: strongestDiscipline
    fireEvent.press(getByText('Bike'));
    await waitFor(() => getByText("What's your weakest discipline?"));

    // Step 3: weakestDiscipline
    fireEvent.press(getByText('Swim'));
    await waitFor(() => getByText('Swimming background?'));

    // Step 4: swimBackground
    fireEvent.press(getByText('Comfortable'));
    await waitFor(() => getByText('Previous Ironman experience?'));

    // Step 5: previousIronman
    fireEvent.press(getByText('First timer'));
    await waitFor(() => getByText('Any current injury concerns?'));

    // Step 6: injuries
    fireEvent.press(getByText('None'));
    await waitFor(() => getByText("What's your target finish time?"));

    // Step 7: goalTime → triggers finishOnboarding
    fireEvent.press(getByText('12-14h'));

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('saves profile to AsyncStorage on completion', async () => {
    const { getByText } = renderWithProviders(<OnboardingScreen onComplete={mockOnComplete} />);

    fireEvent.press(getByText('NEXT'));
    await waitFor(() => getByText('How many hours per week can you train?'));

    fireEvent.press(getByText('5-7'));
    await waitFor(() => getByText("What's your strongest discipline?"));

    fireEvent.press(getByText('Run'));
    await waitFor(() => getByText("What's your weakest discipline?"));

    fireEvent.press(getByText('Swim'));
    await waitFor(() => getByText('Swimming background?'));

    fireEvent.press(getByText('Learning'));
    await waitFor(() => getByText('Previous Ironman experience?'));

    fireEvent.press(getByText('First timer'));
    await waitFor(() => getByText('Any current injury concerns?'));

    fireEvent.press(getByText('None'));
    await waitFor(() => getByText("What's your target finish time?"));

    fireEvent.press(getByText('Just finish'));

    await waitFor(async () => {
      const stored = await AsyncStorage.getItem('athleteProfile');
      const profile = JSON.parse(stored);
      expect(profile.weeklyHours).toBe('5-7');
      expect(profile.strongestDiscipline).toBe('Run');
      expect(profile.weakestDiscipline).toBe('Swim');
      expect(profile.raceDate).toBeDefined();
    });
  });
});
