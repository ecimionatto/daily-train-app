import React, { useState, useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppProvider } from './context/AppContext';
import OnboardingScreen from './screens/OnboardingScreen';
import DashboardScreen from './screens/DashboardScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import RecoveryScreen from './screens/RecoveryScreen';
import WeeklyScreen from './screens/WeeklyScreen';
import TabBar from './components/TabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Workout" component={WorkoutScreen} />
      <Tab.Screen name="Recovery" component={RecoveryScreen} />
      <Tab.Screen name="Weekly" component={WeeklyScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState(null);

  useEffect(() => {
    checkOnboarding();
  }, []);

  async function checkOnboarding() {
    try {
      const profile = await AsyncStorage.getItem('athleteProfile');
      setIsOnboarded(!!profile);
    } catch {
      setIsOnboarded(false);
    }
  }

  if (isOnboarded === null) return null; // loading

  return (
    <AppProvider>
      <StatusBar barStyle="light-content" />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: '#e8ff47',
            background: '#0a0a0f',
            card: '#0a0a0f',
            text: '#ffffff',
            border: '#1a1a2e',
            notification: '#e8ff47',
          },
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isOnboarded ? (
            <Stack.Screen name="Onboarding">
              {(props) => (
                <OnboardingScreen
                  {...props}
                  onComplete={() => setIsOnboarded(true)}
                />
              )}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="Main" component={MainTabs} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}
