import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCoachResponse,
  buildContextForAI,
  buildModelNotReadyMessage,
  generateProactiveGreeting,
  generateWeeklyReview,
  extractAthleteInsights,
  extractSessionFacts,
} from '../services/chatService';
import { ModelNotReadyError, ContextFullError } from '../services/localModel';
import { useApp } from './AppContext';

const ChatContext = createContext();

const SESSION_KEY = 'chatSession';
const CONTEXT_HISTORY_KEY = 'chatContextHistory';
const MAX_STORED_MESSAGES = 50;
const MAX_HISTORY_SESSIONS = 30;

export function useChat() {
  return useContext(ChatContext);
}

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [contextHistory, setContextHistory] = useState([]);
  const [isResponding, setIsResponding] = useState(false);
  const isRespondingRef = useRef(false);
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
    resetTrainingPlan,
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
    migrateToSessionModel().then(() => {
      loadOrStartSession();
      checkGreetingStatus();
      checkWeeklyReviewStatus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proactive greeting trigger — skip if a response is already in-flight
  useEffect(() => {
    if (todayWorkout && !hasGreetedToday && athleteProfile && !isRespondingRef.current) {
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

  /**
   * v3 migration: archive old chatConversation into chatContextHistory and switch to session model.
   */
  async function migrateToSessionModel() {
    const MIGRATION_KEY = 'chatMigration_v3_sessionModel';
    try {
      const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrated) return;

      const oldConversation = await AsyncStorage.getItem('chatConversation');
      if (oldConversation) {
        const oldMessages = JSON.parse(oldConversation);
        const historyEntry = {
          date: new Date().toISOString().slice(0, 10),
          keyFacts: ['Previous chat history archived'],
          intents: [],
          workoutPrescribed: null,
        };
        // Load existing history if any and prepend the archive entry
        const existingHistoryStr = await AsyncStorage.getItem(CONTEXT_HISTORY_KEY);
        const existingHistory = existingHistoryStr ? JSON.parse(existingHistoryStr) : [];
        const updatedHistory = [historyEntry, ...existingHistory].slice(0, MAX_HISTORY_SESSIONS);
        await AsyncStorage.setItem(CONTEXT_HISTORY_KEY, JSON.stringify(updatedHistory));
        // eslint-disable-next-line no-console
        console.log(
          `[Chat] v3 migration: archived ${oldMessages.length} messages from old conversation`
        );
      }

      await AsyncStorage.removeItem('chatConversation');
      await AsyncStorage.removeItem('lastGreetingDate');
      await AsyncStorage.setItem(MIGRATION_KEY, 'done');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Chat] v3 migration failed:', e.message || e);
    }
  }

  /**
   * Load today's session or start a fresh one, archiving yesterday's session if needed.
   */
  async function loadOrStartSession() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const storedSessionStr = await AsyncStorage.getItem(SESSION_KEY);
      const storedHistoryStr = await AsyncStorage.getItem(CONTEXT_HISTORY_KEY);
      const storedHistory = storedHistoryStr ? JSON.parse(storedHistoryStr) : [];

      if (storedSessionStr) {
        const storedSession = JSON.parse(storedSessionStr);
        if (storedSession.date === today) {
          // Today's session — load it
          setMessages(storedSession.messages || []);
          setContextHistory(storedHistory);
          return;
        }
        // Different day — archive and start fresh
        const updatedHistory = archiveSessionToHistory(storedSession, storedHistory);
        setContextHistory(updatedHistory);
        setMessages([]);
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ date: today, messages: [] }));
      } else {
        setContextHistory(storedHistory);
        setMessages([]);
      }
    } catch (e) {
      console.warn('Failed to load chat session:', e);
    }
  }

  /**
   * Archive a past session into the context history.
   * Extracts key facts and prepends to existing history, keeping at most MAX_HISTORY_SESSIONS.
   *
   * @param {{ date: string, messages: Array }} session
   * @param {Array} existingHistory
   * @returns {Array} Updated history array (already saved to AsyncStorage)
   */
  function archiveSessionToHistory(session, existingHistory) {
    const facts = extractSessionFacts(session.messages || [], session.date);
    const updatedHistory = [facts, ...existingHistory].slice(0, MAX_HISTORY_SESSIONS);
    // Fire-and-forget save
    AsyncStorage.setItem(CONTEXT_HISTORY_KEY, JSON.stringify(updatedHistory)).catch((e) =>
      console.warn('Failed to save context history:', e)
    );
    return updatedHistory;
  }

  async function persistSession(msgs) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const toStore = msgs.slice(-MAX_STORED_MESSAGES);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ date: today, messages: toStore }));
    } catch (e) {
      console.warn('Failed to save chat session:', e);
    }
  }

  async function checkGreetingStatus() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const storedSessionStr = await AsyncStorage.getItem(SESSION_KEY);
      if (storedSessionStr) {
        const storedSession = JSON.parse(storedSessionStr);
        const sessionDate = storedSession.date;
        if (sessionDate === today) {
          // Check if any proactive greeting exists in today's session
          const hasGreeting = (storedSession.messages || []).some((m) => m.metadata?.proactive);
          if (hasGreeting) {
            setHasGreetedToday(true);
          }
        }
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
    // Skip if a user-initiated response is in-flight (prevents double-bubble)
    if (isRespondingRef.current) return;

    const today = new Date().toISOString().slice(0, 10);
    // Check current session for proactive greeting already sent today
    const storedSessionStr = await AsyncStorage.getItem(SESSION_KEY).catch(() => null);
    if (storedSessionStr) {
      const storedSession = JSON.parse(storedSessionStr);
      if (storedSession.date === today) {
        const alreadyGreeted = (storedSession.messages || []).some((m) => m.metadata?.proactive);
        if (alreadyGreeted) {
          setHasGreetedToday(true);
          return;
        }
      }
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
        persistSession(updated);
        return updated;
      });
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
        persistSession(updated);
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
      conversationSummary: buildContextForAI(messages, contextHistory),
      trends,
      onWorkoutSwap: swapTodayWorkout,
      onProfileUpdate: onProfileUpdate,
      onPlanRegenerate: resetTrainingPlan,
    };
  }

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isResponding) return;

      // Set ref synchronously to block concurrent greeting/review
      isRespondingRef.current = true;

      const phase = getTrainingPhase();
      const daysToRace = getDaysToRace();

      const athleteMessage = {
        id: `msg_${Date.now()}_athlete`,
        role: 'athlete',
        content: text.trim(),
        timestamp: new Date().toISOString(),
        metadata: { phase, readinessScore },
      };

      // Use functional updater to avoid stale closures
      let updatedMessages;
      setMessages((prev) => {
        updatedMessages = [...prev, athleteMessage];
        return updatedMessages;
      });
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
          completedWorkouts: completedWorkouts || [],
          workoutHistory: (completedWorkouts?.length
            ? completedWorkouts
            : workoutHistory || []
          ).slice(-14),
          conversationSummary: buildContextForAI(updatedMessages, contextHistory),
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
        await persistSession(finalMessages);

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
        setMessages((prev) => {
          const finalMessages = [...prev, errorMessage];
          persistSession(finalMessages);
          return finalMessages;
        });
      }

      isRespondingRef.current = false;
      setIsResponding(false);
    },
    [
      contextHistory,
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
      const today = new Date().toISOString().slice(0, 10);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ date: today, messages: [] }));
    } catch (e) {
      console.warn('Failed to clear chat session:', e);
    }
  }

  const value = {
    messages,
    contextHistory,
    isResponding,
    sendMessage,
    clearConversation,
    hasGreetedToday,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
