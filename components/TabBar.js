import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_CONFIG = {
  Dashboard: { label: 'Home', icon: '◉' },
  Workout: { label: 'Train', icon: '▶' },
  Recovery: { label: 'Recovery', icon: '♥' },
  Weekly: { label: 'Week', icon: '▦' },
};

export default function TabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 16 }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name] || {
          label: route.name,
          icon: '●',
        };

        function onPress() {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={styles.tab}
          >
            <Text
              style={[
                styles.icon,
                isFocused ? styles.iconFocused : styles.iconDefault,
              ]}
            >
              {config.icon}
            </Text>
            <Text
              style={[
                styles.label,
                isFocused ? styles.labelFocused : styles.labelDefault,
              ]}
            >
              {config.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0f',
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
    paddingTop: 10,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
    marginBottom: 4,
  },
  iconFocused: {
    color: '#e8ff47',
  },
  iconDefault: {
    color: '#555',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  labelFocused: {
    color: '#e8ff47',
  },
  labelDefault: {
    color: '#555',
  },
});
