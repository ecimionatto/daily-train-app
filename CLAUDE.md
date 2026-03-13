# CLAUDE.md — Agent Instructions for DailyTrain

## GitHub Identity

Always use the personal GitHub account for this project:

- **User:** ecimionatto
- **Email:** ecimionatto@users.noreply.github.com
- **Remote:** https://github.com/ecimionatto/daily-train-app.git
- **Active `gh` account:** ecimionatto

Before pushing, verify the active account with `gh auth status` and switch if needed:

```bash
gh auth switch --user ecimionatto
```

Never use the enterprise account (`edson-cimionatto_tmna`) for commits or pushes to this repo.

## Git Config

Local git config is already pinned — do not change:

```
git config --local user.name "ecimionatto"
git config --local user.email "ecimionatto@users.noreply.github.com"
```

## Project Overview

React Native (Expo 50) Ironman triathlon training app for iPhone. On-device AI (Qwen 3.5) generates workouts and powers coach chat. No backend — all data stays on device via AsyncStorage.

## Key Conventions

- Functional components with hooks only (no class components)
- React Context for state (AuthContext, AppContext, ChatContext)
- PascalCase for screens/components, camelCase for services
- Every AI feature must have a rule-based fallback (works offline)
- AsyncStorage keys: `authUser`, `athleteProfile`, `todayWorkout`, `workoutHistory`, `chatConversation`

## Apple Health / Fitness Sync

Completed workouts from Apple Health must be refreshed in these scenarios:

1. **App loading** — `loadCompletedWorkouts()` runs when `athleteProfile` is loaded (AppContext)
2. **Plan changes** — any workout swap, profile update (race date change), or training plan modification must trigger `loadCompletedWorkouts()` to keep data current
3. **Coach interactions** — when the coach chat handles workout-related queries (completed workouts, readiness, weekly reviews), ensure the context includes fresh `completedWorkouts` data
4. **On-demand** — Dashboard pull-to-refresh and the SYNC button both call `loadCompletedWorkouts()`

The data source is `fetchCompletedWorkouts()` in `services/healthKit.js` (reads from HealthKit on device, returns mock data on simulator).

## Adaptive Training Plan

The training plan must be continuously evaluated and adapted based on:

1. **Completed workouts** — compare prescribed vs actual (discipline, duration, intensity) from Apple Health. If the athlete consistently misses a discipline or underperforms, adjust upcoming workouts accordingly.
2. **Health data trends** — readiness score, HRV, resting HR, and sleep trends should influence workout intensity and volume. Low readiness = reduce load; high readiness = push harder.
3. **Coach conversations** — when the athlete reports fatigue, injury, motivation issues, or requests changes through chat, the coach should factor this into future workout generation and recommendations.
4. **Weekly reviews** — Sunday evening auto-review (`generateWeeklyReview`) must analyze the full week's compliance, discipline balance, and health trends, then suggest concrete adjustments for the next week.
5. **Race proximity** — as race day approaches, training phases (BASE → BUILD → PEAK → TAPER → RACE_WEEK) must shift focus from volume to intensity to recovery, with the plan adapting if the athlete is behind or ahead of schedule.

The workout generation (`generateWorkoutLocally`) and coach responses (`getCoachResponse`) must always consider the athlete's recent history, not just the current day's data.

## Pre-commit

Husky + lint-staged runs ESLint (`--max-warnings=0`) and Prettier on staged `.js` files. Secret detection blocks hardcoded API keys/tokens.

## Clean Code Principles (Uncle Bob)

- **Single Responsibility**: Each function/component does one thing
- **Small functions**: Max ~20 lines; extract when longer
- **Descriptive names**: Functions = verbs (`calculateReadiness`, `sendMessage`), variables = nouns (`readinessScore`, `trainingPhase`)
- **No side effects in pure functions**: Service functions are pure; side effects only in context providers and hooks
- **DRY**: Extract shared logic into services or custom hooks; no copy-paste
- **No magic numbers/strings**: Use named constants
- **Error handling at boundaries**: Services handle errors, screens display them

## Functional Code Style

- **Pure functions over classes**: All services export pure functions
- **Immutable data**: Use spread/map/filter — never mutate state directly
- **Composition over inheritance**: Compose hooks and functions, never extend
- **Declarative over imperative**: Use `.map()`, `.filter()`, `.reduce()` — avoid manual loops where possible

## Testing Standards

- **Minimum 60% coverage** enforced by Jest `coverageThreshold` (lines, functions, branches, statements)
- **All new code must have unit tests** for exported functions
- **Every user journey must have integration tests** rendering screens with providers
- **Test naming**: `it('does X when Y')` — describe behavior, not implementation
- **AAA pattern**: Arrange (setup), Act (trigger), Assert (verify)
- **One assertion concept per test**: Test one behavior per `it()` block
- **Mock at boundaries**: Mock services (auth, healthKit, localModel, chatService), never mock React hooks or internal state
- Run `npm test` and `npm run test:coverage` before every commit

## Commands

- `npm start` — Expo dev server
- `npm test` — Jest tests
- `npm run test:coverage` — Jest with coverage report (must pass ≥60% threshold)
- `npm run lint` — ESLint check
- `npm run format` — Prettier format
