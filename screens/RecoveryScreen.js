import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { fetchHealthHistory } from '../services/healthKit';

export default function RecoveryScreen() {
  const { healthData, readinessScore } = useApp();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const data = await fetchHealthHistory(14);
      setHistory(data);
    } catch (e) {
      console.warn('Failed to load health history:', e);
    }
  }

  function renderSparkline(data, color, maxVal) {
    if (!data || data.length === 0) return null;
    const max = maxVal || Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    return (
      <View style={styles.sparkline}>
        {data.map((val, i) => {
          const height = ((val - min) / range) * 40 + 4;
          return (
            <View
              key={i}
              style={[
                styles.sparkBar,
                {
                  height,
                  backgroundColor: color,
                  opacity: i === data.length - 1 ? 1 : 0.5,
                },
              ]}
            />
          );
        })}
      </View>
    );
  }

  function getReadinessColor(score) {
    if (score >= 75) return '#47ffb2';
    if (score >= 55) return '#e8ff47';
    return '#ff6b6b';
  }

  const hrvValues = history.map((d) => d.hrv).filter(Boolean);
  const rhrValues = history.map((d) => d.restingHR).filter(Boolean);
  const sleepValues = history.map((d) => d.sleepHours).filter(Boolean);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery</Text>
        <Text style={styles.subtitle}>14-Day Health Trends</Text>
      </View>

      {/* Overall Readiness */}
      <View style={styles.readinessCard}>
        <Text style={styles.cardLabel}>{"TODAY'S READINESS"}</Text>
        <Text style={[styles.readinessValue, { color: getReadinessColor(readinessScore || 0) }]}>
          {readinessScore || '--'}
        </Text>
        <Text style={styles.readinessScale}>/100</Text>
      </View>

      {/* HRV Trend */}
      <View style={styles.trendCard}>
        <View style={styles.trendHeader}>
          <View>
            <Text style={styles.cardLabel}>HRV (SDNN)</Text>
            <Text style={styles.trendValue}>
              {healthData?.hrv || '--'} <Text style={styles.trendUnit}>ms</Text>
            </Text>
          </View>
          <Text style={styles.trendDirection}>
            {hrvValues.length >= 2 &&
            hrvValues[hrvValues.length - 1] > hrvValues[hrvValues.length - 2]
              ? '↑'
              : hrvValues.length >= 2
                ? '↓'
                : '—'}
          </Text>
        </View>
        {renderSparkline(hrvValues, '#47ffb2')}
        <Text style={styles.trendHint}>Higher HRV = better recovery and readiness</Text>
      </View>

      {/* Resting HR Trend */}
      <View style={styles.trendCard}>
        <View style={styles.trendHeader}>
          <View>
            <Text style={styles.cardLabel}>RESTING HEART RATE</Text>
            <Text style={styles.trendValue}>
              {healthData?.restingHR || '--'} <Text style={styles.trendUnit}>bpm</Text>
            </Text>
          </View>
          <Text style={styles.trendDirection}>
            {rhrValues.length >= 2 &&
            rhrValues[rhrValues.length - 1] < rhrValues[rhrValues.length - 2]
              ? '↓ ✓'
              : rhrValues.length >= 2
                ? '↑'
                : '—'}
          </Text>
        </View>
        {renderSparkline(rhrValues, '#ff6b6b')}
        <Text style={styles.trendHint}>Lower RHR = better cardiovascular fitness</Text>
      </View>

      {/* Sleep Trend */}
      <View style={styles.trendCard}>
        <View style={styles.trendHeader}>
          <View>
            <Text style={styles.cardLabel}>SLEEP</Text>
            <Text style={styles.trendValue}>
              {healthData?.sleepHours?.toFixed(1) || '--'} <Text style={styles.trendUnit}>hrs</Text>
            </Text>
          </View>
          <Text
            style={[
              styles.sleepGrade,
              {
                color:
                  (healthData?.sleepHours || 0) >= 7
                    ? '#47ffb2'
                    : (healthData?.sleepHours || 0) >= 6
                      ? '#e8ff47'
                      : '#ff6b6b',
              },
            ]}
          >
            {(healthData?.sleepHours || 0) >= 7
              ? 'GOOD'
              : (healthData?.sleepHours || 0) >= 6
                ? 'OK'
                : 'LOW'}
          </Text>
        </View>
        {renderSparkline(sleepValues, '#47b2ff', 10)}
        <Text style={styles.trendHint}>Aim for 7-9 hours for optimal recovery</Text>
      </View>

      {/* VO2Max if available */}
      {healthData?.vo2Max && (
        <View style={styles.trendCard}>
          <Text style={styles.cardLabel}>VO2 MAX</Text>
          <Text style={styles.trendValue}>
            {healthData.vo2Max} <Text style={styles.trendUnit}>ml/kg/min</Text>
          </Text>
          <Text style={styles.trendHint}>Measured from Apple Watch workouts</Text>
        </View>
      )}

      <View style={{ height: 100 }} />
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
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  readinessCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  readinessValue: {
    fontSize: 64,
    fontWeight: '900',
  },
  readinessScale: {
    color: '#888',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
  },
  trendCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  trendValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  trendUnit: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  trendDirection: {
    fontSize: 28,
    color: '#47ffb2',
    fontWeight: '700',
  },
  sleepGrade: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 44,
    gap: 3,
    marginBottom: 8,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 4,
  },
  trendHint: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});
