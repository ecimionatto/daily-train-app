import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import {
  generateWorkoutLocally,
  generateAlternativeWorkout,
  analyzeRecentWorkouts,
  getWeeklyDisciplinePlan,
} from '../services/localModel';

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
    alternativeWorkout,
    saveAlternativeWorkout,
    recentScore,
    overallReadiness,
    swapTodayWorkout,
    completedWorkouts,
    loadCompletedWorkouts,
    todayWorkoutStatus,
    todayMatchedWorkout,
    trends,
    tomorrowWorkout,
    tomorrowAlternatives,
    tomorrowAlternativeIndex,
    generatingTomorrow,
    generateAndSaveTomorrow,
    rotateTomorrowWorkout,
  } = useApp();

  const { messages } = useChat();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAltDetails, setShowAltDetails] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);

  const daysToRace = getDaysToRace();
  const phase = getTrainingPhase();
  const displayScore = overallReadiness?.overall ?? readinessScore;

  useEffect(() => {
    if (!todayWorkout && healthData && athleteProfile) {
      fetchWorkout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthData, athleteProfile]);

  useEffect(() => {
    if (recentScore && recentScore.length > 0) {
      analyzeRecentWorkouts(recentScore, healthData)
        .then((insight) => {
          if (insight) setAiInsight(insight);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentScore]);

  async function fetchWorkout() {
    setLoading(true);
    try {
      const todayDay = new Date().getDay();
      const weekPlan = getWeeklyDisciplinePlan(phase, athleteProfile);
      const targetDiscipline = weekPlan[todayDay];
      const params = {
        profile: athleteProfile,
        healthData,
        readinessScore,
        phase,
        daysToRace,
        completedWorkouts,
        trends,
        targetDiscipline,
      };
      let workout = await generateWorkoutLocally(params);
      if (targetDiscipline && workout.discipline !== targetDiscipline) {
        workout = { ...workout, discipline: targetDiscipline };
      }
      await saveTodayWorkout(workout);

      if (workout.discipline !== 'rest' || (readinessScore || 65) >= 55) {
        const alt = await generateAlternativeWorkout({
          ...params,
          excludeDiscipline: workout.discipline,
        });
        if (alt) saveAlternativeWorkout(alt);
      }
    } catch (e) {
      console.warn('Failed to generate workout:', e);
    }
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadHealthData(), loadCompletedWorkouts()]);
    setRefreshing(false);
  }

  async function syncWorkouts() {
    setRefreshing(true);
    await loadCompletedWorkouts();
    setRefreshing(false);
  }

  function handleGenerateTomorrow() {
    if (todayWorkoutStatus !== 'completed') {
      Alert.alert(
        "Today's session isn't done yet",
        "Generating tomorrow's workout now may affect your training plan. Continue?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Generate', onPress: generateAndSaveTomorrow },
        ]
      );
    } else {
      generateAndSaveTomorrow();
    }
  }

  async function handleSwitchWorkout() {
    if (!alternativeWorkout) return;
    const oldMain = todayWorkout;
    await swapTodayWorkout(alternativeWorkout);
    saveAlternativeWorkout(oldMain);
    setShowAltDetails(false);
  }

  function getLatestCoachNote() {
    if (!messages || messages.length === 0) return null;
    const proactive = [...messages]
      .reverse()
      .find((m) => m.metadata?.proactive || m.metadata?.weeklyReview);
    if (proactive) return proactive.content;
    const lastCoach = [...messages].reverse().find((m) => m.role === 'coach');
    return lastCoach?.content || null;
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e8ff47" />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>DailyTrain</Text>
        <Text style={styles.phaseLabel}>{phaseLabels[phase] || phase}</Text>
      </View>

      {/* Race Countdown */}
      {daysToRace !== null && (
        <View style={styles.countdownCard}>
          <Text style={styles.countdownNumber}>{daysToRace}</Text>
          <Text style={styles.countdownLabel}>DAYS TO RACE</Text>
        </View>
      )}

      {/* Overall Readiness Score */}
      {displayScore !== null && (
        <View style={styles.readinessCard}>
          <View style={styles.readinessRow}>
            <Text style={[styles.readinessScore, { color: getReadinessColor(displayScore) }]}>
              {displayScore}
            </Text>
            <View style={styles.readinessInfo}>
              <Text style={styles.readinessTitle}>OVERALL READINESS</Text>
              <Text style={[styles.readinessLabel, { color: getReadinessColor(displayScore) }]}>
                {getReadinessLabel(displayScore)}
              </Text>
            </View>
          </View>

          {/* Sub-scores */}
          {overallReadiness && (
            <View style={styles.subScoreRow}>
              <SubScore label="HEALTH" value={overallReadiness.health} />
              <SubScore label="TRAINING" value={overallReadiness.compliance} />
              <SubScore label="RACE PREP" value={overallReadiness.racePrep} />
            </View>
          )}

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{healthData?.restingHR ?? '--'}</Text>
              <Text style={styles.metricLabel}>RHR</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{healthData?.hrv ?? '--'}</Text>
              <Text style={styles.metricLabel}>HRV</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{healthData?.sleepHours?.toFixed(1) ?? '--'}</Text>
              <Text style={styles.metricLabel}>SLEEP</Text>
            </View>
          </View>
        </View>
      )}

      {/* Previous Sessions (last 3 days + today) */}
      {recentScore && recentScore.length > 0 && (
        <View style={styles.yesterdayCard}>
          <Text style={styles.sectionTitle}>PREVIOUS SESSIONS</Text>
          {recentScore.map((day, di) => (
            <View key={di} style={di > 0 ? styles.dayDivider : null}>
              <Text style={styles.dayLabel}>{day.dateLabel.toUpperCase()}</Text>
              {day.prescribedDiscipline && (
                <Text style={styles.prescribedText}>
                  Prescribed: {day.prescribedDiscipline.charAt(0).toUpperCase()}
                  {day.prescribedDiscipline.slice(1)} {day.prescribedDuration}min
                </Text>
              )}
              <View style={styles.yesterdayRow}>
                <Text
                  style={[styles.yesterdayScore, { color: getScoreColor(day.completionScore) }]}
                >
                  {day.completionScore}%
                </Text>
                <View style={styles.yesterdayInfo}>
                  <Text style={styles.yesterdayLabel}>{day.feedback?.label}</Text>
                  {day.workouts.map((w, i) => (
                    <Text key={i} style={styles.yesterdayDetail}>
                      {w?.title} — {w?.discipline} · {w?.duration}min
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          ))}
          {aiInsight && <Text style={styles.aiInsightText}>💡 {aiInsight}</Text>}
        </View>
      )}

      {/* Coach Note */}
      {renderCoachNote(getLatestCoachNote(), navigation)}

      {/* Today's Workout - Full Details */}
      <View style={styles.workoutCard}>
        <View style={styles.todayHeader}>
          <Text style={styles.sectionTitle}>{"TODAY'S SESSION"}</Text>
          {todayWorkoutStatus === 'completed' && <Text style={styles.completedBadge}>✓ DONE</Text>}
          {todayWorkoutStatus === 'partial' && <Text style={styles.partialBadge}>IN PROGRESS</Text>}
        </View>
        {loading ? (
          <Text style={styles.loadingText}>Generating your workout...</Text>
        ) : todayWorkout ? (
          <>
            <Text style={styles.workoutTitle}>{todayWorkout.title}</Text>
            <View style={styles.workoutMeta}>
              <Text style={styles.workoutDiscipline}>{todayWorkout.discipline?.toUpperCase()}</Text>
              <Text style={styles.workoutDuration}>{todayWorkout.duration} min</Text>
              <Text style={styles.workoutIntensity}>{todayWorkout.intensity?.toUpperCase()}</Text>
            </View>
            <Text style={styles.workoutDescription}>{todayWorkout.summary}</Text>

            {/* Show actual stats when completed */}
            {todayMatchedWorkout && todayWorkoutStatus !== 'pending' && (
              <View style={styles.actualStatsRow}>
                <Text style={styles.actualStatsLabel}>Actual:</Text>
                <Text style={styles.actualStatsValue}>
                  {todayMatchedWorkout.durationMinutes}min
                  {todayMatchedWorkout.calories ? ` · ${todayMatchedWorkout.calories} cal` : ''}
                  {todayMatchedWorkout.avgHeartRate
                    ? ` · ${todayMatchedWorkout.avgHeartRate} bpm`
                    : ''}
                </Text>
              </View>
            )}

            {/* Inline sections/sets */}
            {renderWorkoutSections(todayWorkout)}

            <TouchableOpacity
              style={[
                styles.startButton,
                todayWorkoutStatus === 'completed' && styles.completedButton,
              ]}
              onPress={() => navigation.navigate('Workout')}
            >
              <Text style={styles.startButtonText}>
                {todayWorkoutStatus === 'completed' ? '✓ COMPLETED' : 'VIEW WORKOUT'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.generateButton} onPress={fetchWorkout}>
            <Text style={styles.generateButtonText}>GENERATE WORKOUT</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Nutrition Tips */}
      {todayWorkout && <NutritionTipCard workout={todayWorkout} />}

      {/* Tomorrow's Session */}
      <View style={styles.tomorrowCard}>
        <Text style={styles.sectionTitle}>{"TOMORROW'S SESSION"}</Text>
        {tomorrowWorkout ? (
          <>
            <Text style={styles.workoutTitle}>{tomorrowWorkout.title}</Text>
            <View style={styles.workoutMeta}>
              <Text style={styles.workoutDiscipline}>
                {tomorrowWorkout.discipline?.toUpperCase()}
              </Text>
              <Text style={styles.workoutDuration}>{tomorrowWorkout.duration} min</Text>
              <Text style={styles.workoutIntensity}>
                {tomorrowWorkout.intensity?.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.workoutDescription}>{tomorrowWorkout.summary}</Text>
            {tomorrowAlternatives.length > 1 && (
              <TouchableOpacity style={styles.rotateButton} onPress={rotateTomorrowWorkout}>
                <Text style={styles.rotateButtonText}>
                  ↺ ROTATE ({tomorrowAlternativeIndex + 1}/{tomorrowAlternatives.length})
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={handleGenerateTomorrow}
            disabled={generatingTomorrow}
          >
            <Text style={styles.generateButtonText}>
              {generatingTomorrow ? 'GENERATING...' : 'GENERATE TOMORROW'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Alternative Workout */}
      {alternativeWorkout && todayWorkout && (
        <View style={styles.altCard}>
          <Text style={styles.sectionTitle}>ALTERNATIVE OPTION</Text>
          <Text style={styles.altTitle}>{alternativeWorkout.title}</Text>
          <View style={styles.workoutMeta}>
            <Text style={styles.altDiscipline}>{alternativeWorkout.discipline?.toUpperCase()}</Text>
            <Text style={styles.altDuration}>{alternativeWorkout.duration} min</Text>
          </View>
          <Text style={styles.altSummary}>{alternativeWorkout.summary}</Text>

          {showAltDetails && renderWorkoutSections(alternativeWorkout)}

          <View style={styles.altButtons}>
            <TouchableOpacity style={styles.switchButton} onPress={handleSwitchWorkout}>
              <Text style={styles.switchButtonText}>SWITCH TO THIS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={() => setShowAltDetails(!showAltDetails)}
            >
              <Text style={styles.detailsButtonText}>
                {showAltDetails ? 'HIDE DETAILS' : 'VIEW DETAILS'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Recent Apple Health Activity */}
      <View style={styles.recentActivityCard}>
        <View style={styles.recentActivityHeader}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>RECENT ACTIVITY</Text>
          <TouchableOpacity onPress={syncWorkouts} disabled={refreshing}>
            <Text style={[styles.syncButton, refreshing && styles.syncButtonDisabled]}>
              {refreshing ? 'SYNCING...' : 'SYNC'}
            </Text>
          </TouchableOpacity>
        </View>
        {completedWorkouts && completedWorkouts.length > 0 ? (
          completedWorkouts
            .slice(-3)
            .reverse()
            .map((w, i) => (
              <View key={i} style={styles.recentActivityRow}>
                <View
                  style={[
                    styles.recentActivityDot,
                    { backgroundColor: getDisciplineColor(w.discipline) },
                  ]}
                />
                <View style={styles.recentActivityInfo}>
                  <Text style={styles.recentActivityTitle}>
                    {w.discipline?.charAt(0).toUpperCase()}
                    {w.discipline?.slice(1)}
                  </Text>
                  <Text style={styles.recentActivityMeta}>
                    {w.durationMinutes}min
                    {w.avgHeartRate ? ` · ${w.avgHeartRate} bpm` : ''}
                    {w.avgPace ? ` · ${formatPace(w.avgPace)}` : ''}
                    {' · '}
                    {new Date(w.startDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
              </View>
            ))
        ) : (
          <Text style={styles.noActivityText}>
            Pull down or tap SYNC to load workouts from Apple Health
          </Text>
        )}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function SubScore({ label, value }) {
  return (
    <View style={styles.subScoreItem}>
      <Text style={[styles.subScoreValue, { color: getReadinessColor(value) }]}>{value}</Text>
      <Text style={styles.subScoreLabel}>{label}</Text>
    </View>
  );
}

function renderCoachNote(note, navigation) {
  if (!note) return null;
  const truncated = note.length > 200 ? note.substring(0, 200) + '...' : note;
  return (
    <TouchableOpacity style={styles.coachNoteCard} onPress={() => navigation.navigate('Coach')}>
      <Text style={styles.sectionTitle}>{"COACH'S NOTE"}</Text>
      <Text style={styles.coachNoteText}>{truncated}</Text>
      <Text style={styles.coachNoteTap}>Tap to chat with coach</Text>
    </TouchableOpacity>
  );
}

function renderWorkoutSections(workout) {
  if (!workout?.sections) return null;
  return workout.sections.map((section, sIdx) => (
    <View key={sIdx} style={styles.inlineSection}>
      <Text style={styles.inlineSectionTitle}>{section.name?.toUpperCase()}</Text>
      {section.notes && <Text style={styles.inlineSectionNotes}>{section.notes}</Text>}
      {section.sets?.map((set, setIdx) => (
        <View key={setIdx} style={styles.inlineSet}>
          <Text style={styles.inlineSetDesc}>{set.description}</Text>
          {set.zone && <Text style={styles.inlineSetZone}>Zone {set.zone}</Text>}
        </View>
      ))}
    </View>
  ));
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

function getScoreColor(score) {
  if (score >= 75) return '#47ffb2';
  if (score >= 50) return '#e8ff47';
  return '#ff6b6b';
}

function getDisciplineColor(discipline) {
  const colors = {
    swim: '#47b2ff',
    bike: '#e8ff47',
    run: '#47ffb2',
    brick: '#ff9f43',
    walk: '#8bc34a',
    hike: '#8bc34a',
    strength: '#ff6b6b',
    rest: '#333',
  };
  return colors[discipline] || '#888';
}

function formatPace(avgPaceMinPerKm) {
  if (!avgPaceMinPerKm || !isFinite(avgPaceMinPerKm)) return '';
  const mins = Math.floor(avgPaceMinPerKm);
  const secs = Math.round((avgPaceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')} /km`;
}

function getNutritionTip(workout) {
  if (!workout || workout.discipline === 'rest') return null;
  const duration = workout.duration || 0;
  const discipline = workout.discipline;
  const intensity = workout.intensity;

  if (discipline === 'brick' || duration >= 120) {
    return {
      pre: 'Eat a carb-rich meal 2-3 hrs before. Target 60-90g carbs/hr during the session. Carry gels or chews for the run leg.',
      during: 'Hydrate every 15-20 min on the bike. Take a gel 10 min before T2 to fuel the run.',
      post: 'Recover within 30 min: 3:1 carb-to-protein ratio. Chocolate milk, rice + chicken, or a recovery shake.',
    };
  }
  if (duration >= 75) {
    return {
      pre: 'Eat a light carb-focused meal 90 min before: oats, banana, or toast with honey.',
      during:
        discipline === 'swim'
          ? 'Sip water before and after. Electrolytes if >75 min in the pool.'
          : 'Sip electrolytes every 20 min. A gel at the 60-min mark if needed.',
      post: 'Refuel within 45 min: protein + carbs. Greek yoghurt with fruit, or eggs on toast.',
    };
  }
  if (intensity === 'hard') {
    return {
      pre: 'Have a small carb snack 60-90 min before: banana, dates, or a slice of toast.',
      during: 'Water is enough for sessions under 60 min. Electrolytes if you sweat heavily.',
      post: 'Priority recovery meal within 30 min: 20-30g protein + 40-60g carbs.',
    };
  }
  // Easy/short session
  return {
    pre: 'Stay hydrated. A light snack is fine if training within 1 hr of eating.',
    during: 'Water only for short easy sessions.',
    post: 'Normal balanced meal. No need to rush — your next meal will cover recovery.',
  };
}

function NutritionTipCard({ workout }) {
  const tip = getNutritionTip(workout);
  if (!tip) return null;
  return (
    <View style={styles.nutritionCard}>
      <Text style={styles.nutritionTitle}>NUTRITION</Text>
      <View style={styles.nutritionRow}>
        <Text style={styles.nutritionLabel}>PRE</Text>
        <Text style={styles.nutritionText}>{tip.pre}</Text>
      </View>
      <View style={styles.nutritionDivider} />
      <View style={styles.nutritionRow}>
        <Text style={styles.nutritionLabel}>DURING</Text>
        <Text style={styles.nutritionText}>{tip.during}</Text>
      </View>
      <View style={styles.nutritionDivider} />
      <View style={styles.nutritionRow}>
        <Text style={styles.nutritionLabel}>POST</Text>
        <Text style={styles.nutritionText}>{tip.post}</Text>
      </View>
    </View>
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
  subScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  subScoreItem: {
    alignItems: 'center',
  },
  subScoreValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  subScoreLabel: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 4,
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
  yesterdayCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  dayLabel: {
    color: '#e8ff47',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 2,
  },
  dayDivider: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  aiInsightText: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  tomorrowCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#47b8ff',
  },
  rotateButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#47b8ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  rotateButtonText: {
    color: '#47b8ff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  yesterdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  yesterdayScore: {
    fontSize: 32,
    fontWeight: '900',
    marginRight: 16,
  },
  yesterdayInfo: {
    flex: 1,
  },
  yesterdayLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  yesterdayDetail: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  coachNoteCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#e8ff47',
  },
  coachNoteText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
    marginTop: 8,
  },
  coachNoteTap: {
    color: '#e8ff47',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  workoutCard: {
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
    marginBottom: 8,
  },
  workoutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  workoutDiscipline: {
    color: '#47b2ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  workoutDuration: {
    color: '#888',
    fontSize: 14,
  },
  workoutIntensity: {
    color: '#e8ff47',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  workoutDescription: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  inlineSection: {
    marginBottom: 16,
  },
  inlineSectionTitle: {
    color: '#e8ff47',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  inlineSectionNotes: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  inlineSet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#12121f',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 6,
  },
  inlineSetDesc: {
    color: '#ddd',
    fontSize: 14,
    flex: 1,
  },
  inlineSetZone: {
    color: '#47b2ff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  startButton: {
    backgroundColor: '#e8ff47',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
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
  altCard: {
    backgroundColor: '#151520',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  altTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  altDiscipline: {
    color: '#47b2ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  altDuration: {
    color: '#888',
    fontSize: 14,
  },
  altSummary: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 12,
  },
  altButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  switchButton: {
    flex: 1,
    backgroundColor: '#e8ff47',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  switchButtonText: {
    color: '#0a0a0f',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  detailsButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e8ff47',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  detailsButtonText: {
    color: '#e8ff47',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  recentActivityCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  recentActivityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  syncButton: {
    color: '#e8ff47',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  syncButtonDisabled: {
    color: '#666',
  },
  noActivityText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  recentActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentActivityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  recentActivityInfo: {
    flex: 1,
  },
  recentActivityTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  recentActivityMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  prescribedText: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  todayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  completedBadge: {
    color: '#47ffb2',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  partialBadge: {
    color: '#e8ff47',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  completedButton: {
    backgroundColor: '#1a4a2e',
    borderColor: '#47ffb2',
    borderWidth: 1,
  },
  actualStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#0d2b1a',
    borderRadius: 8,
  },
  actualStatsLabel: {
    color: '#47ffb2',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
  },
  actualStatsValue: {
    color: '#ccc',
    fontSize: 12,
  },
  nutritionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#47ffb2',
  },
  nutritionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 14,
  },
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  nutritionLabel: {
    color: '#47ffb2',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    width: 52,
    marginTop: 1,
  },
  nutritionText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  nutritionDivider: {
    height: 1,
    backgroundColor: '#2a2a3e',
    marginBottom: 10,
  },
});
