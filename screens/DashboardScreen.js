import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { generateWorkoutLocally } from '../services/localModel';

export default function DashboardScreen({ navigation }) {
  const {
    athleteProfile,
    healthData,
    readinessScore,
    todayWorkout,
    saveTodayWorkout,
    loadHealthData,
    getTrainingPhase,
    getDaysToRace,
  } = useApp();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const daysToRace = getDaysToRace();
  const phase = getTrainingPhase();

  useEffect(() => {
    if (!todayWorkout && healthData && athleteProfile) {
      fetchWorkout();
    }
  }, [healthData, athleteProfile]);

  async function fetchWorkout() {
    setLoading(true);
    try {
      const workout = await generateWorkoutLocally({
        profile: athleteProfile,
        healthData,
        readinessScore,
        phase,
        daysToRace,
      });
      await saveTodayWorkout(workout);
    } catch (e) {
      console.warn('Failed to generate workout:', e);
    }
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadHealthData();
    setRefreshing(false);
  }

  function getReadinessColor(score) {
    if (score >= 75) return '#47ffb2';
    if (score >= 55) return '#e8ff47';
    return '#ff6b6b';
  }

  function getReadinessLabel(score) {
    if (score >= 75) return 'READY TO PUSH';
    if (score >= 55) return 'MODERATE EFFORT';
    return 'RECOVERY DAY';
  }

  const phaseLabels = {
    BASE: 'Base Building',
    BUILD: 'Build Phase',
    PEAK: 'Peak Training',
    TAPER: 'Taper',
    RACE_WEEK: 'Race Week',
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#e8ff47"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>IronCoach</Text>
        <Text style={styles.phaseLabel}>{phaseLabels[phase] || phase}</Text>
      </View>

      {/* Race Countdown */}
      {daysToRace !== null && (
        <View style={styles.countdownCard}>
          <Text style={styles.countdownNumber}>{daysToRace}</Text>
          <Text style={styles.countdownLabel}>DAYS TO RACE</Text>
        </View>
      )}

      {/* Readiness Score */}
      {readinessScore !== null && (
        <View style={styles.readinessCard}>
          <View style={styles.readinessRow}>
            <Text
              style={[
                styles.readinessScore,
                { color: getReadinessColor(readinessScore) },
              ]}
            >
              {readinessScore}
            </Text>
            <View style={styles.readinessInfo}>
              <Text style={styles.readinessTitle}>READINESS</Text>
              <Text
                style={[
                  styles.readinessLabel,
                  { color: getReadinessColor(readinessScore) },
                ]}
              >
                {getReadinessLabel(readinessScore)}
              </Text>
            </View>
          </View>

          {healthData && (
            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {healthData.restingHR || '--'}
                </Text>
                <Text style={styles.metricLabel}>RHR</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {healthData.hrv || '--'}
                </Text>
                <Text style={styles.metricLabel}>HRV</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {healthData.sleepHours?.toFixed(1) || '--'}
                </Text>
                <Text style={styles.metricLabel}>SLEEP</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Today's Workout Preview */}
      <View style={styles.workoutCard}>
        <Text style={styles.sectionTitle}>TODAY'S SESSION</Text>
        {loading ? (
          <Text style={styles.loadingText}>Generating your workout...</Text>
        ) : todayWorkout ? (
          <>
            <Text style={styles.workoutTitle}>{todayWorkout.title}</Text>
            <Text style={styles.workoutDiscipline}>
              {todayWorkout.discipline?.toUpperCase()}
            </Text>
            <Text style={styles.workoutDuration}>
              {todayWorkout.duration} min
            </Text>
            <Text style={styles.workoutDescription}>
              {todayWorkout.summary}
            </Text>
            <TouchableOpacity
              style={styles.startButton}
              onPress={() => navigation.navigate('Workout')}
            >
              <Text style={styles.startButtonText}>VIEW FULL WORKOUT</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.generateButton} onPress={fetchWorkout}>
            <Text style={styles.generateButtonText}>GENERATE WORKOUT</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 60,
    marginBottom: 24,
  },
  greeting: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },
  phaseLabel: {
    color: '#e8ff47',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },
  countdownCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  countdownNumber: {
    color: '#e8ff47',
    fontSize: 72,
    fontWeight: '900',
  },
  countdownLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 4,
  },
  readinessCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  readinessScore: {
    fontSize: 56,
    fontWeight: '900',
    marginRight: 16,
  },
  readinessInfo: {
    flex: 1,
  },
  readinessTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  readinessLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    paddingTop: 16,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 4,
  },
  workoutCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 100,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  loadingText: {
    color: '#e8ff47',
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 20,
  },
  workoutTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  workoutDiscipline: {
    color: '#47b2ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  workoutDuration: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  workoutDescription: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: '#e8ff47',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#0a0a0f',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  generateButton: {
    borderWidth: 2,
    borderColor: '#e8ff47',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#e8ff47',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
