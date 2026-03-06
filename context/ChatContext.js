import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCoachResponse } from '../services/chatService';
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
  const {
    athleteProfile,
    healthData,
    readinessScore,
    getTrainingPhase,
    getDaysToRace,
    todayWorkout,
  } = useApp();

  useEffect(() => {
    loadConversation();
  }, []);

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
      } catch (e) {
        console.warn('Failed to get coach response:', e);
        const errorMessage = {
          id: `msg_${Date.now()}_error`,
          role: 'coach',
          content:
            "I'm having trouble processing your question right now. Please try again in a moment.",
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
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
