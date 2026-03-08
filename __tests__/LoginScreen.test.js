import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../screens/LoginScreen';
import { signInWithGoogle, isAppleSignInAvailable } from '../services/auth';
import { clearAsyncStorage, renderWithProviders } from './test-utils';

jest.mock('../services/auth');
jest.mock('../services/healthKit');

describe('LoginScreen', () => {
  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    isAppleSignInAvailable.mockReturnValue(true);
  });

  it('renders app name and tagline', () => {
    const { getByText } = renderWithProviders(<LoginScreen />);

    expect(getByText('DailyTrain')).toBeTruthy();
    expect(getByText('Sign in with Google')).toBeTruthy();
  });

  it('renders Apple sign-in button on iOS', () => {
    const { getByText } = renderWithProviders(<LoginScreen />);

    expect(getByText('Sign in with Apple')).toBeTruthy();
  });

  it('calls signInWithGoogle on button press', async () => {
    const mockUserData = { id: '1', name: 'Test', email: 'test@test.com', provider: 'google' };
    signInWithGoogle.mockResolvedValue(mockUserData);

    const { getByText } = renderWithProviders(<LoginScreen />);
    fireEvent.press(getByText('Sign in with Google'));

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    });
  });

  it('shows alert on sign-in failure', async () => {
    signInWithGoogle.mockRejectedValue(new Error('Network error'));
    jest.spyOn(Alert, 'alert');

    const { getByText } = renderWithProviders(<LoginScreen />);
    fireEvent.press(getByText('Sign in with Google'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Sign In Failed', 'Network error');
    });
  });

  it('renders feature list items', () => {
    const { getByText } = renderWithProviders(<LoginScreen />);

    expect(getByText(/Personalized daily workouts/)).toBeTruthy();
    expect(getByText(/Apple Health integration/)).toBeTruthy();
    expect(getByText(/Workout plans tailored/)).toBeTruthy();
  });
});
