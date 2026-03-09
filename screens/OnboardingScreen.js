import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../context/AppContext';
import {
  EXPERIENCE_OPTIONS,
  getGoalTimesForDistance,
  getDistanceOptions,
} from '../services/raceConfig';

function buildQuestions(raceType, distance) {
  const questions = [
    {
      key: 'raceType',
      question: 'What type of race are you training for?',
      options: ['Triathlon', 'Running'],
    },
    {
      key: 'distance',
      question: 'What distance?',
      options: raceType ? getDistanceOptions(raceType) : ['Select race type first'],
    },
    {
      key: 'weeklyHours',
      question: 'How many hours per week can you train?',
      options: ['5-7', '8-10', '11-14', '15+'],
    },
  ];

  if (raceType === 'triathlon') {
    questions.push(
      {
        key: 'strongestDiscipline',
        question: "What's your strongest discipline?",
        options: ['Swim', 'Bike', 'Run', 'All equal'],
      },
      {
        key: 'weakestDiscipline',
        question: "What's your weakest discipline?",
        options: ['Swim', 'Bike', 'Run', 'All equal'],
      },
      {
        key: 'swimBackground',
        question: 'Swimming background?',
        options: ['Competitive', 'Comfortable', 'Learning', 'Survival mode'],
      }
    );
  }

  const expQ = EXPERIENCE_OPTIONS[raceType] || EXPERIENCE_OPTIONS.triathlon;
  questions.push(
    { key: expQ.key, question: expQ.question, options: expQ.options },
    {
      key: 'injuries',
      question: 'Any current injury concerns?',
      options: ['None', 'Knee', 'Shoulder', 'Back', 'Other'],
    },
    {
      key: 'goalTime',
      question: "What's your target finish time?",
      options: distance ? getGoalTimesForDistance(distance) : ['Just finish'],
    }
  );

  return questions;
}

export default function OnboardingScreen({ onComplete }) {
  const { saveProfile } = useApp();
  const [step, setStep] = useState(0);
  const [raceDate, setRaceDate] = useState(new Date());
  const [answers, setAnswers] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios');

  const raceType = answers.raceType?.toLowerCase() || null;
  const selectedDistance = answers.distance || null;

  const questions = useMemo(
    () => buildQuestions(raceType, selectedDistance),
    [raceType, selectedDistance]
  );

  const totalSteps = 1 + questions.length;

  function handleDateChange(event, date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setRaceDate(date);
  }

  function selectOption(key, value) {
    const updated = { ...answers, [key]: value };

    if (key === 'raceType') {
      delete updated.distance;
      delete updated.strongestDiscipline;
      delete updated.weakestDiscipline;
      delete updated.swimBackground;
      delete updated.goalTime;
    }

    setAnswers(updated);

    if (step < questions.length) {
      setStep(step + 1);
    } else {
      finishOnboarding(updated);
    }
  }

  async function finishOnboarding(finalAnswers) {
    const rt = finalAnswers.raceType?.toLowerCase() || 'triathlon';
    const profile = {
      raceDate: raceDate.toISOString(),
      distance: finalAnswers.distance || 'Full Ironman (140.6)',
      level: 'Intermediate',
      ...finalAnswers,
      raceType: rt,
      createdAt: new Date().toISOString(),
    };

    if (rt === 'running') {
      profile.strongestDiscipline = profile.strongestDiscipline || 'Run';
      profile.weakestDiscipline = profile.weakestDiscipline || 'Run';
      profile.swimBackground = profile.swimBackground || 'N/A';
    }

    await saveProfile(profile);
    onComplete();
  }

  function handleDateNext() {
    setStep(1);
  }

  // Date picker step
  if (step === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.stepLabel}>STEP 1 OF {totalSteps}</Text>
        <Text style={styles.title}>When is your race?</Text>
        <Text style={styles.subtitle}>
          {"We'll build your periodized plan backwards from race day."}
        </Text>

        {Platform.OS === 'android' && !showDatePicker && (
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateButtonText}>
              {raceDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </TouchableOpacity>
        )}

        {showDatePicker && (
          <DateTimePicker
            value={raceDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={handleDateChange}
            themeVariant="dark"
            style={styles.datePicker}
          />
        )}

        <TouchableOpacity style={styles.nextButton} onPress={handleDateNext}>
          <Text style={styles.nextButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Question steps
  const q = questions[step - 1];

  return (
    <View style={styles.container}>
      <Text style={styles.stepLabel}>
        STEP {step + 1} OF {totalSteps}
      </Text>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((step + 1) / totalSteps) * 100}%` }]} />
      </View>

      <Text style={styles.title}>{q.question}</Text>

      <ScrollView style={styles.optionsContainer}>
        {q.options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.optionButton, answers[q.key] === option && styles.optionSelected]}
            onPress={() => selectOption(q.key, option)}
          >
            <Text
              style={[styles.optionText, answers[q.key] === option && styles.optionTextSelected]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {step > 0 && (
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(step - 1)}>
          <Text style={styles.backButtonText}>BACK</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  stepLabel: {
    color: '#e8ff47',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#1a1a2e',
    borderRadius: 2,
    marginBottom: 40,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e8ff47',
    borderRadius: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 16,
    marginBottom: 32,
    lineHeight: 22,
  },
  datePicker: {
    marginVertical: 20,
  },
  dateButton: {
    backgroundColor: '#1a1a2e',
    padding: 20,
    borderRadius: 12,
    marginVertical: 20,
  },
  dateButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  nextButton: {
    backgroundColor: '#e8ff47',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  nextButtonText: {
    color: '#0a0a0f',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  optionsContainer: {
    marginTop: 24,
  },
  optionButton: {
    backgroundColor: '#1a1a2e',
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#e8ff47',
    backgroundColor: '#1a1a1f',
  },
  optionText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#e8ff47',
  },
  backButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  backButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
