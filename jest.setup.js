// Global mocks for all tests

// AsyncStorage mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Safe area context mock
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
}));

// DateTimePicker mock
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: (_props) =>
      React.createElement(
        View,
        { testID: 'date-picker' },
        React.createElement(Text, null, 'DatePicker')
      ),
  };
});

// expo-auth-session mock
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'test://redirect',
  useAuthRequest: () => [null, null, jest.fn()],
}));

// expo-apple-authentication mock
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// expo-crypto mock
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn().mockResolvedValue('mock-hash'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// expo-web-browser mock
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// react-native-health mock
jest.mock('react-native-health', () => ({
  default: {
    initHealthKit: jest.fn((_, cb) => cb(null)),
    getRestingHeartRateSamples: jest.fn((_, cb) => cb(null, [])),
    getHeartRateVariabilitySamples: jest.fn((_, cb) => cb(null, [])),
    getSleepSamples: jest.fn((_, cb) => cb(null, [])),
    getVo2MaxSamples: jest.fn((_, cb) => cb(null, [])),
  },
  HealthKitPermissions: {},
}));

// Silence console.warn and act() warnings in tests
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation((msg) => {
  if (typeof msg === 'string' && msg.includes('not wrapped in act')) return;
  // eslint-disable-next-line no-console
  console.log(msg);
});
