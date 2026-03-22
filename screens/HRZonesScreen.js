import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useApp } from '../context/AppContext';
import {
  buildKarvonenZones,
  fetchMaxWorkoutHeartRate,
  fetchHealthData,
} from '../services/healthKit';

// Zone colour palette — consistent across all screens
const ZONE_COLORS = {
  1: '#47b2ff',
  2: '#47ffb2',
  3: '#e8ff47',
  4: '#ff9f43',
  5: '#ff6b6b',
};

// % of Max HR at each zone boundary (Karvonen / HRR method)
const ZONE_INTENSITY = {
  1: { min: 50, max: 60, purpose: 'Active recovery · very easy aerobic' },
  2: { min: 60, max: 70, purpose: '80/20 base · fat burning · all-day pace' },
  3: { min: 70, max: 80, purpose: 'Aerobic threshold · marathon/IM race pace' },
  4: { min: 80, max: 90, purpose: 'Lactate threshold · hard intervals' },
  5: { min: 90, max: 100, purpose: 'VO₂ max · max effort sprints' },
};

function sourceLabel(source) {
  if (source === 'workout_history') return '↺ Computed from 6 months of workouts';
  if (source === 'manual') return '✎ Manually entered';
  return 'Not yet set';
}

export default function HRZonesScreen({ navigation, route }) {
  // When opened as a tab there is no stack parent to go back to
  const isTab = route?.name === 'HRZonesTab';
  const { athleteProfile, saveProfile } = useApp();

  const stored = athleteProfile?.hrProfile || {};

  const [maxHR, setMaxHR] = useState(stored.maxHR ? String(stored.maxHR) : '');
  const [restingHR, setRestingHR] = useState(stored.restingHR ? String(stored.restingHR) : '');
  const [ftp, setFtp] = useState(stored.ftp ? String(stored.ftp) : '');
  const [source, setSource] = useState(stored.source || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Derive Karvonen zones from current field values (or stored values)
  const maxHRNum = parseInt(maxHR, 10) || null;
  const restingHRNum = parseInt(restingHR, 10) || null;
  const zones = buildKarvonenZones(maxHRNum, restingHRNum);

  async function handleRefresh() {
    setIsRefreshing(true);
    setSaveMsg('');
    try {
      const [detectedMax, healthDataFresh] = await Promise.all([
        fetchMaxWorkoutHeartRate(180),
        fetchHealthData(),
      ]);
      const detectedResting = healthDataFresh?.restingHR || null;

      if (detectedMax) setMaxHR(String(detectedMax));
      if (detectedResting) setRestingHR(String(detectedResting));

      if (detectedMax || detectedResting) {
        setSource('workout_history');
        setSaveMsg('Values refreshed from HealthKit · tap Save to keep them.');
      } else {
        setSaveMsg('No HR data found in HealthKit — enter values manually.');
      }
    } catch {
      setSaveMsg('Could not read HealthKit — enter values manually.');
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSave() {
    const max = parseInt(maxHR, 10);
    const resting = parseInt(restingHR, 10);
    const ftpNum = ftp ? parseInt(ftp, 10) : null;

    if (max && resting && max <= resting) {
      Alert.alert('Invalid values', 'Max HR must be greater than Resting HR.');
      return;
    }

    const hrProfile = {
      ...stored,
      maxHR: max || stored.maxHR || null,
      restingHR: resting || stored.restingHR || null,
      ftp: ftpNum || stored.ftp || null,
      source: source || (max ? 'manual' : stored.source),
      computedAt: new Date().toISOString(),
    };

    await saveProfile({ ...athleteProfile, hrProfile });
    setSaveMsg('Saved ✓');
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        {!isTab && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Heart Rate Zones</Text>
        <Text style={styles.subtitle}>Configure your training zones and FTP</Text>
      </View>

      {/* ── MAX HEART RATE ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>MAX HEART RATE</Text>
        <Text style={styles.cardDesc}>
          The highest heart rate you can sustain for a short burst. Used as the ceiling for all zone
          calculations.
        </Text>

        <View style={styles.row}>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Max HR (bpm)</Text>
            <TextInput
              style={styles.input}
              value={maxHR}
              onChangeText={(v) => {
                setMaxHR(v);
                setSource('manual');
                setSaveMsg('');
              }}
              keyboardType="number-pad"
              placeholder="e.g. 185"
              placeholderTextColor="#555"
              maxLength={3}
            />
          </View>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Resting HR (bpm)</Text>
            <TextInput
              style={styles.input}
              value={restingHR}
              onChangeText={(v) => {
                setRestingHR(v);
                setSource('manual');
                setSaveMsg('');
              }}
              keyboardType="number-pad"
              placeholder="e.g. 52"
              placeholderTextColor="#555"
              maxLength={3}
            />
          </View>
        </View>

        <View style={styles.sourceRow}>
          <Text style={styles.sourceText}>{sourceLabel(source)}</Text>
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#47ffb2" />
          ) : (
            <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnText}>↺ Refresh from workouts</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.hintText}>
          Formula fallback: 220 − age (age {athleteProfile?.age || '?'} →{' '}
          {220 - (athleteProfile?.age || 0)} bpm). Actual max from workouts is more accurate.
        </Text>
      </View>

      {/* ── FTP ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>FTP — FUNCTIONAL THRESHOLD POWER</Text>
        <Text style={styles.cardDesc}>
          The average power (watts) you can sustain for 60 minutes on the bike. Used to set cycling
          power zones alongside HR zones. Perform a 20-min all-out effort and multiply by 0.95 to
          estimate FTP.
        </Text>
        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>FTP (watts)</Text>
          <TextInput
            style={[styles.input, styles.inputWide]}
            value={ftp}
            onChangeText={(v) => {
              setFtp(v);
              setSaveMsg('');
            }}
            keyboardType="number-pad"
            placeholder="e.g. 220"
            placeholderTextColor="#555"
            maxLength={4}
          />
        </View>
        <Text style={styles.hintText}>
          Beginner: 100-150 W · Intermediate: 150-250 W · Advanced: 250-350 W · Elite: 350+ W
        </Text>
      </View>

      {/* ── ZONES TABLE ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>YOUR TRAINING ZONES</Text>
        {zones ? (
          <>
            <Text style={styles.zonesCaption}>
              Karvonen · Max HR {zones.maxHR} bpm · Resting HR {zones.restingHR} bpm · HRR{' '}
              {zones.hrr} bpm
            </Text>
            {zones.zones.map((z) => {
              const info = ZONE_INTENSITY[z.zone];
              const widthPct = (info.max - info.min) / 50; // 50 = total range 50-100
              return (
                <View key={z.zone} style={styles.zoneRow}>
                  <View style={[styles.zoneBadge, { backgroundColor: ZONE_COLORS[z.zone] }]}>
                    <Text style={styles.zoneBadgeText}>Z{z.zone}</Text>
                  </View>
                  <View style={styles.zoneDetails}>
                    <View style={styles.zoneTopRow}>
                      <Text style={styles.zoneLabel}>{z.label}</Text>
                      <Text style={styles.zoneRange}>
                        {z.min}–{z.max} bpm
                      </Text>
                    </View>
                    {/* Visual bar proportional to zone width */}
                    <View style={styles.zoneBarBg}>
                      <View
                        style={[
                          styles.zoneBar,
                          {
                            backgroundColor: ZONE_COLORS[z.zone],
                            flex: widthPct,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.zonePurpose}>{info.purpose}</Text>
                    {ftp && z.zone <= 5 && (
                      <Text style={styles.zoneFtp}>
                        Power: {Math.round(parseInt(ftp) * (info.min / 100))}–
                        {Math.round(parseInt(ftp) * (info.max / 100))} W
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <View style={styles.zonesEmpty}>
            <Text style={styles.zonesEmptyText}>
              Enter Max HR and Resting HR above to see your personalised zones.
            </Text>
          </View>
        )}
      </View>

      {/* ── HOW IT'S CALCULATED ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>HOW ZONES ARE CALCULATED</Text>

        <Text style={styles.explainHeading}>Karvonen Method (Heart Rate Reserve)</Text>
        <Text style={styles.explainText}>
          The Karvonen method uses your Heart Rate Reserve (HRR) — the difference between your max
          and resting heart rate — to set zones relative to your fitness level, not just your age.
        </Text>

        <View style={styles.formulaBox}>
          <Text style={styles.formulaLine}>HRR = Max HR − Resting HR</Text>
          <Text style={styles.formulaLine}>Target HR = (HRR × intensity %) + Resting HR</Text>
          {zones && (
            <Text style={styles.formulaExample}>
              {`Example (Z2): (${zones.hrr} × 60%) + ${zones.restingHR} = ${zones.zones[1].min} bpm`}
            </Text>
          )}
        </View>

        <Text style={styles.explainHeading}>Zone Boundaries</Text>
        {Object.entries(ZONE_INTENSITY).map(([zone, info]) => (
          <View key={zone} style={styles.boundaryRow}>
            <View style={[styles.zoneDot, { backgroundColor: ZONE_COLORS[zone] }]} />
            <Text style={styles.boundaryText}>
              Z{zone} · {info.min}–{info.max}% HRR · {info.purpose}
            </Text>
          </View>
        ))}

        <Text style={styles.explainHeading}>The 80/20 Rule (Polarised Training)</Text>
        <Text style={styles.explainText}>
          Elite Ironman athletes spend ~80% of training time in Z1-Z2 (easy aerobic) and only ~20%
          in Z4-Z5 (hard). Z3 is the &quot;grey zone&quot; — too hard to recover from, too easy to
          produce adaptations. Most athletes overtrain in Z3 without realising it.
        </Text>

        <Text style={styles.explainHeading}>FTP and Cycling Power</Text>
        <Text style={styles.explainText}>
          FTP (Functional Threshold Power) is the gold standard for cycling intensity. Power zones
          mirror HR zones but respond instantly — HR lags effort by 30-60 seconds. Use power for
          intervals, HR for pacing on long rides.
        </Text>

        <Text style={styles.explainHeading}>Why Max HR from Workouts?</Text>
        <Text style={styles.explainText}>
          The formula 220 − age underestimates max HR by 10-20 bpm in trained athletes. DailyTrain
          scans your last 6 months of Apple Watch workouts and finds the highest recorded heart rate
          — a far more accurate ceiling for zone calculation.
        </Text>
      </View>

      {/* Save button */}
      {saveMsg !== '' && <Text style={styles.saveMsg}>{saveMsg}</Text>}
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>SAVE ZONES & FTP</Text>
      </TouchableOpacity>

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
  backText: {
    color: '#e8ff47',
    fontSize: 16,
    fontWeight: '700',
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
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  cardDesc: {
    color: '#bbb',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  inputWrap: {
    flex: 1,
  },
  inputWide: {
    maxWidth: 160,
  },
  inputLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0a0a0f',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  sourceText: {
    color: '#47ffb2',
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
  },
  refreshBtn: {
    paddingLeft: 10,
  },
  refreshBtnText: {
    color: '#47ffb2',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  hintText: {
    color: '#555',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  zonesCaption: {
    color: '#888',
    fontSize: 11,
    marginBottom: 16,
    lineHeight: 16,
  },
  zonesEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  zonesEmptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  zoneBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  zoneBadgeText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
  },
  zoneDetails: {
    flex: 1,
  },
  zoneTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  zoneLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  zoneRange: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  zoneBarBg: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0f',
    borderRadius: 4,
    height: 6,
    marginBottom: 6,
    overflow: 'hidden',
  },
  zoneBar: {
    height: 6,
    borderRadius: 4,
  },
  zonePurpose: {
    color: '#888',
    fontSize: 11,
    lineHeight: 15,
  },
  zoneFtp: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  explainHeading: {
    color: '#e8ff47',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
  },
  explainText: {
    color: '#999',
    fontSize: 13,
    lineHeight: 20,
  },
  formulaBox: {
    backgroundColor: '#0a0a0f',
    borderRadius: 10,
    padding: 14,
    marginVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#e8ff47',
  },
  formulaLine: {
    color: '#e8ff47',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Courier',
    marginBottom: 4,
  },
  formulaExample: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'Courier',
    marginTop: 4,
  },
  boundaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    marginTop: 4,
  },
  zoneDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
    marginTop: 3,
  },
  boundaryText: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  saveMsg: {
    color: '#47ffb2',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: '#e8ff47',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonText: {
    color: '#0a0a0f',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
