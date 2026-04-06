import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../context/AppContext';
import { buildKarvonenZones } from '../services/healthKit';
import { getDistanceOptions } from '../services/raceConfig';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun

const DISCIPLINE_DISPLAY = {
  'swim+bike': 'Swim + Bike',
  'swim+run': 'Swim + Run',
  brick: 'Bike + Run',
};

function formatDiscipline(d) {
  return DISCIPLINE_DISPLAY[d] || (d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Rest');
}

export default function PlanSettingsScreen({ navigation, route: _route }) {
  const {
    athleteProfile,
    phase,
    daysToRace,
    weekPlan,
    weeklyTargets,
    weeklyConsistency,
    resetTrainingPlan,
    resetToOnboarding,
    saveProfile,
  } = useApp();
  const hrProfile = athleteProfile?.hrProfile || null;

  // Editable race config state — seeded from current profile
  const [raceDate, setRaceDate] = useState(
    athleteProfile?.raceDate ? new Date(athleteProfile.raceDate) : new Date()
  );
  const [distance, setDistance] = useState(athleteProfile?.distance || '');
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios');
  const [saving, setSaving] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [weekendPref, setWeekendPref] = useState(
    athleteProfile?.schedulePreferences?.weekendPreference || 'bike-sat-run-sun'
  );
  const [swimDaysPref, setSwimDaysPref] = useState(
    athleteProfile?.schedulePreferences?.swimDays || 'mwf'
  );

  const distanceOptions = useMemo(() => getDistanceOptions('triathlon'), []);

  function handleDateChange(_event, date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setRaceDate(date);
  }

  const zoneSummary = useMemo(() => {
    if (!hrProfile?.maxHR || !hrProfile?.restingHR) return null;
    return buildKarvonenZones(hrProfile.maxHR, hrProfile.restingHR);
  }, [hrProfile]);

  const hasChanges =
    raceDate.toISOString().slice(0, 10) !== (athleteProfile?.raceDate || '').slice(0, 10) ||
    distance !== (athleteProfile?.distance || '') ||
    weekendPref !==
      (athleteProfile?.schedulePreferences?.weekendPreference || 'bike-sat-run-sun') ||
    swimDaysPref !== (athleteProfile?.schedulePreferences?.swimDays || 'mwf');

  async function applyProfileChanges() {
    const updated = {
      ...athleteProfile,
      raceDate: raceDate.toISOString(),
      raceType: 'triathlon',
      distance: distance || athleteProfile?.distance,
      schedulePreferences: {
        ...(athleteProfile?.schedulePreferences || {}),
        weekendPreference: weekendPref,
        swimDays: swimDaysPref,
      },
    };
    await saveProfile(updated);
  }

  async function handleResetPlan() {
    setSaving(true);
    try {
      // Clear cache BEFORE saving profile so the athleteProfile useEffect's
      // loadCachedWorkout() call finds nothing in AsyncStorage.
      await resetTrainingPlan();
      await applyProfileChanges();
      setResetMessage('Plan reset with new configuration');
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  function handleStartOver() {
    Alert.alert(
      'Start Over?',
      'This will erase your profile, workouts, and chat history. You will go through setup again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Over',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await resetToOnboarding();
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  async function handleSaveOnly() {
    setSaving(true);
    try {
      await applyProfileChanges();
      setResetMessage('Configuration saved');
    } finally {
      setSaving(false);
    }
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

      {/* Race Configuration — editable */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>RACE CONFIGURATION</Text>

        {/* Race Date */}
        <Text style={styles.fieldLabel}>Race Date</Text>
        {Platform.OS === 'android' && !showDatePicker && (
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateButtonText}>{raceDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
        {showDatePicker && (
          <DateTimePicker
            value={raceDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            minimumDate={new Date()}
            onChange={handleDateChange}
            style={styles.datePicker}
            textColor="#ffffff"
            themeVariant="dark"
          />
        )}

        {/* Distance */}
        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Distance</Text>
        <View style={styles.optionGrid}>
          {distanceOptions.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.optionBtn, distance === opt && styles.optionBtnActive]}
              onPress={() => setDistance(opt)}
            >
              <Text style={[styles.optionBtnText, distance === opt && styles.optionBtnTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Save changes without resetting */}
        {hasChanges && (
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveOnly} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? 'SAVING…' : 'SAVE CHANGES'}</Text>
          </TouchableOpacity>
        )}
        {resetMessage !== '' && <Text style={styles.resetMessage}>{resetMessage}</Text>}
      </View>

      {/* Schedule Preferences */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>SCHEDULE PREFERENCES</Text>

        <Text style={styles.fieldLabel}>Weekend Long Sessions</Text>
        <View style={styles.optionGrid}>
          {[
            { label: 'Bike Sat / Run Sun', value: 'bike-sat-run-sun' },
            { label: 'Run Sat / Bike Sun', value: 'run-sat-bike-sun' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionBtn, weekendPref === opt.value && styles.optionBtnActive]}
              onPress={() => setWeekendPref(opt.value)}
            >
              <Text
                style={[
                  styles.optionBtnText,
                  weekendPref === opt.value && styles.optionBtnTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Preferred Swim Days</Text>
        <View style={styles.optionGrid}>
          {[
            { label: 'Mon / Wed / Fri', value: 'mwf' },
            { label: 'Tue / Thu / Sat', value: 'tts' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionBtn, swimDaysPref === opt.value && styles.optionBtnActive]}
              onPress={() => setSwimDaysPref(opt.value)}
            >
              <Text
                style={[
                  styles.optionBtnText,
                  swimDaysPref === opt.value && styles.optionBtnTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {hasChanges && (
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveOnly} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? 'SAVING…' : 'SAVE CHANGES'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* HR Zones link card */}
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

      {/* Training Plan Details (read-only) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>TRAINING PLAN DETAILS</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Phase</Text>
          <Text style={styles.detailValue}>{phase}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Volume tier</Text>
          <Text style={styles.detailValue}>{athleteProfile?.weeklyHours || '8-10'} hrs/week</Text>
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

        {/* Weekly Targets */}
        <Text style={styles.weekPlanTitle}>Weekly Session Targets</Text>
        {weeklyTargets?.targets &&
          Object.entries(weeklyTargets.targets).map(([disc, target]) => {
            const consistency = weeklyConsistency?.byDiscipline?.[disc];
            return (
              <View key={disc} style={styles.weekPlanRow}>
                <Text style={styles.weekPlanDay}>
                  {disc.charAt(0).toUpperCase() + disc.slice(1)}
                </Text>
                <Text style={styles.weekPlanDiscipline}>
                  {consistency ? `${consistency.completed}/` : ''}
                  {target.count}x · {target.totalMinutes}min
                </Text>
              </View>
            );
          })}

        {/* Weekly Consistency */}
        {weeklyConsistency && (
          <View style={styles.consistencyRow}>
            <Text style={styles.detailLabel}>Consistency</Text>
            <Text
              style={[
                styles.detailValue,
                {
                  color:
                    weeklyConsistency.percentage >= 85
                      ? '#47ffb2'
                      : weeklyConsistency.percentage >= 70
                        ? '#e8ff47'
                        : '#ff6b6b',
                },
              ]}
            >
              {weeklyConsistency.percentage}%
            </Text>
          </View>
        )}

        {/* Suggested Schedule (soft reference) */}
        <Text style={styles.weekPlanTitle}>Suggested Schedule</Text>
        {WEEK_DISPLAY_ORDER.map((dayIdx) => (
          <View key={dayIdx} style={styles.weekPlanRow}>
            <Text style={styles.weekPlanDay}>{DAY_NAMES[dayIdx]}</Text>
            <Text style={[styles.weekPlanDiscipline, { color: '#888' }]}>
              {formatDiscipline(weekPlan[dayIdx])}
            </Text>
          </View>
        ))}
      </View>

      {/* Premium placeholder */}
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

      {/* Reset Training Plan — saves config changes first */}
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>RESET TRAINING PLAN</Text>
        <Text style={styles.dangerDescription}>
          Saves your race configuration above, clears cached workouts, and regenerates your plan
          from scratch.
        </Text>
        <TouchableOpacity
          style={[styles.dangerButton, saving && styles.dangerButtonDisabled]}
          onPress={handleResetPlan}
          disabled={saving}
        >
          <Text style={styles.dangerButtonText}>{saving ? 'RESETTING…' : 'SAVE & RESET PLAN'}</Text>
        </TouchableOpacity>
      </View>

      {/* Start Over — clears everything and returns to onboarding */}
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>START OVER</Text>
        <Text style={styles.dangerDescription}>
          Clears your profile, workouts, and chat history. You will be taken back to setup as if
          this were your first time using the app.
        </Text>
        <TouchableOpacity
          style={[styles.startOverButton, saving && styles.dangerButtonDisabled]}
          onPress={handleStartOver}
          disabled={saving}
        >
          <Text style={styles.dangerButtonText}>{saving ? 'RESETTING…' : 'START OVER'}</Text>
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
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 8,
  },
  datePicker: {
    marginLeft: -8,
    marginBottom: 4,
  },
  dateButton: {
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  dateButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  optionBtnActive: {
    backgroundColor: '#e8ff4722',
    borderColor: '#e8ff47',
  },
  optionBtnText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  optionBtnTextActive: {
    color: '#e8ff47',
  },
  saveButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#47ffb2',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#47ffb2',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  resetMessage: {
    color: '#47ffb2',
    fontSize: 13,
    marginTop: 10,
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
  consistencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
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
  dangerButton: {
    borderWidth: 2,
    borderColor: '#ff6b6b',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  startOverButton: {
    backgroundColor: '#ff6b6b',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  dangerButtonDisabled: {
    opacity: 0.5,
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
