import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { generateWeeklySummaryLocally } from '../services/localModel';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DISCIPLINES = {
  swim: '#47b2ff',
  bike: '#e8ff47',
  run: '#47ffb2',
  rest: '#333',
  strength: '#ff6b6b',
  brick: '#ff9f43',
};

const DOT_OPACITY_DONE = 1;
const DOT_OPACITY_NOT_DONE = 0.4;

/**
 * Get the Monday of the current week as a Date object.
 */
function getMondayOfCurrentWeek() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Check whether any completed workout falls on a given calendar date.
 *
 * @param {Array} completedWorkouts
 * @param {Date} date
 * @returns {boolean}
 */
function hasWorkoutOnDate(completedWorkouts, date) {
  if (!completedWorkouts || completedWorkouts.length === 0) return false;
  return completedWorkouts.some((w) => {
    if (!w.startDate) return false;
    return new Date(w.startDate).toDateString() === date.toDateString();
  });
}

/**
 * Build the 7-day week grid using the prescribed plan as source of truth.
 * One dot per day — the prescribed discipline. Overlay with completion status.
 *
 * @param {string[]} weekPlan - Array of 7 disciplines indexed 0=Sun..6=Sat
 * @param {Array} completedWorkouts
 * @returns {Array<{ day: string, date: Date, discipline: string, completed: boolean, isToday: boolean, isFuture: boolean }>}
 */
function buildWeekGrid(weekPlan, completedWorkouts) {
  const monday = getMondayOfCurrentWeek();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return DAYS.map((dayLabel, idx) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + idx);

    // weekPlan is indexed Sun=0..Sat=6, our grid is Mon=0..Sun=6
    const sundayBasedIdx = (idx + 1) % 7;
    const discipline = weekPlan[sundayBasedIdx] || 'rest';

    const isToday = date.toDateString() === today.toDateString();
    const isFuture = date > today;
    const completed = hasWorkoutOnDate(completedWorkouts, date);

    return { day: dayLabel, date, discipline, completed, isToday, isFuture };
  });
}

export default function WeeklyScreen({ navigation }) {
  const { athleteProfile, phase, daysToRace, weekPlan, completedWorkouts } = useApp();
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const weekGrid = useMemo(
    () => buildWeekGrid(weekPlan, completedWorkouts),
    [weekPlan, completedWorkouts]
  );

  const weekHistory = useMemo(() => {
    if (!completedWorkouts || completedWorkouts.length === 0) return [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return completedWorkouts.filter((w) => {
      const date = w.startDate ? new Date(w.startDate) : null;
      return date && date >= sevenDaysAgo;
    });
  }, [completedWorkouts]);

  const weekNumber = useMemo(() => {
    if (!athleteProfile?.raceDate || daysToRace == null) return null;
    const totalWeeks = Math.ceil(
      (new Date(athleteProfile.raceDate) - new Date(athleteProfile.createdAt || Date.now())) /
        (7 * 24 * 60 * 60 * 1000)
    );
    const weeksRemaining = Math.ceil(daysToRace / 7);
    const current = Math.max(1, totalWeeks - weeksRemaining + 1);
    return current;
  }, [athleteProfile, daysToRace]);

  const stats = useMemo(() => {
    const totalDuration = weekHistory.reduce(
      (sum, w) => sum + (w.durationMinutes || w.duration || 0),
      0
    );
    const disciplineMap = {};
    weekHistory.forEach((w) => {
      const d = w.discipline?.toLowerCase() || 'other';
      disciplineMap[d] = (disciplineMap[d] || 0) + (w.durationMinutes || w.duration || 0);
    });
    return { totalDuration, disciplines: disciplineMap };
  }, [weekHistory]);

  async function requestWeeklySummary() {
    setLoadingSummary(true);
    try {
      const summary = await generateWeeklySummaryLocally({
        profile: athleteProfile,
        weekHistory,
        phase,
      });
      setWeeklySummary(summary);
    } catch (e) {
      console.warn('Failed to generate weekly summary:', e);
    }
    setLoadingSummary(false);
  }

  function getDotOpacity(gridDay) {
    if (gridDay.completed) return DOT_OPACITY_DONE;
    return DOT_OPACITY_NOT_DONE;
  }

  function getDisciplineColor(discipline) {
    return DISCIPLINES[discipline] || '#888';
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <Text style={styles.subtitle}>
          {weekNumber != null ? `Week ${weekNumber} of training plan` : `Phase: ${phase}`}
        </Text>
      </View>

      {/* Week Grid — one dot per prescribed day */}
      <View style={styles.gridContainer}>
        {weekGrid.map((gridDay, i) => (
          <View key={i} style={styles.gridDay}>
            <Text style={[styles.gridDayLabel, gridDay.isToday && styles.gridDayLabelToday]}>
              {gridDay.day}
            </Text>
            <View style={styles.gridCell}>
              <View
                style={[
                  styles.gridDot,
                  {
                    backgroundColor: getDisciplineColor(gridDay.discipline),
                    opacity: getDotOpacity(gridDay),
                  },
                ]}
              />
              {gridDay.completed && <Text style={styles.completedMark}>✓</Text>}
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
                      backgroundColor: getDisciplineColor(discipline),
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

      {/* Plan Settings Button */}
      <TouchableOpacity
        style={styles.planSettingsButton}
        onPress={() => navigation.navigate('PlanSettings')}
      >
        <Text style={styles.planSettingsButtonText}>PLAN SETTINGS</Text>
      </TouchableOpacity>

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
  gridDayLabelToday: {
    color: '#e8ff47',
  },
  gridCell: {
    alignItems: 'center',
    gap: 2,
  },
  gridDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  completedMark: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
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
  planSettingsButton: {
    borderWidth: 2,
    borderColor: '#888',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  planSettingsButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
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
