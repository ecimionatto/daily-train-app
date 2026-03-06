import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { generateWeeklySummaryLocally } from '../services/localModel';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DISCIPLINES = {
  swim: '#47b2ff',
  bike: '#e8ff47',
  run: '#47ffb2',
  rest: '#333',
  strength: '#ff6b6b',
};

export default function WeeklyScreen() {
  const { athleteProfile, getTrainingPhase } = useApp();
  const [weekHistory, setWeekHistory] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    loadWeekHistory();
  }, []);

  async function loadWeekHistory() {
    try {
      const raw = await AsyncStorage.getItem('workoutHistory');
      if (!raw) return;
      const history = JSON.parse(raw);

      // Get last 7 days of workouts
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const thisWeek = history.filter((w) => new Date(w.completedAt) >= sevenDaysAgo);
      setWeekHistory(thisWeek);
    } catch (e) {
      console.warn('Failed to load week history:', e);
    }
  }

  async function requestWeeklySummary() {
    setLoadingSummary(true);
    try {
      const summary = await generateWeeklySummaryLocally({
        profile: athleteProfile,
        weekHistory,
        phase: getTrainingPhase(),
      });
      setWeeklySummary(summary);
    } catch (e) {
      console.warn('Failed to generate weekly summary:', e);
    }
    setLoadingSummary(false);
  }

  function getWeekGrid() {
    const grid = DAYS.map((day) => ({ day, workouts: [] }));
    weekHistory.forEach((w) => {
      const date = new Date(w.completedAt);
      const dayIdx = (date.getDay() + 6) % 7; // Monday = 0
      if (grid[dayIdx]) {
        grid[dayIdx].workouts.push(w);
      }
    });
    return grid;
  }

  function getWeekStats() {
    const totalDuration = weekHistory.reduce((sum, w) => sum + (w.duration || 0), 0);
    const disciplines = {};
    weekHistory.forEach((w) => {
      const d = w.discipline?.toLowerCase() || 'other';
      disciplines[d] = (disciplines[d] || 0) + (w.duration || 0);
    });
    return { totalDuration, disciplines, count: weekHistory.length };
  }

  const grid = getWeekGrid();
  const stats = getWeekStats();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <Text style={styles.subtitle}>
          {stats.count} sessions · {Math.round(stats.totalDuration / 60)}h{' '}
          {stats.totalDuration % 60}m
        </Text>
      </View>

      {/* Week Grid */}
      <View style={styles.gridContainer}>
        {grid.map((day, i) => (
          <View key={i} style={styles.gridDay}>
            <Text style={styles.gridDayLabel}>{day.day}</Text>
            <View style={styles.gridCell}>
              {day.workouts.length > 0 ? (
                day.workouts.map((w, j) => (
                  <View
                    key={j}
                    style={[
                      styles.gridDot,
                      {
                        backgroundColor: DISCIPLINES[w.discipline?.toLowerCase()] || '#888',
                      },
                    ]}
                  />
                ))
              ) : (
                <View style={[styles.gridDot, styles.gridDotEmpty]} />
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Discipline Legend */}
      <View style={styles.legendRow}>
        {Object.entries(DISCIPLINES).map(([name, color]) => (
          <View key={name} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{name.charAt(0).toUpperCase() + name.slice(1)}</Text>
          </View>
        ))}
      </View>

      {/* Discipline Breakdown */}
      <View style={styles.breakdownCard}>
        <Text style={styles.sectionTitle}>DISCIPLINE BREAKDOWN</Text>
        {Object.entries(stats.disciplines).map(([discipline, minutes]) => {
          const pct = stats.totalDuration > 0 ? (minutes / stats.totalDuration) * 100 : 0;
          return (
            <View key={discipline} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>
                {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
              </Text>
              <View style={styles.breakdownBarContainer}>
                <View
                  style={[
                    styles.breakdownBar,
                    {
                      width: `${pct}%`,
                      backgroundColor: DISCIPLINES[discipline] || '#888',
                    },
                  ]}
                />
              </View>
              <Text style={styles.breakdownMinutes}>{minutes}m</Text>
            </View>
          );
        })}
        {Object.keys(stats.disciplines).length === 0 && (
          <Text style={styles.emptyText}>No completed workouts yet</Text>
        )}
      </View>

      {/* AI Weekly Debrief */}
      <View style={styles.debriefCard}>
        <Text style={styles.sectionTitle}>COACH DEBRIEF</Text>
        {weeklySummary ? (
          <Text style={styles.debriefText}>{weeklySummary}</Text>
        ) : (
          <TouchableOpacity
            style={styles.debriefButton}
            onPress={requestWeeklySummary}
            disabled={loadingSummary}
          >
            <Text style={styles.debriefButtonText}>
              {loadingSummary ? 'Analyzing your week...' : 'GET WEEKLY ANALYSIS'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

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
  gridContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  gridDay: {
    alignItems: 'center',
    flex: 1,
  },
  gridDayLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  gridCell: {
    alignItems: 'center',
    gap: 4,
  },
  gridDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  gridDotEmpty: {
    backgroundColor: '#222',
    opacity: 0.4,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  breakdownLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    width: 70,
  },
  breakdownBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#2a2a3e',
    borderRadius: 4,
    marginHorizontal: 8,
  },
  breakdownBar: {
    height: '100%',
    borderRadius: 4,
  },
  breakdownMinutes: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    width: 40,
    textAlign: 'right',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  debriefCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  debriefText: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 24,
  },
  debriefButton: {
    borderWidth: 2,
    borderColor: '#e8ff47',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  debriefButtonText: {
    color: '#e8ff47',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
