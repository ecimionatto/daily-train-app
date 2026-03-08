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
