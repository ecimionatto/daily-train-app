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

## Coach Identity (AI Persona Contract)

The AI coach has a strict identity that must be enforced in all system prompts and fallback responses:

1. **The coach is "Coach"** — the AI always refers to itself as "Coach". Never use any other name or persona.
2. **Never address the athlete by name** — do not use the athlete's name from their profile in any response, greeting, or fallback message. Always use "you" or "the athlete" when referring to them.
3. **Coach is the agent, not the athlete** — the AI's role is the coach providing guidance. It never speaks as or impersonates the athlete.
4. **Apply to all response paths** — this rule applies to both AI-generated responses (`runInference`) and all hardcoded fallback strings in `chatService.js`.

## Development Methodology

### Spec-Driven Development (The Contract)

CLAUDE.md is the source of truth. Define the contract (inputs, outputs, error states, constraints) before generating code. This prevents context drift and keeps AI implementations aligned with architecture.

- **Artifacts**: CLAUDE.md defines project rules, conventions, and boundaries
- **The Contract**: Every feature must have its behavior defined here before implementation
- **Validation**: If generated code violates these rules, the spec flags it — fix the code, not the spec

### Vibe Coding (The Implementation)

Once the contract is locked, use conversational AI to flesh out the implementation within the spec's boundaries.

- **Workflow**: Prompt, generate, run tests, iterate
- **Ideal for**: UI components, data transformation, service logic, boilerplate
- **Guardrails**: Tests + lint + pre-commit hooks enforce the contract automatically

### When to Use Which

| Concern | Spec-Driven | Vibe Coding |
|---------|-------------|-------------|
| Goal | Maintainability & alignment | Speed & exploration |
| Human role | Architect / spec writer | Orchestrator / prompt engineer |
| Source of truth | CLAUDE.md + tests | Chat history + generated code |
| When | System design, APIs, new features | UI tweaks, logic blocks, prototypes |

## iOS Build & Deploy

### Personal Team (Free Apple Account)

The app uses a Personal Team for development. These capabilities are **not supported** on free accounts and must be removed before building:

- Sign In with Apple (use Dev Sign In on device for testing)
- Push Notifications
- Extended Virtual Addressing

### Build Commands

```bash
# Prebuild (regenerates ios/ from app.json)
LANG=en_US.UTF-8 npx expo prebuild --platform ios --clean

# Patch ExpoAppleAuthentication (required after every prebuild)
# Add @unknown default to switch statements in:
# node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift

# Build for device — Release (JS bundle embedded, works without cable or Metro)
# USE THIS by default so the app runs standalone on the iPhone.
xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
  -destination 'id=DEVICE_UDID' -configuration Release \
  DEVELOPMENT_TEAM=J52KM8A8YH -allowProvisioningUpdates build

# Build for device — Debug (JS served live from Metro, requires USB + npm start)
# USE ONLY when actively developing with hot reload.
xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
  -destination 'id=DEVICE_UDID' -configuration Debug \
  DEVELOPMENT_TEAM=J52KM8A8YH -allowProvisioningUpdates build

# Build for simulator
xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO build
```

## Documentation

All documentation (README.md, CLAUDE.md, skill files, inline comments) must be revised after implementation changes. When code behavior, APIs, or workflows change, update the corresponding docs in the same commit — never leave docs stale.

## Skills (`.claude/commands/`)

Skills must be kept up to date with the current build process and project state. The following skills exist and must reflect any changes to build commands, signing, plugins, or workflows:

- **install-on-phone.md** — Build and install on a physical iPhone
- **run-in-simulator.md** — Build and run in iOS Simulator
- **publish-to-appstore.md** — Publish to the App Store
- **troubleshoot.md** — Diagnose and fix common build, signing, and runtime issues

When build steps, signing configuration, plugin behavior, or troubleshooting steps change, update the affected skills in the same commit.

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
