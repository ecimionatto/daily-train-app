import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChat } from '../context/ChatContext';

const SUGGESTIONS = [
  'How should I train this week?',
  "Can I modify today's workout?",
  'How is my recovery looking?',
  'Tips for race day nutrition?',
];

export default function ChatScreen() {
  const { messages, isResponding, sendMessage } = useChat();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  function handleSend() {
    if (!inputText.trim() || isResponding) return;
    sendMessage(inputText);
    setInputText('');
  }

  function renderMessage({ item }) {
    const isCoach = item.role === 'coach';
    return (
      <View style={[styles.messageBubble, isCoach ? styles.coachBubble : styles.athleteBubble]}>
        {isCoach && <Text style={styles.coachLabel}>COACH</Text>}
        <Text style={[styles.messageText, isCoach ? styles.coachText : styles.athleteText]}>
          {item.content}
        </Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  }

  function renderEmpty() {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>AI Coach</Text>
        <Text style={styles.emptySubtitle}>
          Ask about your training plan, request workout modifications, get recovery advice, or
          discuss race strategy.
        </Text>
        <View style={styles.suggestionsContainer}>
          {SUGGESTIONS.map((suggestion, i) => (
            <TouchableOpacity
              key={i}
              style={styles.suggestionChip}
              onPress={() => setInputText(suggestion)}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Coach</Text>
        <Text style={styles.headerSubtitle}>ON-DEVICE AI</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.messageListEmpty,
        ]}
        ListEmptyComponent={renderEmpty}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {isResponding && (
        <View style={styles.typingContainer}>
          <Text style={styles.typingText}>Coach is thinking...</Text>
        </View>
      )}

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 80 }]}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask your coach..."
          placeholderTextColor="#555"
          multiline
          maxLength={500}
          returnKeyType="default"
          editable={!isResponding}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || isResponding) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || isResponding}
        >
          <Text style={styles.sendButtonText}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 2,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  messageListEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  coachBubble: {
    backgroundColor: '#1a1a2e',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  athleteBubble: {
    backgroundColor: '#e8ff47',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  coachLabel: {
    color: '#e8ff47',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  coachText: {
    color: '#ffffff',
  },
  athleteText: {
    color: '#0a0a0f',
  },
  timestamp: {
    color: '#666',
    fontSize: 10,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  typingContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  typingText: {
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
    alignItems: 'flex-end',
    backgroundColor: '#0a0a0f',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#e8ff47',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.3,
  },
  sendButtonText: {
    color: '#0a0a0f',
    fontSize: 18,
    fontWeight: '900',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  suggestionsContainer: {
    width: '100%',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  suggestionText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
});
