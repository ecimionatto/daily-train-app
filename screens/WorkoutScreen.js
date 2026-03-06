import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';

export default function WorkoutScreen() {
  const { todayWorkout } = useApp();
  const [completedSets, setCompletedSets] = useState({});
  const [workoutCompleted, setWorkoutCompleted] = useState(false);

  if (!todayWorkout) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Workout Yet</Text>
        <Text style={styles.emptySubtitle}>
          {"Head to the Dashboard to generate today's session."}
        </Text>
      </View>
    );
  }

  function toggleSet(sectionIdx, setIdx) {
    const key = `${sectionIdx}-${setIdx}`;
    setCompletedSets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isSetDone(sectionIdx, setIdx) {
    return !!completedSets[`${sectionIdx}-${setIdx}`];
  }

  function getTotalSets() {
    if (!todayWorkout.sections) return 0;
    return todayWorkout.sections.reduce((sum, s) => sum + (s.sets?.length || 0), 0);
  }

  function getCompletedCount() {
    return Object.values(completedSets).filter(Boolean).length;
  }

  async function markWorkoutComplete() {
    try {
      const historyRaw = await AsyncStorage.getItem('workoutHistory');
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      history.push({
        ...todayWorkout,
        completedAt: new Date().toISOString(),
        completedSets: getCompletedCount(),
        totalSets: getTotalSets(),
      });
      await AsyncStorage.setItem('workoutHistory', JSON.stringify(history));
      setWorkoutCompleted(true);
    } catch (e) {
      console.warn('Failed to save workout history:', e);
    }
  }

  const progress = getTotalSets() > 0 ? getCompletedCount() / getTotalSets() : 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{todayWorkout.title}</Text>
        <Text style={styles.discipline}>{todayWorkout.discipline?.toUpperCase()}</Text>
        <Text style={styles.duration}>{todayWorkout.duration} min</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {getCompletedCount()} / {getTotalSets()} sets
        </Text>
      </View>

      {/* Workout Sections */}
      {todayWorkout.sections?.map((section, sIdx) => (
        <View key={sIdx} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.name?.toUpperCase()}</Text>
          {section.notes && <Text style={styles.sectionNotes}>{section.notes}</Text>}

          {section.sets?.map((set, setIdx) => (
            <TouchableOpacity
              key={setIdx}
              style={[styles.setRow, isSetDone(sIdx, setIdx) && styles.setDone]}
              onPress={() => toggleSet(sIdx, setIdx)}
            >
              <View style={[styles.checkbox, isSetDone(sIdx, setIdx) && styles.checkboxDone]}>
                {isSetDone(sIdx, setIdx) && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.setInfo}>
                <Text
                  style={[styles.setDescription, isSetDone(sIdx, setIdx) && styles.setTextDone]}
                >
                  {set.description}
                </Text>
                {set.zone && <Text style={styles.setZone}>Zone {set.zone}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* Complete Button */}
      {!workoutCompleted ? (
        <TouchableOpacity
          style={[styles.completeButton, progress < 0.5 && styles.completeButtonDisabled]}
          onPress={markWorkoutComplete}
        >
          <Text style={styles.completeButtonText}>MARK COMPLETE</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.completedBanner}>
          <Text style={styles.completedText}>WORKOUT LOGGED</Text>
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
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  header: {
    paddingTop: 60,
    marginBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 4,
  },
  discipline: {
    color: '#47b2ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  duration: {
    color: '#888',
    fontSize: 14,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#1a1a2e',
    borderRadius: 3,
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e8ff47',
    borderRadius: 3,
  },
  progressText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#e8ff47',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  sectionNotes: {
    color: '#888',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  setDone: {
    opacity: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#444',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxDone: {
    backgroundColor: '#e8ff47',
    borderColor: '#e8ff47',
  },
  checkmark: {
    color: '#0a0a0f',
    fontSize: 14,
    fontWeight: '800',
  },
  setInfo: {
    flex: 1,
  },
  setDescription: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  setTextDone: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  setZone: {
    color: '#47b2ff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  completeButton: {
    backgroundColor: '#e8ff47',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  completeButtonDisabled: {
    opacity: 0.4,
  },
  completeButtonText: {
    color: '#0a0a0f',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  completedBanner: {
    backgroundColor: '#47ffb2',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  completedText: {
    color: '#0a0a0f',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
