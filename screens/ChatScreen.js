import React, { useState, useRef } from 'react';
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
import { useApp } from '../context/AppContext';

const SUGGESTIONS = [
  'How should I train this week?',
  "Can I modify today's workout?",
  'How is my recovery looking?',
  'Tips for race day nutrition?',
];

/**
 * Render a single line with inline markdown: **bold** and *italic*.
 * Returns an array of <Text> elements safe for React Native.
 */
function renderInlineLine(line, baseStyle, lineKey) {
  const parts = [];
  const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  tokens.forEach((token, i) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <Text key={`${lineKey}-${i}`} style={[baseStyle, styles.bold]}>
          {token.slice(2, -2)}
        </Text>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <Text key={`${lineKey}-${i}`} style={[baseStyle, styles.italic]}>
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.length > 0) {
      parts.push(
        <Text key={`${lineKey}-${i}`} style={baseStyle}>
          {token}
        </Text>
      );
    }
  });
  return parts;
}

/**
 * Render markdown text with newline support.
 * Splits on \n, renders each line with inline markdown,
 * joins with actual line breaks via nested Text elements.
 */
function renderInlineMarkdown(text, baseStyle, key) {
  if (!text) return null;
  // Strip any remaining backtick markers (last-resort cleanup)
  const cleaned = text.replace(/`{1,3}/g, '');
  const lines = cleaned.split('\n');
  if (lines.length === 1) return renderInlineLine(text, baseStyle, key);

  return lines.map((line, i) => (
    <Text key={`${key}-line-${i}`}>
      {i > 0 && '\n'}
      {line.length > 0 ? renderInlineLine(line, baseStyle, `${key}-${i}`) : null}
    </Text>
  ));
}

export default function ChatScreen() {
  const { messages, isResponding, sendMessage } = useChat();
  const { modelStatus, modelProgress } = useApp();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef(null);
  const insets = useSafeAreaInsets();

  const modelLoading = modelStatus === 'downloading' || modelStatus === 'loading';
  const modelError = modelStatus === 'error';

  React.useEffect(() => {
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
    const textStyle = [styles.messageText, isCoach ? styles.coachText : styles.athleteText];
    return (
      <View style={[styles.messageBubble, isCoach ? styles.coachBubble : styles.athleteBubble]}>
        {isCoach && <Text style={styles.coachLabel}>COACH</Text>}
        <Text style={textStyle}>
          {isCoach ? renderInlineMarkdown(item.content, textStyle, item.id) : item.content}
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

      {modelLoading && (
        <View style={styles.modelBanner}>
          <Text style={styles.modelBannerText}>
            {modelProgress > 0
              ? `AI model loading… ${modelProgress}% — coach replies using built-in rules for now`
              : 'AI model loading… coach replies using built-in rules for now'}
          </Text>
        </View>
      )}
      {modelError && (
        <View style={[styles.modelBanner, styles.modelBannerError]}>
          <Text style={styles.modelBannerText}>
            AI model unavailable — using built-in coach rules
          </Text>
        </View>
      )}

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
  modelBanner: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  modelBannerError: {
    backgroundColor: '#2e1a1a',
    borderBottomColor: '#4e2a2a',
  },
  modelBannerText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
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
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
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
