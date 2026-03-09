import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';

export default function WorkoutScreen() {
  const { todayWorkout } = useApp();

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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{todayWorkout.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.discipline}>{todayWorkout.discipline?.toUpperCase()}</Text>
          <Text style={styles.duration}>{todayWorkout.duration} min</Text>
          <Text style={styles.intensity}>{todayWorkout.intensity?.toUpperCase()}</Text>
        </View>
        {todayWorkout.summary && <Text style={styles.summary}>{todayWorkout.summary}</Text>}
      </View>

      {/* Workout Sections */}
      {todayWorkout.sections?.map((section, sIdx) => (
        <View key={sIdx} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.name?.toUpperCase()}</Text>
          {section.notes && <Text style={styles.sectionNotes}>{section.notes}</Text>}

          {section.sets?.map((set, setIdx) => (
            <View key={setIdx} style={styles.setRow}>
              <View style={styles.setInfo}>
                <Text style={styles.setDescription}>{set.description}</Text>
                {set.zone && <Text style={styles.setZone}>Zone {set.zone}</Text>}
              </View>
            </View>
          ))}
        </View>
      ))}

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
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  discipline: {
    color: '#47b2ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  duration: {
    color: '#888',
    fontSize: 14,
  },
  intensity: {
    color: '#e8ff47',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  summary: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
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
  setInfo: {
    flex: 1,
  },
  setDescription: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  setZone: {
    color: '#47b2ff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
