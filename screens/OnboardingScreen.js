import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../context/AppContext';

const QUESTIONS = [
  {
    key: 'weeklyHours',
    question: 'How many hours per week can you train?',
    options: ['5-7', '8-10', '11-14', '15+'],
  },
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
  },
  {
    key: 'previousIronman',
    question: 'Previous Ironman experience?',
    options: ['First timer', '1-2 races', '3-5 races', '6+'],
  },
  {
    key: 'injuries',
    question: 'Any current injury concerns?',
    options: ['None', 'Knee', 'Shoulder', 'Back', 'Other'],
  },
  {
    key: 'goalTime',
    question: "What's your target finish time?",
    options: ['Sub 10h', '10-12h', '12-14h', '14-16h', 'Just finish'],
  },
];

export default function OnboardingScreen({ onComplete }) {
  const { saveProfile } = useApp();
  const [step, setStep] = useState(0); // 0 = date, 1-7 = questions
  const [raceDate, setRaceDate] = useState(new Date());
  const [answers, setAnswers] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios');

  function handleDateChange(event, date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setRaceDate(date);
  }

  function selectOption(key, value) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (step < QUESTIONS.length) {
      setStep(step + 1);
    } else {
      finishOnboarding({ ...answers, [key]: value });
    }
  }

  async function finishOnboarding(finalAnswers) {
    const profile = {
      raceDate: raceDate.toISOString(),
      distance: 'Full Ironman',
      level: 'Intermediate',
      ...finalAnswers,
      createdAt: new Date().toISOString(),
    };
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
        <Text style={styles.stepLabel}>STEP 1 OF {QUESTIONS.length + 1}</Text>
        <Text style={styles.title}>When is your race?</Text>
        <Text style={styles.subtitle}>
          We'll build your periodized plan backwards from race day.
        </Text>

        {Platform.OS === 'android' && !showDatePicker && (
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
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
  const q = QUESTIONS[step - 1];

  return (
    <View style={styles.container}>
      <Text style={styles.stepLabel}>
        STEP {step + 1} OF {QUESTIONS.length + 1}
      </Text>

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${((step + 1) / (QUESTIONS.length + 1)) * 100}%` },
          ]}
        />
      </View>

      <Text style={styles.title}>{q.question}</Text>

      <ScrollView style={styles.optionsContainer}>
        {q.options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.optionButton,
              answers[q.key] === option && styles.optionSelected,
            ]}
            onPress={() => selectOption(q.key, option)}
          >
            <Text
              style={[
                styles.optionText,
                answers[q.key] === option && styles.optionTextSelected,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {step > 0 && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setStep(step - 1)}
        >
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
