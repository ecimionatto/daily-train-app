import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCoachResponse,
  buildConversationSummary,
  buildModelNotReadyMessage,
  generateProactiveGreeting,
  generateWeeklyReview,
  extractAthleteInsights,
} from '../services/chatService';
import { ModelNotReadyError, ContextFullError } from '../services/localModel';
import { useApp } from './AppContext';

const ChatContext = createContext();

const STORAGE_KEY = 'chatConversation';
const MAX_STORED_MESSAGES = 200;

export function useChat() {
  return useContext(ChatContext);
}

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [isResponding, setIsResponding] = useState(false);
  const [hasGreetedToday, setHasGreetedToday] = useState(false);
  const [hasReviewedThisWeek, setHasReviewedThisWeek] = useState(false);

  const {
    athleteProfile,
    healthData,
    readinessScore,
    getTrainingPhase,
    getDaysToRace,
    todayWorkout,
    recentScore,
    overallReadiness,
    workoutHistory,
    swapTodayWorkout,
    completedWorkouts,
    saveProfile,
    clearTodayWorkout,
    trends,
  } = useApp();

  /**
   * Profile update callback for the coach.
   * Saves the updated profile AND clears today's cached workout so DashboardScreen
   * regenerates a fresh workout based on the new plan/race date.
   */
  const onProfileUpdate = useCallback(
    async (profile) => {
      await saveProfile(profile);
      await clearTodayWorkout();
    },
    [saveProfile, clearTodayWorkout]
  );

  useEffect(() => {
    migrateStaleGreetings()
      .then(() => migrateNamedGreetings())
      .then(() => {
        loadConversation();
        checkGreetingStatus();
        checkWeeklyReviewStatus();
      });
  }, []);

  // Proactive greeting trigger
  useEffect(() => {
    if (todayWorkout && !hasGreetedToday && athleteProfile) {
      sendProactiveGreeting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayWorkout, hasGreetedToday, athleteProfile]);

  // Weekly review trigger (Sunday evening)
  useEffect(() => {
    if (!hasReviewedThisWeek && workoutHistory.length > 0 && athleteProfile) {
      checkAndSendWeeklyReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasReviewedThisWeek, workoutHistory, athleteProfile]);

  async function migrateStaleGreetings() {
    const MIGRATION_KEY = 'chatMigration_v1_clearFabricatedGreetings';
    try {
      const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrated) return;

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const msgs = JSON.parse(stored);
        const cleaned = msgs.filter((msg) => {
          if (!msg.metadata?.proactive) return true;
          // Remove proactive greetings that contain percentage claims (fabricated stats)
          return !/\d+%/.test(msg.content);
        });
        if (cleaned.length !== msgs.length) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
          // Reset greeting date so a fresh one is generated
          await AsyncStorage.removeItem('lastGreetingDate');
          // eslint-disable-next-line no-console
          console.log(
            `[Chat] Migrated: removed ${msgs.length - cleaned.length} stale proactive greetings`
          );
        }
      }
      await AsyncStorage.setItem(MIGRATION_KEY, 'done');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Chat] Migration failed:', e.message || e);
    }
  }

  async function migrateNamedGreetings() {
    const MIGRATION_KEY = 'chatMigration_v2_removeNamedGreetings';
    try {
      const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrated) return;

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const msgs = JSON.parse(stored);
        // Remove proactive greetings that address the athlete by name (e.g. "Hi Alex", "Hey Alex")
        const cleaned = msgs.filter((msg) => {
          if (!msg.metadata?.proactive) return true;
          return !/\b(hi|hey|hello|good morning|morning|great job|well done),?\s+[A-Z][a-z]+\b/i.test(
            msg.content
          );
        });
        if (cleaned.length !== msgs.length) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
          await AsyncStorage.removeItem('lastGreetingDate');
          // eslint-disable-next-line no-console
          console.log(
            `[Chat] v2 Migrated: removed ${msgs.length - cleaned.length} named proactive greetings`
          );
        }
      }
      await AsyncStorage.setItem(MIGRATION_KEY, 'done');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Chat] v2 migration failed:', e.message || e);
    }
  }

  async function loadConversation() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) setMessages(JSON.parse(stored));
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
  }

  async function persistMessages(msgs) {
    try {
      const toStore = msgs.slice(-MAX_STORED_MESSAGES);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  }

  async function checkGreetingStatus() {
    try {
      const lastGreeted = await AsyncStorage.getItem('lastGreetingDate');
      const today = new Date().toDateString();
      if (lastGreeted === today) {
        setHasGreetedToday(true);
      }
    } catch (e) {
      console.warn('Failed to check greeting status:', e);
    }
  }

  async function checkWeeklyReviewStatus() {
    try {
      const lastReview = await AsyncStorage.getItem('lastWeeklyReviewDate');
      if (lastReview) {
        const reviewDate = new Date(lastReview);
        const now = new Date();
        const daysSince = Math.floor((now - reviewDate) / (24 * 60 * 60 * 1000));
        if (daysSince < 7) {
          setHasReviewedThisWeek(true);
        }
      }
    } catch (e) {
      console.warn('Failed to check weekly review status:', e);
    }
  }

  async function sendProactiveGreeting() {
    const lastGreeted = await AsyncStorage.getItem('lastGreetingDate');
    const today = new Date().toDateString();
    if (lastGreeted === today) {
      setHasGreetedToday(true);
      return;
    }

    try {
      const context = buildFullContext();
      const greeting = await generateProactiveGreeting(context);

      const greetingMessage = {
        id: `msg_${Date.now()}_proactive`,
        role: 'coach',
        content: greeting,
        timestamp: new Date().toISOString(),
        metadata: { proactive: true, phase: getTrainingPhase(), readinessScore },
      };

      setMessages((prev) => {
        const updated = [...prev, greetingMessage];
        persistMessages(updated);
        return updated;
      });
      await AsyncStorage.setItem('lastGreetingDate', today);
      setHasGreetedToday(true);
    } catch (e) {
      if (e instanceof ModelNotReadyError) {
        // Model still loading — don't mark as greeted so it retries when ready
      } else {
        console.warn('Failed to send proactive greeting:', e);
        setHasGreetedToday(true);
      }
    }
  }

  async function checkAndSendWeeklyReview() {
    const now = new Date();
    if (now.getDay() !== 0 || now.getHours() < 18) return;

    const lastReview = await AsyncStorage.getItem('lastWeeklyReviewDate');
    if (lastReview) {
      const daysSince = Math.floor((now - new Date(lastReview)) / (24 * 60 * 60 * 1000));
      if (daysSince < 7) {
        setHasReviewedThisWeek(true);
        return;
      }
    }

    try {
      const context = buildFullContext();
      const review = await generateWeeklyReview(context);

      const reviewMessage = {
        id: `msg_${Date.now()}_weekly_review`,
        role: 'coach',
        content: review,
        timestamp: new Date().toISOString(),
        metadata: { weeklyReview: true, phase: getTrainingPhase(), readinessScore },
      };

      setMessages((prev) => {
        const updated = [...prev, reviewMessage];
        persistMessages(updated);
        return updated;
      });
      await AsyncStorage.setItem('lastWeeklyReviewDate', now.toISOString());
      setHasReviewedThisWeek(true);
    } catch (e) {
      console.warn('Failed to send weekly review:', e);
      setHasReviewedThisWeek(true);
    }
  }

  function buildFullContext() {
    const phase = getTrainingPhase();
    const daysToRace = getDaysToRace();
    return {
      athleteProfile,
      healthData,
      readinessScore,
      phase,
      daysToRace,
      todayWorkout,
      recentScore,
      overallReadiness,
      workoutHistory: (completedWorkouts?.length ? completedWorkouts : workoutHistory || []).slice(
        -14
      ),
      conversationSummary: buildConversationSummary(messages),
      trends,
      onWorkoutSwap: swapTodayWorkout,
      onProfileUpdate: onProfileUpdate,
    };
  }

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isResponding) return;

      const phase = getTrainingPhase();
      const daysToRace = getDaysToRace();

      const athleteMessage = {
        id: `msg_${Date.now()}_athlete`,
        role: 'athlete',
        content: text.trim(),
        timestamp: new Date().toISOString(),
        metadata: { phase, readinessScore },
      };

      const updatedMessages = [...messages, athleteMessage];
      setMessages(updatedMessages);
      setIsResponding(true);

      try {
        const context = {
          athleteProfile,
          healthData,
          readinessScore,
          phase,
          daysToRace,
          todayWorkout,
          recentScore,
          overallReadiness,
          workoutHistory: (completedWorkouts?.length
            ? completedWorkouts
            : workoutHistory || []
          ).slice(-14),
          conversationSummary: buildConversationSummary(updatedMessages),
          onWorkoutSwap: swapTodayWorkout,
          onProfileUpdate: onProfileUpdate,
        };
        const responseText = await getCoachResponse(text.trim(), context, updatedMessages);

        const coachMessage = {
          id: `msg_${Date.now()}_coach`,
          role: 'coach',
          content: responseText,
          timestamp: new Date().toISOString(),
          metadata: { phase, readinessScore },
        };

        const finalMessages = [...updatedMessages, coachMessage];
        setMessages(finalMessages);
        await persistMessages(finalMessages);

        // Extract and persist athlete insights for workout adaptability
        // Pass existing insights so active load adjustments carry forward across messages
        const insights = extractAthleteInsights(finalMessages, athleteProfile?.athleteInsights);
        if (insights && saveProfile && athleteProfile) {
          const currentInsights = athleteProfile.athleteInsights;
          const insightsChanged =
            !currentInsights || JSON.stringify(currentInsights) !== JSON.stringify(insights);
          if (insightsChanged) {
            await saveProfile({ ...athleteProfile, athleteInsights: insights });
          }
        }
      } catch (e) {
        let errorContent;
        if (e instanceof ModelNotReadyError) {
          errorContent = buildModelNotReadyMessage();
        } else if (e instanceof ContextFullError) {
          errorContent =
            'Your message is too long for my context window right now. Try asking a shorter question, or clear the chat history to free up space.';
        } else {
          errorContent =
            "I'm having trouble processing your question right now. Please try again in a moment.";
        }
        console.warn('Coach response error:', e.message || e);
        const errorMessage = {
          id: `msg_${Date.now()}_error`,
          role: 'coach',
          content: errorContent,
          timestamp: new Date().toISOString(),
        };
        const finalMessages = [...updatedMessages, errorMessage];
        setMessages(finalMessages);
        await persistMessages(finalMessages);
      }

      setIsResponding(false);
    },
    [
      messages,
      isResponding,
      athleteProfile,
      healthData,
      readinessScore,
      todayWorkout,
      recentScore,
      overallReadiness,
      workoutHistory,
      completedWorkouts,
      swapTodayWorkout,
      saveProfile,
      onProfileUpdate,
      getTrainingPhase,
      getDaysToRace,
    ]
  );

  async function clearConversation() {
    setMessages([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear chat history:', e);
    }
  }

  const value = {
    messages,
    isResponding,
    sendMessage,
    clearConversation,
    hasGreetedToday,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
