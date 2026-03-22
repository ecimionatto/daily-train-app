import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { buildKarvonenZones } from '../services/healthKit';
import { getWeeklyDisciplinePlan } from '../services/localModel';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun for display

export default function PlanSettingsScreen({ navigation }) {
  const { athleteProfile, getTrainingPhase, getDaysToRace, resetTrainingPlan } = useApp();

  const phase = getTrainingPhase();
  const daysToRace = getDaysToRace();

  const hrProfile = athleteProfile?.hrProfile || null;
  const [resetMessage, setResetMessage] = useState('');

  // Derive a quick zone summary for the card (Karvonen if HR data exists)
  const zoneSummary = useMemo(() => {
    if (!hrProfile?.maxHR || !hrProfile?.restingHR) return null;
    return buildKarvonenZones(hrProfile.maxHR, hrProfile.restingHR);
  }, [hrProfile]);

  const weekPlan = useMemo(() => {
    if (!athleteProfile) return Array(7).fill('rest');
    return getWeeklyDisciplinePlan(phase, athleteProfile);
  }, [phase, athleteProfile]);

  function confirmResetPlan() {
    Alert.alert(
      'Reset Training Plan',
      'This will clear your cached workouts and regenerate your plan. Your profile is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: handleResetPlan,
        },
      ]
    );
  }

  async function handleResetPlan() {
    await resetTrainingPlan();
    setResetMessage('Plan reset');
    navigation.goBack();
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Plan Settings</Text>
      </View>

      {/* HR Zones summary card → navigates to full HR Zones screen */}
      <TouchableOpacity
        style={styles.linkCard}
        onPress={() => navigation.navigate('HRZones')}
        activeOpacity={0.75}
      >
        <View style={styles.linkCardLeft}>
          <Text style={styles.cardTitle}>HEART RATE ZONES & FTP</Text>
          {hrProfile?.maxHR ? (
            <>
              <Text style={styles.linkCardValue}>Max HR: {hrProfile.maxHR} bpm</Text>
              {hrProfile.restingHR && (
                <Text style={styles.linkCardSub}>
                  Resting HR: {hrProfile.restingHR} bpm · HRR:{' '}
                  {hrProfile.maxHR - hrProfile.restingHR} bpm
                </Text>
              )}
              {zoneSummary && (
                <Text style={styles.linkCardSub}>
                  Z2 {zoneSummary.zones[1].min}–{zoneSummary.zones[1].max} bpm · Z4{' '}
                  {zoneSummary.zones[3].min}–{zoneSummary.zones[3].max} bpm
                </Text>
              )}
              {hrProfile.ftp && <Text style={styles.linkCardSub}>FTP: {hrProfile.ftp} W</Text>}
            </>
          ) : (
            <Text style={styles.linkCardEmpty}>Tap to configure Max HR, FTP & training zones</Text>
          )}
        </View>
        <Text style={styles.linkCardArrow}>›</Text>
      </TouchableOpacity>

      {/* Training Plan Details Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>TRAINING PLAN DETAILS</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Phase</Text>
          <Text style={styles.detailValue}>{phase}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Weeks to race</Text>
          <Text style={styles.detailValue}>
            {daysToRace != null ? Math.ceil(daysToRace / 7) : 'N/A'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Days to race</Text>
          <Text style={styles.detailValue}>{daysToRace ?? 'N/A'}</Text>
        </View>

        <Text style={styles.weekPlanTitle}>{"This Week's Discipline Plan"}</Text>
        {WEEK_DISPLAY_ORDER.map((dayIdx) => (
          <View key={dayIdx} style={styles.weekPlanRow}>
            <Text style={styles.weekPlanDay}>{DAY_NAMES[dayIdx]}</Text>
            <Text style={styles.weekPlanDiscipline}>
              {(weekPlan[dayIdx] || 'rest').charAt(0).toUpperCase() +
                (weekPlan[dayIdx] || 'rest').slice(1)}
            </Text>
          </View>
        ))}
      </View>

      {/* Premium Cloud Backup — Phase 2 Placeholder */}
      <View style={styles.premiumCard}>
        <View style={styles.premiumHeader}>
          <Text style={styles.premiumTitle}>☁ CLOUD BACKUP</Text>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>COMING SOON</Text>
          </View>
        </View>
        <Text style={styles.premiumDescription}>
          Back up your training data, restore to a new device, and unlock advanced AI coaching
          powered by your full 90-day history.
        </Text>
      </View>

      {/* Reset Training Plan — Danger Zone */}
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>RESET TRAINING PLAN</Text>
        <Text style={styles.dangerDescription}>
          Clears cached workouts and regenerates your plan. Your profile and settings are preserved.
        </Text>
        {resetMessage !== '' && <Text style={styles.resetMessage}>{resetMessage}</Text>}
        <TouchableOpacity style={styles.dangerButton} onPress={confirmResetPlan}>
          <Text style={styles.dangerButtonText}>RESET TRAINING PLAN</Text>
        </TouchableOpacity>
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
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    color: '#e8ff47',
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  linkCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  linkCardLeft: {
    flex: 1,
  },
  linkCardValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  linkCardSub: {
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
  },
  linkCardEmpty: {
    color: '#555',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
  linkCardArrow: {
    color: '#e8ff47',
    fontSize: 28,
    fontWeight: '300',
    marginLeft: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  detailLabel: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  weekPlanTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  weekPlanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  weekPlanDay: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  weekPlanDiscipline: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ff6b6b33',
  },
  dangerTitle: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  dangerDescription: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  resetMessage: {
    color: '#47ffb2',
    fontSize: 13,
    marginBottom: 8,
  },
  dangerButton: {
    borderWidth: 2,
    borderColor: '#ff6b6b',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  premiumCard: {
    backgroundColor: '#16162a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e8ff4744',
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  premiumTitle: {
    color: '#e8ff47',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  comingSoonBadge: {
    backgroundColor: '#e8ff4722',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    color: '#e8ff47',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  premiumDescription: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
});
