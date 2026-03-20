import React, { useState, useEffect } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';

SplashScreen.preventAutoHideAsync();
import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import DashboardScreen from './screens/DashboardScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import RecoveryScreen from './screens/RecoveryScreen';
import WeeklyScreen from './screens/WeeklyScreen';
import ChatScreen from './screens/ChatScreen';
import CalendarScreen from './screens/CalendarScreen';
import TabBar from './components/TabBar';
import { ChatProvider } from './context/ChatContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const NAV_THEME = {
  dark: true,
  colors: {
    primary: '#e8ff47',
    background: '#0a0a0f',
    card: '#0a0a0f',
    text: '#ffffff',
    border: '#1a1a2e',
    notification: '#e8ff47',
  },
};

function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Workout" component={WorkoutScreen} />
      <Tab.Screen name="Recovery" component={RecoveryScreen} />
      <Tab.Screen name="Weekly" component={WeeklyScreen} />
      <Tab.Screen name="Coach" component={ChatScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [isOnboarded, setIsOnboarded] = useState(null);
  const [checkingOnboarded, setCheckingOnboarded] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      checkOnboarding();
    } else {
      setIsOnboarded(null);
    }
  }, [isAuthenticated]);

  async function checkOnboarding() {
    setCheckingOnboarded(true);
    try {
      const profile = await AsyncStorage.getItem('athleteProfile');
      setIsOnboarded(!!profile);
    } catch {
      setIsOnboarded(false);
    } finally {
      setCheckingOnboarded(false);
    }
  }

  if (authLoading || checkingOnboarded) return null;

  return (
    <NavigationContainer theme={NAV_THEME}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !isOnboarded ? (
          <Stack.Screen name="Onboarding">
            {(props) => <OnboardingScreen {...props} onComplete={() => setIsOnboarded(true)} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppLoader({ children }) {
  const { athleteProfile } = useApp();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // Consider app ready once we've attempted to load profile (null or set)
    if (athleteProfile !== undefined) {
      setAppReady(true);
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [athleteProfile]);

  if (!appReady) {
    return (
      <View style={splashStyles.container}>
        <Image source={require('./assets/icon.png')} style={splashStyles.logo} />
        <ActivityIndicator color="#e8ff47" size="small" style={splashStyles.spinner} />
      </View>
    );
  }

  return <View style={{ flex: 1 }}>{children}</View>;
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
  },
  spinner: {
    marginTop: 24,
  },
});

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ChatProvider>
          <StatusBar barStyle="light-content" />
          <AppLoader>
            <AppNavigator />
          </AppLoader>
        </ChatProvider>
      </AppProvider>
    </AuthProvider>
  );
}
