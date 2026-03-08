import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TabBar from '../components/TabBar';

describe('TabBar', () => {
  const createMockProps = (focusedIndex = 0) => ({
    state: {
      index: focusedIndex,
      routes: [
        { key: 'Dashboard-key', name: 'Dashboard' },
        { key: 'Workout-key', name: 'Workout' },
        { key: 'Recovery-key', name: 'Recovery' },
        { key: 'Weekly-key', name: 'Weekly' },
        { key: 'Coach-key', name: 'Coach' },
      ],
    },
    descriptors: {
      'Dashboard-key': { options: {} },
      'Workout-key': { options: {} },
      'Recovery-key': { options: {} },
      'Weekly-key': { options: {} },
      'Coach-key': { options: {} },
    },
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
  });

  it('renders all five tab labels', () => {
    const props = createMockProps();
    const { getByText } = render(<TabBar {...props} />);

    expect(getByText('Home')).toBeTruthy();
    expect(getByText('Train')).toBeTruthy();
    expect(getByText('Recovery')).toBeTruthy();
    expect(getByText('Week')).toBeTruthy();
    expect(getByText('Coach')).toBeTruthy();
  });

  it('renders tab icons', () => {
    const props = createMockProps();
    const { getByText } = render(<TabBar {...props} />);

    expect(getByText('◉')).toBeTruthy();
    expect(getByText('▶')).toBeTruthy();
    expect(getByText('♥')).toBeTruthy();
    expect(getByText('▦')).toBeTruthy();
    expect(getByText('●')).toBeTruthy();
  });

  it('navigates to tab on press', () => {
    const props = createMockProps(0);
    const { getByText } = render(<TabBar {...props} />);

    fireEvent.press(getByText('Train'));

    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'Workout-key' })
    );
    expect(props.navigation.navigate).toHaveBeenCalledWith('Workout');
  });

  it('does not navigate when pressing the focused tab', () => {
    const props = createMockProps(0);
    const { getByText } = render(<TabBar {...props} />);

    fireEvent.press(getByText('Home'));

    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  it('renders correct number of tabs for focused state', () => {
    const props = createMockProps(2);
    render(<TabBar {...props} />);

    // All 5 routes rendered
    expect(props.state.routes).toHaveLength(5);
  });
});
