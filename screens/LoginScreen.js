import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle, signInWithApple, isAppleSignInAvailable } from '../services/auth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const userData = await signInWithGoogle();
      if (userData) {
        await signIn(userData);
      }
    } catch (e) {
      Alert.alert('Sign In Failed', e.message || 'Please try again.');
    }
    setLoading(false);
  }

  async function handleAppleSignIn() {
    setLoading(true);
    try {
      const userData = await signInWithApple();
      if (userData) {
        await signIn(userData);
      }
    } catch (e) {
      if (e.code !== 'ERR_CANCELED') {
        Alert.alert('Sign In Failed', e.message || 'Please try again.');
      }
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.appName}>DailyTrain</Text>
        <Text style={styles.tagline}>AI-powered Ironman training{'\n'}on your iPhone</Text>
      </View>

      <View style={styles.features}>
        <Text style={styles.feature}>● Personalized daily workouts from on-device AI</Text>
        <Text style={styles.feature}>● Apple Health integration for smart recovery</Text>
        <Text style={styles.feature}>● Workout plans tailored to your goals</Text>
      </View>

      <View style={styles.buttons}>
        {/* Apple Sign In - iOS only */}
        {Platform.OS === 'ios' && isAppleSignInAvailable() && (
          <TouchableOpacity
            style={styles.appleButton}
            onPress={handleAppleSignIn}
            disabled={loading}
          >
            <Text style={styles.appleIcon}></Text>
            <Text style={styles.appleButtonText}>Sign in with Apple</Text>
          </TouchableOpacity>
        )}

        {/* Google Sign In */}
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleButtonText}>Sign in with Google</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>
        By signing in, you agree to our Terms of Service and Privacy Policy. Your health data stays
        on your device.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  hero: {
    marginBottom: 40,
  },
  appName: {
    color: '#e8ff47',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  tagline: {
    color: '#888',
    fontSize: 18,
    lineHeight: 26,
    marginTop: 8,
  },
  features: {
    marginBottom: 48,
  },
  feature: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 28,
  },
  buttons: {
    gap: 12,
    marginBottom: 32,
  },
  appleButton: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  appleIcon: {
    fontSize: 20,
    color: '#000000',
  },
  appleButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  googleButton: {
    backgroundColor: '#1a1a2e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    gap: 10,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: '#e8ff47',
  },
  googleButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
