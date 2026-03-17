import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { getCoachResponse } from '../services/chatService';
import { fetchHealthData, calculateReadiness } from '../services/healthKit';
import {
  clearAsyncStorage,
  seedAsyncStorage,
  mockUser,
  mockProfile,
  mockHealthData,
  renderWithProviders,
} from './test-utils';

jest.mock('../services/healthKit');
jest.mock('../services/chatService');

describe('ChatScreen', () => {
  beforeEach(async () => {
    await clearAsyncStorage();
    jest.clearAllMocks();
    fetchHealthData.mockResolvedValue(mockHealthData);
    calculateReadiness.mockReturnValue(72);
    getCoachResponse.mockResolvedValue('Great question! Keep training hard.');
  });

  it('renders header with Coach title', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<ChatScreen />, { withChat: true });

    await waitFor(() => {
      expect(getByText('Coach')).toBeTruthy();
      expect(getByText('ON-DEVICE AI')).toBeTruthy();
    });
  });

  it('shows empty state with AI Coach message', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<ChatScreen />, { withChat: true });

    await waitFor(() => {
      expect(getByText('AI Coach')).toBeTruthy();
    });
  });

  it('shows suggestion chips in empty state', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText } = renderWithProviders(<ChatScreen />, { withChat: true });

    await waitFor(() => {
      expect(getByText('How should I train this week?')).toBeTruthy();
      expect(getByText("Can I modify today's workout?")).toBeTruthy();
      expect(getByText('How is my recovery looking?')).toBeTruthy();
      expect(getByText('Tips for race day nutrition?')).toBeTruthy();
    });
  });

  it('populates input when suggestion chip is pressed', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByText, getByPlaceholderText } = renderWithProviders(<ChatScreen />, {
      withChat: true,
    });

    await waitFor(() => getByText('How should I train this week?'));
    fireEvent.press(getByText('How should I train this week?'));

    const input = getByPlaceholderText('Ask your coach...');
    expect(input.props.value).toBe('How should I train this week?');
  });

  it('sends message and shows athlete bubble', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByPlaceholderText, getByText } = renderWithProviders(<ChatScreen />, {
      withChat: true,
    });

    const input = getByPlaceholderText('Ask your coach...');
    fireEvent.changeText(input, 'How is my recovery?');
    fireEvent.press(getByText('>'));

    await waitFor(() => {
      expect(getByText('How is my recovery?')).toBeTruthy();
    });
  });

  it('displays coach response after sending message', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByPlaceholderText, getByText } = renderWithProviders(<ChatScreen />, {
      withChat: true,
    });

    const input = getByPlaceholderText('Ask your coach...');
    fireEvent.changeText(input, 'Train advice?');
    fireEvent.press(getByText('>'));

    await waitFor(() => {
      expect(getByText('Great question! Keep training hard.')).toBeTruthy();
      expect(getByText('COACH')).toBeTruthy();
    });
  });

  it('clears input after sending', async () => {
    await seedAsyncStorage({ user: mockUser, profile: mockProfile });
    const { getByPlaceholderText, getByText } = renderWithProviders(<ChatScreen />, {
      withChat: true,
    });

    const input = getByPlaceholderText('Ask your coach...');
    fireEvent.changeText(input, 'Hello coach');
    fireEvent.press(getByText('>'));

    await waitFor(() => {
      expect(input.props.value).toBe('');
    });
  });
});
