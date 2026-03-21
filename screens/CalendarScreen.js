import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { getWeeklyDisciplinePlan, generateWorkoutLocally } from '../services/localModel';

const DISCIPLINE_COLORS = {
  swim: '#47b2ff',
  bike: '#e8ff47',
  run: '#47ffb2',
  brick: '#ff9f43',
  strength: '#ff6b6b',
  rest: '#333',
};

const PHASE_LABELS = {
  BASE: 'Base',
  BUILD: 'Build',
  PEAK: 'Peak',
  TAPER: 'Taper',
  RACE_WEEK: 'Race Week',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getPhaseForDate(date, raceDate) {
  const race = new Date(raceDate);
  const weeksOut = Math.ceil((race - date) / (7 * 24 * 60 * 60 * 1000));
  if (weeksOut < 2) return 'RACE_WEEK';
  if (weeksOut < 6) return 'TAPER';
  if (weeksOut < 12) return 'PEAK';
  if (weeksOut < 20) return 'BUILD';
  return 'BASE';
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getDisciplineColor(discipline) {
  return DISCIPLINE_COLORS[discipline] || '#888';
}

export default function CalendarScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { athleteProfile, completedWorkouts, healthData, readinessScore, trends } = useApp();
  const [selectedDay, setSelectedDay] = useState(null);
  const [generatedWorkout, setGeneratedWorkout] = useState(null);
  const [generating, setGenerating] = useState(false);

  const raceDate = athleteProfile?.raceDate;

  const calendarData = useMemo(() => {
    if (!raceDate) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const race = new Date(raceDate);
    race.setHours(23, 59, 59, 999);

    const days = [];
    const current = new Date(today);

    while (current <= race) {
      const date = new Date(current);
      const phase = getPhaseForDate(date, raceDate);
      const plan = getWeeklyDisciplinePlan(phase, athleteProfile);
      const dayOfWeek = date.getDay();
      const discipline = plan[dayOfWeek];
      const isToday = isSameDay(date, today);
      const isPast = date < today && !isToday;

      const completed = completedWorkouts?.find((w) => {
        const wDate = new Date(w.startDate);
        return isSameDay(wDate, date);
      });

      days.push({
        date,
        dateKey: date.toISOString().split('T')[0],
        dayOfWeek,
        discipline,
        phase,
        isToday,
        isPast,
        isRaceDay: isSameDay(date, new Date(raceDate)),
        completed: completed || null,
      });

      current.setDate(current.getDate() + 1);
    }

    // Group by month
    const sections = [];
    let currentMonth = null;

    days.forEach((day) => {
      const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
      if (monthKey !== currentMonth) {
        currentMonth = monthKey;
        sections.push({
          title: `${MONTH_NAMES[day.date.getMonth()]} ${day.date.getFullYear()}`,
          phase: day.phase,
          data: [],
        });
      }
      sections[sections.length - 1].data.push(day);
    });

    return sections;
  }, [raceDate, athleteProfile, completedWorkouts]);

  const handleDayPress = useCallback(
    async (day) => {
      if (day.isToday) {
        navigation.navigate('Workout');
        return;
      }

      setSelectedDay(day);
      setGeneratedWorkout(null);

      if (!day.isPast && !day.isRaceDay) {
        setGenerating(true);
        try {
          const daysToRace = Math.ceil((new Date(raceDate) - day.date) / (24 * 60 * 60 * 1000));
          const workout = await generateWorkoutLocally({
            profile: athleteProfile,
            healthData,
            readinessScore: readinessScore ?? 70,
            phase: day.phase,
            daysToRace,
            completedWorkouts,
            targetDate: day.date,
            targetDiscipline: day.discipline,
            trends,
          });
          setGeneratedWorkout(workout);
        } catch {
          setGeneratedWorkout(null);
        } finally {
          setGenerating(false);
        }
      }
    },
    [athleteProfile, healthData, readinessScore, completedWorkouts, raceDate, navigation, trends]
  );

  const renderDayCard = useCallback(
    ({ item: day }) => {
      const color = getDisciplineColor(day.discipline);
      const dateNum = day.date.getDate();
      const dayName = DAY_NAMES[day.dayOfWeek];

      return (
        <TouchableOpacity
          style={[
            styles.dayCard,
            day.isToday && styles.dayCardToday,
            day.isRaceDay && styles.dayCardRace,
            day.isPast && styles.dayCardPast,
          ]}
          onPress={() => handleDayPress(day)}
          activeOpacity={0.7}
        >
          <View style={styles.dayDateCol}>
            <Text style={[styles.dayNum, day.isToday && styles.dayNumToday]}>{dateNum}</Text>
            <Text style={[styles.dayName, day.isToday && styles.dayNameToday]}>{dayName}</Text>
          </View>

          <View style={styles.dayInfoCol}>
            {day.isRaceDay ? (
              <View style={styles.raceLabel}>
                <Text style={styles.raceLabelText}>RACE DAY</Text>
              </View>
            ) : (
              <>
                <View style={styles.disciplineRow}>
                  <View style={[styles.disciplineDot, { backgroundColor: color }]} />
                  <Text style={styles.disciplineText}>
                    {day.discipline === 'brick'
                      ? 'Bike + Run'
                      : day.discipline.charAt(0).toUpperCase() + day.discipline.slice(1)}
                  </Text>
                  {day.discipline === 'brick' && (
                    <View style={styles.brickBadge}>
                      <Text style={styles.brickBadgeText}>BRICK</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.phaseText}>{PHASE_LABELS[day.phase]}</Text>
              </>
            )}
          </View>

          <View style={styles.dayStatusCol}>
            {day.completed ? (
              <View style={styles.completedBadge}>
                <Text style={styles.completedIcon}>✓</Text>
                <Text style={styles.completedDuration}>
                  {formatDuration(day.completed.durationMinutes)}
                </Text>
              </View>
            ) : day.isToday ? (
              <Text style={styles.todayLabel}>TODAY</Text>
            ) : day.isPast && !day.completed ? (
              <Text style={styles.missedLabel}>—</Text>
            ) : (
              <Text style={styles.chevron}>›</Text>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [handleDayPress]
  );

  const renderSectionHeader = useCallback(({ section }) => {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionPhase}>{PHASE_LABELS[section.phase]}</Text>
      </View>
    );
  }, []);

  if (!athleteProfile?.raceDate) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>Set a race date to see your training plan.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Training Plan</Text>
        <Text style={styles.headerSubtitle}>
          {calendarData.reduce((sum, s) => sum + s.data.length, 0)} days to race
        </Text>
      </View>

      <SectionList
        sections={calendarData}
        keyExtractor={(item) => item.dateKey}
        renderItem={renderDayCard}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />

      <WorkoutDetailModal
        day={selectedDay}
        workout={generatedWorkout}
        generating={generating}
        onClose={() => {
          setSelectedDay(null);
          setGeneratedWorkout(null);
        }}
      />
    </View>
  );
}

function WorkoutDetailModal({ day, workout, generating, onClose }) {
  if (!day) return null;

  const color = getDisciplineColor(day.discipline);
  const dateStr = `${DAY_NAMES[day.dayOfWeek]}, ${MONTH_NAMES[day.date.getMonth()]} ${day.date.getDate()}`;

  return (
    <Modal visible={!!day} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalDate}>{dateStr}</Text>
              <View style={styles.disciplineRow}>
                <View style={[styles.disciplineDot, { backgroundColor: color }]} />
                <Text style={styles.modalDiscipline}>
                  {day.discipline === 'brick'
                    ? 'Bike + Run (Brick)'
                    : day.discipline.charAt(0).toUpperCase() + day.discipline.slice(1)}
                </Text>
                <Text style={styles.modalPhase}> · {PHASE_LABELS[day.phase]}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {day.isRaceDay ? (
              <RaceDayContent />
            ) : day.completed ? (
              <CompletedContent completed={day.completed} />
            ) : generating ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#e8ff47" size="large" />
                <Text style={styles.loadingText}>Generating workout...</Text>
              </View>
            ) : workout ? (
              <WorkoutContent workout={workout} />
            ) : day.isPast ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>No workout recorded for this day.</Text>
              </View>
            ) : (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#e8ff47" size="large" />
                <Text style={styles.loadingText}>Loading workout...</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CompletedContent({ completed }) {
  return (
    <View>
      <View style={styles.completedHeader}>
        <Text style={styles.completedTitle}>Completed Workout</Text>
      </View>
      <View style={styles.statsRow}>
        <StatItem label="Duration" value={formatDuration(completed.durationMinutes)} />
        {completed.calories ? (
          <StatItem label="Calories" value={`${Math.round(completed.calories)}`} />
        ) : null}
        {completed.distanceMeters ? (
          <StatItem label="Distance" value={`${(completed.distanceMeters / 1000).toFixed(1)} km`} />
        ) : null}
      </View>
      <Text style={styles.sourceText}>Source: {completed.source || 'Apple Health'}</Text>
    </View>
  );
}

function WorkoutContent({ workout }) {
  return (
    <View>
      <Text style={styles.workoutTitle}>{workout.title}</Text>
      <Text style={styles.workoutSummary}>{workout.summary}</Text>
      <View style={styles.workoutMeta}>
        <Text style={styles.metaChip}>{formatDuration(workout.duration)}</Text>
        <Text style={styles.metaChip}>{workout.intensity}</Text>
      </View>
      {workout.sections?.map((section, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.sectionName}>{section.name}</Text>
          {section.notes ? <Text style={styles.sectionNotes}>{section.notes}</Text> : null}
          {section.sets?.map((set, j) => (
            <View key={j} style={styles.setRow}>
              <Text style={styles.setText}>{set.description}</Text>
              {set.zone ? <Text style={styles.zoneChip}>Z{set.zone}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function RaceDayContent() {
  return (
    <View style={styles.restContainer}>
      <Text style={styles.restIcon}>🏁</Text>
      <Text style={styles.restTitle}>Race Day</Text>
      <Text style={styles.restText}>
        This is what you have been training for. Trust your preparation, execute your plan, and
        enjoy every moment.
      </Text>
    </View>
  );
}

function StatItem({ label, value }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
    paddingHorizontal: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#0a0a0f',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  sectionPhase: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e8ff47',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
  },
  dayCardToday: {
    borderWidth: 1,
    borderColor: '#e8ff47',
  },
  dayCardRace: {
    borderWidth: 1,
    borderColor: '#ff6b6b',
    backgroundColor: '#1a1020',
  },
  dayCardPast: {
    opacity: 0.6,
  },
  dayDateCol: {
    width: 44,
    alignItems: 'center',
  },
  dayNum: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  dayNumToday: {
    color: '#e8ff47',
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    marginTop: 2,
  },
  dayNameToday: {
    color: '#e8ff47',
  },
  dayInfoCol: {
    flex: 1,
    paddingHorizontal: 12,
  },
  disciplineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  disciplineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  disciplineText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  phaseText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 2,
  },
  raceLabel: {
    backgroundColor: '#ff6b6b22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  raceLabelText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ff6b6b',
    letterSpacing: 1,
  },
  dayStatusCol: {
    width: 60,
    alignItems: 'flex-end',
  },
  completedBadge: {
    alignItems: 'flex-end',
  },
  completedIcon: {
    fontSize: 16,
    fontWeight: '800',
    color: '#47ffb2',
  },
  completedDuration: {
    fontSize: 11,
    fontWeight: '600',
    color: '#47ffb2',
    marginTop: 2,
  },
  todayLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#e8ff47',
    letterSpacing: 1,
  },
  missedLabel: {
    fontSize: 16,
    color: '#555',
  },
  chevron: {
    fontSize: 22,
    color: '#555',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12121f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  modalDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  modalDiscipline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalPhase: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '700',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
  },

  // Completed
  completedHeader: {
    marginBottom: 16,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#47ffb2',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
  },
  sourceText: {
    fontSize: 12,
    color: '#555',
    marginTop: 8,
  },

  // Workout detail
  workoutTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  workoutSummary: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 12,
  },
  workoutMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  metaChip: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e8ff47',
    backgroundColor: '#e8ff4722',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  section: {
    marginBottom: 16,
  },
  sectionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e8ff47',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionNotes: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  setText: {
    fontSize: 13,
    color: '#fff',
    flex: 1,
  },
  zoneChip: {
    fontSize: 11,
    fontWeight: '700',
    color: '#47b2ff',
    marginLeft: 8,
  },

  // Rest / Race
  restContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  restIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  restTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  restText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  brickBadge: {
    backgroundColor: '#ff9f4322',
    borderWidth: 1,
    borderColor: '#ff9f43',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  brickBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ff9f43',
    letterSpacing: 1,
  },
});
