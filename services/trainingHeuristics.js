/**
 * trainingHeuristics.js — Thin JS loader for training science constants.
 *
 * The authoritative source of truth is docs/training-heuristics.md.
 * This file exports parsed constants for use in code (workout generation,
 * coach responses, plan validation).
 *
 * React Native cannot import .md files directly, so HEURISTICS_TEXT is
 * a placeholder. At build time or via a build script, inject the raw
 * markdown string here if needed for the AI agent's system prompt.
 */

// ---------------------------------------------------------------------------
// HEURISTICS_TEXT
// Raw markdown content for injection into the AI agent system prompt.
// TODO: Replace with build-time import from docs/training-heuristics.md
// For now, the agent constitution (agentConstitution.js) contains a
// compressed version of these rules in COACH_KNOWLEDGE and PLAN_RULES.
// ---------------------------------------------------------------------------
export const HEURISTICS_TEXT = ''; // See docs/training-heuristics.md

// ---------------------------------------------------------------------------
// WEEKLY_TARGETS
// Minimum session counts per discipline by volume tier.
// Two-a-days and bricks count toward both disciplines.
// ---------------------------------------------------------------------------
export const WEEKLY_TARGETS = {
  '5-7': { swim: 2, bike: 2, run: 3, strength: 0 },
  '8-10': { swim: 3, bike: 3, run: 3, strength: 1 },
  '11-14': { swim: 3, bike: 3, run: 4, strength: 1 },
  '15+': { swim: 4, bike: 4, run: 4, strength: 1 },
};

// ---------------------------------------------------------------------------
// SESSION_DURATIONS
// Base session duration in minutes per discipline by volume tier.
// Multiply by PHASE_CONFIG[phase].volumeMult for actual duration.
// ---------------------------------------------------------------------------
export const SESSION_DURATIONS = {
  '5-7': { swim: 40, bike: 55, run: 45, strength: 30 },
  '8-10': { swim: 50, bike: 70, run: 55, strength: 40 },
  '11-14': { swim: 55, bike: 85, run: 65, strength: 45 },
  '15+': { swim: 60, bike: 100, run: 75, strength: 45 },
};

// ---------------------------------------------------------------------------
// PHASE_CONFIG
// Volume multiplier and max HR zone per training phase.
// volumeMult is applied to SESSION_DURATIONS base values.
// maxZone is the ceiling for any session in that phase.
// ---------------------------------------------------------------------------
export const PHASE_CONFIG = {
  BASE: { volumeMult: 0.9, maxZone: 2 },
  BUILD: { volumeMult: 1.0, maxZone: 4 },
  PEAK: { volumeMult: 1.1, maxZone: 5 },
  TAPER: { volumeMult: 0.7, maxZone: 4 },
  RACE_WEEK: { volumeMult: 0.4, maxZone: 2 },
};

// ---------------------------------------------------------------------------
// CONSISTENCY_THRESHOLDS
// Weekly workout compliance brackets (percentage).
// green = on track, yellow = falling behind, red = plan at risk.
// ---------------------------------------------------------------------------
export const CONSISTENCY_THRESHOLDS = {
  green: 85,
  yellow: 70,
  red: 0,
};

// ---------------------------------------------------------------------------
// INTENSITY_RULES
// 80/20 distribution applied to session count (not time).
// maxHardPerDisciplinePerWeek: each discipline gets at most this many
// quality/threshold sessions per week.
// ---------------------------------------------------------------------------
export const INTENSITY_RULES = {
  easyPercent: 80,
  hardPercent: 20,
  maxHardPerDisciplinePerWeek: 1,
};

// ---------------------------------------------------------------------------
// DELOAD_CYCLE
// Mesocycle structure: N build weeks followed by 1 deload week.
// reductionPercent: volume reduction during deload (30-40% range, use 35).
// ---------------------------------------------------------------------------
export const DELOAD_CYCLE = {
  buildWeeks: 3,
  deloadWeeks: 1,
  reductionPercent: 35,
};
