# DTrain — Requirements Specification

> Version 1.0 | Last updated: 2026-04-05
> Source of truth: derived from running app (v1.0.0) on iPhone

---

## 1. Functional Requirements

### FR-1: Authentication

| ID | Requirement | Status |
|----|-------------|--------|
| FR-1.1 | App shall support Apple Sign-In on iOS devices | Implemented |
| FR-1.2 | App shall support Google Sign-In on all platforms | Implemented |
| FR-1.3 | App shall provide dev sign-in on debug builds only | Implemented |
| FR-1.4 | OAuth tokens shall be stored in memory only; user profile persists via AsyncStorage `authUser` key | Implemented |
| FR-1.5 | Sign-out shall clear `authUser` and all related data from AsyncStorage | Implemented |
| FR-1.6 | App shall show Login screen when no authenticated user exists | Implemented |

### FR-2: Onboarding

| ID | Requirement | Status |
|----|-------------|--------|
| FR-2.1 | Onboarding shall collect race date via a date picker (step 0) | Implemented |
| FR-2.2 | Onboarding shall collect triathlon distance (Sprint / Olympic / 70.3 / Full Ironman) | Implemented |
| FR-2.3 | Onboarding shall collect weekly training hours (5-7 / 8-10 / 11-14 / 15+) | Implemented |
| FR-2.4 | Onboarding shall collect strongest and weakest disciplines | Implemented |
| FR-2.5 | Onboarding shall collect swimming background (Competitive / Comfortable / Learning / Survival) | Implemented |
| FR-2.6 | Onboarding shall collect weekend long-session preference (bike-sat-run-sun or run-sat-bike-sun) | Implemented |
| FR-2.7 | Onboarding shall collect swim day preference (MWF or TTS) | Implemented |
| FR-2.8 | Onboarding shall collect previous race experience | Implemented |
| FR-2.9 | Onboarding shall collect current injury concerns | Implemented |
| FR-2.10 | Onboarding shall collect target finish time (options based on selected distance) | Implemented |
| FR-2.11 | Onboarding shall analyze 30 days of Apple Health workout history and display proposed weekly targets before profile save | Implemented |
| FR-2.12 | If no HealthKit data available, onboarding shall proceed with default targets | Implemented |
| FR-2.13 | On completion, onboarding shall compute HR profile from 6 months of workout history | Implemented |
| FR-2.14 | Profile shall be saved to AsyncStorage `athleteProfile` key | Implemented |

### FR-3: Dashboard

| ID | Requirement | Status |
|----|-------------|--------|
| FR-3.1 | Dashboard shall display today's readiness score (0-100) with color coding | Implemented |
| FR-3.2 | Dashboard shall display today's prescribed workout (title, discipline, duration, intensity, structured sections) | Implemented |
| FR-3.3 | Dashboard shall auto-generate today's workout based on discipline selection, phase, readiness, and profile | Implemented |
| FR-3.4 | Dashboard shall provide alternative workout option when available | Implemented |
| FR-3.5 | Dashboard shall display weekly consistency card (percentage, session count, per-discipline progress bars) | Implemented |
| FR-3.6 | Dashboard shall support pull-to-refresh to sync HealthKit data | Implemented |
| FR-3.7 | Dashboard shall display tomorrow's workout preview with rotation controls | Implemented |
| FR-3.8 | Dashboard shall show AI insight from recent workout analysis | Implemented |
| FR-3.9 | If today's workout is cached and date-valid, dashboard shall reuse it | Implemented |
| FR-3.10 | Workout switch shall replace today's workout and clear cache | Implemented |

### FR-4: Workout Detail

| ID | Requirement | Status |
|----|-------------|--------|
| FR-4.1 | Workout screen shall display full workout structure (title, meta, summary, sections) | Implemented |
| FR-4.2 | Each section (WARMUP, MAIN SET, COOLDOWN) shall show section name, notes, and set rows | Implemented |
| FR-4.3 | Each set row shall display description and zone badge | Implemented |
| FR-4.4 | Empty state shall show "No Workout Yet" and redirect to Dashboard | Implemented |

### FR-5: Workout Generation

| ID | Requirement | Status |
|----|-------------|--------|
| FR-5.1 | System shall generate workouts using on-device AI (Hammer 2.1 1.5B) when model is ready | Implemented |
| FR-5.2 | System shall fall back to rule-based generation when model is unavailable | Implemented |
| FR-5.3 | Generated workouts shall respect current training phase zone limits (BASE: Z1-Z2, BUILD: up to Z4, PEAK: up to Z5, TAPER: up to Z4, RACE_WEEK: Z1-Z2) | Implemented |
| FR-5.4 | System shall sanitize AI-generated workouts for zone consistency (hard intensity >= Z3, easy intensity <= Z2) | Implemented |
| FR-5.5 | System shall generate alternative workout when readiness < 55 or injury reported | Implemented |
| FR-5.6 | Workout duration shall scale by discipline base duration x phase volume multiplier | Implemented |
| FR-5.7 | 80/20 rule: 80% of weekly sessions shall be easy (Z1-Z2), 20% hard (Z3-Z5) | Implemented |
| FR-5.8 | No consecutive days with same discipline | Implemented |
| FR-5.9 | At least 1 rest day per week | Implemented |

### FR-6: Weekly Planning & Consistency

| ID | Requirement | Status |
|----|-------------|--------|
| FR-6.1 | System shall generate weekly session targets per discipline based on volume tier and phase | Implemented |
| FR-6.2 | Adaptive discipline selection shall prioritize remaining targets + readiness | Implemented |
| FR-6.3 | Weekly consistency score shall be computed as (completed / target) per discipline | Implemented |
| FR-6.4 | Weekly screen shall display 7-day grid with discipline colors and completion status | Implemented |
| FR-6.5 | Weekly screen shall show consistency percentage and per-discipline target progress | Implemented |
| FR-6.6 | Suggested schedule shall respect athlete's weekend and swim day preferences | Implemented |
| FR-6.7 | Weekly targets by volume tier: 5-7h (2/2/3/0), 8-10h (3/3/3/1), 11-14h (3/3/4/1), 15+ (4/4/4/1) for swim/bike/run/strength | Implemented |

### FR-7: Training Phases

| ID | Requirement | Status |
|----|-------------|--------|
| FR-7.1 | Phase shall be derived from days-to-race: >20wk BASE, 12-20wk BUILD, 6-12wk PEAK, 2-6wk TAPER, <2wk RACE_WEEK | Implemented |
| FR-7.2 | Phase shall modulate volume: BASE x0.9, BUILD x1.0, PEAK x1.1, TAPER x0.7, RACE_WEEK x0.4 | Implemented |
| FR-7.3 | Strength periodization: BASE=max strength, BUILD=power/explosive, PEAK=maintenance, TAPER=reduced, RACE_WEEK=none | Implemented |
| FR-7.4 | Deload cycle: 3 build weeks + 1 deload week (35% volume reduction) | Implemented |

### FR-8: Apple Health Integration

| ID | Requirement | Status |
|----|-------------|--------|
| FR-8.1 | App shall request HealthKit read permissions for HRV, RHR, sleep, workouts, heart rate, VO2 max | Implemented |
| FR-8.2 | App shall request HealthKit write permissions for workouts | Implemented |
| FR-8.3 | System shall fetch completed workouts (14 days) for compliance tracking | Implemented |
| FR-8.4 | System shall calculate readiness from HRV trend, RHR deviation, and sleep hours | Implemented |
| FR-8.5 | System shall compute Karvonen HR zones from max HR and resting HR | Implemented |
| FR-8.6 | System shall auto-detect max HR from 6 months of workout history | Implemented |
| FR-8.7 | HealthKit sync shall trigger on: app load, plan changes, pull-to-refresh, coach interactions | Implemented |
| FR-8.8 | Completed workouts from Apple Health shall never be synced to cloud (source of truth is HealthKit) | Implemented |

### FR-9: Recovery & Health Trends

| ID | Requirement | Status |
|----|-------------|--------|
| FR-9.1 | Recovery screen shall display overall readiness (0-100) with color coding | Implemented |
| FR-9.2 | Recovery screen shall display HRV (SDNN) with 14-day sparkline and trend direction | Implemented |
| FR-9.3 | Recovery screen shall display resting heart rate with sparkline and trend | Implemented |
| FR-9.4 | Recovery screen shall display sleep hours with grade (GOOD/OK/LOW) | Implemented |
| FR-9.5 | Recovery screen shall display VO2 max when available from Apple Watch | Implemented |
| FR-9.6 | Recovery screen shall support pull-to-refresh for HealthKit sync | Implemented |

### FR-10: HR Zones

| ID | Requirement | Status |
|----|-------------|--------|
| FR-10.1 | HR zones screen shall display 5 Karvonen zones with HR ranges and purpose labels | Implemented |
| FR-10.2 | User shall be able to manually edit max HR and resting HR | Implemented |
| FR-10.3 | User shall be able to enter FTP (watts) | Implemented |
| FR-10.4 | System shall label zone source ("Computed from workouts" vs "Manually entered") | Implemented |
| FR-10.5 | Refresh button shall fetch recent max HR and RHR from HealthKit | Implemented |
| FR-10.6 | Zones: Z1 50-60% (recovery), Z2 60-70% (aerobic), Z3 70-80% (tempo), Z4 80-90% (threshold), Z5 90-100% (VO2 max) | Implemented |

### FR-11: AI Coach Chat

| ID | Requirement | Status |
|----|-------------|--------|
| FR-11.1 | Chat shall use on-device Hammer 2.1 1.5B model via llama.rn for inference | Implemented |
| FR-11.2 | Chat shall display model loading status with percentage progress | Implemented |
| FR-11.3 | Chat shall fall back to rule-based responses when model unavailable | Implemented |
| FR-11.4 | Coach responses shall be limited to 150 words | Implemented |
| FR-11.5 | Chat shall support tool-calling with 6 tools: set_schedule, swap_workout, adjust_load, update_plan, analyze_trends, analyze_history | Implemented |
| FR-11.6 | Tool actions shall follow preview/confirm pattern: AI proposes, user confirms, code executes | Implemented |
| FR-11.7 | Chat shall detect athlete intent (fatigue, pain, load adjustment, discipline focus) from keywords | Implemented |
| FR-11.8 | Chat shall auto-generate proactive morning greeting when workout is ready | Implemented |
| FR-11.9 | Chat shall auto-generate weekly review on Sunday evenings | Implemented |
| FR-11.10 | Conversation history: only last 6 messages passed to model; older messages summarized into ≤50-word summary | Implemented |
| FR-11.11 | Chat session archives to `chatContextHistory` (max 30 days, FIFO) | Implemented |
| FR-11.12 | Chat shall render inline markdown (**bold**, *italic*) | Implemented |
| FR-11.13 | System prompt budget shall not exceed 2048 tokens | Implemented |

### FR-12: Plan Settings

| ID | Requirement | Status |
|----|-------------|--------|
| FR-12.1 | User shall be able to edit race date | Implemented |
| FR-12.2 | User shall be able to change race distance | Implemented |
| FR-12.3 | User shall be able to change schedule preferences (weekend, swim days) | Implemented |
| FR-12.4 | Apply changes shall re-save profile and clear today's workout cache | Implemented |
| FR-12.5 | Reset plan shall clear workout caches and re-fetch HealthKit | Implemented |
| FR-12.6 | Reset to onboarding shall clear all data and restart flow | Implemented |
| FR-12.7 | Screen shall display current weekly session targets and consistency percentage | Implemented |
| FR-12.8 | Screen shall display suggested weekly schedule (muted, not prescribed) | Implemented |

### FR-13: Calendar

| ID | Requirement | Status |
|----|-------------|--------|
| FR-13.1 | Calendar screen shall display month view with prescribed disciplines per day | Implemented |
| FR-13.2 | Tap on day shall show modal with discipline, session type, and brief hint | Implemented |
| FR-13.3 | Calendar shall display current training phase indicator | Implemented |

### FR-14: AI Reasoning Harness

| ID | Requirement | Status |
|----|-------------|--------|
| FR-14.1 | System shall pre-compute all analysis deterministically before passing to AI model | Implemented |
| FR-14.2 | AI model shall only narrate pre-computed results (not reason from raw data) | Implemented |
| FR-14.3 | Plan proposal prompt shall be ≤400 tokens | Implemented |
| FR-14.4 | Weekly check-in prompt shall be ≤250 tokens | Implemented |
| FR-14.5 | Daily discipline prompt shall be ≤200 tokens | Implemented |

### FR-15: Cloud Backup (Phase 2 — Future)

| ID | Requirement | Status |
|----|-------------|--------|
| FR-15.1 | All writes shall go to AsyncStorage first; backup is side-effect only | Stub |
| FR-15.2 | `isBackupEnabled()` shall gate all paid feature calls; currently returns `false` | Stub |
| FR-15.3 | Data to sync: `athleteProfile`, `workoutHistory`, `chatConversation` | Stub |
| FR-15.4 | Never sync `completedWorkouts` (HealthKit is source of truth) | Stub |
| FR-15.5 | UI placeholder: "Premium" section in Plan Settings with "Coming Soon" | Stub |

---

## 2. Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Metric | Status |
|----|-------------|--------|--------|
| NFR-1.1 | Model download shall support progress reporting and resume | ~940MB GGUF file | Implemented |
| NFR-1.2 | AI inference latency shall be < 10s for coaching responses | On-device, 4 threads | Implemented |
| NFR-1.3 | Workout generation shall complete in < 15s including sanitization | End-to-end | Implemented |
| NFR-1.4 | HealthKit fetch shall complete in < 5s for 14-day window | Pull-to-refresh | Implemented |
| NFR-1.5 | App cold start to Dashboard shall be < 3s (excluding model load) | AsyncStorage reads | Implemented |
| NFR-1.6 | AI context window: 4096 tokens max; system prompt budget: 2048 tokens | Token management | Implemented |
| NFR-1.7 | Conversation history limited to 6 messages to stay within context budget | 3 user + 3 coach turns | Implemented |

### NFR-2: Privacy & Security

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-2.1 | All data shall remain on-device; no backend server required for core functionality | Implemented |
| NFR-2.2 | AI inference shall run entirely on-device (no cloud API for coaching) | Implemented |
| NFR-2.3 | OAuth tokens shall be held in memory only, not persisted to disk | Implemented |
| NFR-2.4 | HealthKit data shall never leave the device | Implemented |
| NFR-2.5 | No hardcoded secrets in source code (pre-commit hook enforced) | Implemented |
| NFR-2.6 | App-specific passwords stored in macOS Keychain (local) or GitHub Secrets (CI) | Implemented |

### NFR-3: Reliability & Offline

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-3.1 | App shall be fully functional offline after initial model download | Implemented |
| NFR-3.2 | Every AI feature shall have a rule-based fallback | Implemented |
| NFR-3.3 | Workout cache shall be date-validated; stale workouts regenerated | Implemented |
| NFR-3.4 | AsyncStorage reads shall gracefully handle null/corrupt data | Implemented |
| NFR-3.5 | HealthKit unavailability (simulator/Android) shall not crash the app | Implemented |

### NFR-4: Maintainability

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-4.1 | Minimum 60% test coverage (lines, functions, branches, statements) | Enforced by Jest |
| NFR-4.2 | Pre-commit hook: secret detection + ESLint (--max-warnings=0) + Prettier + Jest | Implemented |
| NFR-4.3 | Pure functions for all services; side effects only in context providers | Implemented |
| NFR-4.4 | Max ~20 lines per function; extract when longer | Convention |
| NFR-4.5 | Descriptive names: functions = verbs, variables = nouns | Convention |
| NFR-4.6 | No magic numbers/strings; use named constants | Convention |
| NFR-4.7 | 527 tests across 27 test suites | Current state |

### NFR-5: Compatibility

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-5.1 | iOS 16+ required (HealthKit APIs, llama.rn Metal support) | Implemented |
| NFR-5.2 | iPhone only (supportsTablet: false) | Implemented |
| NFR-5.3 | React Native 0.73.4 via Expo 50 | Implemented |
| NFR-5.4 | Hermes JS engine for production builds | Implemented |
| NFR-5.5 | Personal Team (free Apple account): app expires every 7 days, rebuild to renew | Documented |
| NFR-5.6 | Node 20.19.4 + Ruby 3.2 managed via mise | Implemented |

### NFR-6: Build & Deployment

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-6.1 | CI pipeline shall run lint + tests on every PR (`pr-checks.yml`) | Implemented |
| NFR-6.2 | Merge to `main` shall auto-build and submit to App Store Connect (`ios-release.yml`) | Implemented |
| NFR-6.3 | Build number shall auto-increment per CI run (YYYYMMDD.run_number) | Implemented |
| NFR-6.4 | Release build shall embed JS bundle (standalone, no Metro required) | Implemented |
| NFR-6.5 | Prebuild shall use `expo prebuild --platform ios --clean` | Implemented |
| NFR-6.6 | IPA signed with Apple Distribution certificate (Team J52KM8A8YH) | Implemented |
| NFR-6.7 | Upload via App Store Connect API key (not altool) | Implemented |

### NFR-7: UX & Accessibility

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-7.1 | Dark theme: bg #0a0a0f, text #fff, accent #e8ff47 | Implemented |
| NFR-7.2 | Touch targets: minimum 44pt | Implemented |
| NFR-7.3 | Color contrast: minimum 4.5:1 ratio | Implemented |
| NFR-7.4 | Safe area insets for notch and home indicator | Implemented |
| NFR-7.5 | Screen reader labels on interactive elements | Implemented |
| NFR-7.6 | Discipline color coding: swim=#47b2ff, bike=#e8ff47, run=#47ffb2, strength=#ff6b6b, brick=#ff9f43, rest=#333 | Implemented |
| NFR-7.7 | Consistency color coding: green >=85%, yellow 70-84%, red <70% | Implemented |

### NFR-8: AI Model Constraints

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-8.1 | Model: Hammer 2.1 1.5B Q4_K_M quantization (~940MB) | Implemented |
| NFR-8.2 | Context window: 4096 tokens | Implemented |
| NFR-8.3 | Inference threads: 4, GPU layers: 99, mlock: true | Implemented |
| NFR-8.4 | Model must support tool-calling (function masking) | Implemented |
| NFR-8.5 | Token estimation: 1 token ~ 4 characters | Implemented |
| NFR-8.6 | Prompt overflow: truncate conversationSummary first, then COACH_KNOWLEDGE, never identity/constraints | Implemented |
| NFR-8.7 | Context drift prevention: regenerate conversationSummary every 6 turns (<=50 words) | Implemented |

### NFR-9: Data Architecture

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-9.1 | AsyncStorage is sole persistence layer (no SQLite, no Realm) | Implemented |
| NFR-9.2 | Standard keys: `authUser`, `athleteProfile`, `todayWorkout`, `workoutHistory`, `chatConversation` | Implemented |
| NFR-9.3 | Data migrations tracked via flag keys (e.g., `appMigration_v2_clearDisciplineCache`) | Implemented |
| NFR-9.4 | Chat history: 30-day FIFO ring buffer for session archives | Implemented |
| NFR-9.5 | All writes to AsyncStorage first; cloud backup (Phase 2) is side-effect only | Implemented |

---

## 3. Screen Inventory

| Screen | Route | Purpose | Key Interactions |
|--------|-------|---------|-----------------|
| LoginScreen | / | OAuth authentication | Apple/Google sign-in |
| OnboardingScreen | /onboarding | Profile builder (11 steps + history) | Multi-choice, date picker, targets preview |
| DashboardScreen | /tabs/dashboard | Daily workout hub | Generate, swap, pull-to-refresh |
| WorkoutScreen | /workout | Workout detail view | Read-only sections |
| RecoveryScreen | /tabs/recovery | 14-day health trends | Sparklines, pull-to-refresh |
| ChatScreen | /tabs/coach | AI coaching chat | Message input, suggested prompts |
| WeeklyScreen | /tabs/weekly | 7-day compliance view | Discipline grid, consistency |
| CalendarScreen | /tabs/calendar | Month training plan | Day tap → modal detail |
| PlanSettingsScreen | /settings | Race config + plan reset | Date/distance edit, reset buttons |
| HRZonesScreen | /tabs/hr-zones | HR zone config | Manual entry, HealthKit refresh |

---

## 4. Service Inventory

| Service | File | Pure | Key Exports |
|---------|------|------|-------------|
| Local Model | localModel.js | No (stateful model) | initLocalModel, runInference, runToolInference, generateWorkoutLocally, generateWeeklyTargets, selectTodaysDiscipline |
| HealthKit | healthKit.js | No (native bridge) | fetchHealthData, fetchCompletedWorkouts, calculateReadiness, buildKarvonenZones, computeAndSaveHRProfile |
| Chat Service | chatService.js | Yes | getCoachResponse, generateProactiveGreeting, generateWeeklyReview, extractAthleteInsights |
| Agent Orchestrator | agentOrchestrator.js | Yes | processMessage (tool-calling dispatch) |
| Agent Constitution | agentConstitution.js | Yes | COACH_IDENTITY, COACH_SKILLS, COACH_CONSTRAINTS, COACH_KNOWLEDGE, PLAN_RULES |
| Workout Scoring | workoutScoring.js | Yes | calculateCompletionScore, calculateWeeklyConsistencyScore, calculateOverallReadiness |
| History Analyzer | historyAnalyzer.js | Yes | analyzeTrainingHistory, formatHistorySummary |
| Trend Analysis | trendAnalysis.js | Yes | analyzeHealthTrends, analyzeWorkoutTrends, detectPaceAchievements |
| Reasoning Harness | reasoningHarness.js | Yes | buildPlanProposalPrompt, buildWeeklyCheckInPrompt, buildDailyDisciplinePrompt |
| Race Config | raceConfig.js | Yes | TRIATHLON_DISTANCES, GOAL_TIMES, getDisciplinesForProfile |
| Training Heuristics | trainingHeuristics.js | Yes | WEEKLY_TARGETS, SESSION_DURATIONS, PHASE_CONFIG |
| Model Sanitizer | modelSanitizer.js | Yes | sanitizeModelOutput |
| Auth | auth.js | No (OAuth) | signInWithGoogle, signInWithApple |
| Backup | backupService.js | Yes (stub) | isBackupEnabled (returns false) |

---

## 5. Data Flow Diagram (Text)

```
HealthKit (Apple)
  │
  ├─ fetchCompletedWorkouts(14d) ──→ completedWorkouts ──→ weeklyConsistency
  ├─ fetchHealthData() ──────────→ healthData ──────────→ readinessScore
  ├─ fetchHealthHistory(14d) ────→ healthHistory ───────→ trends (sparklines)
  └─ fetchMaxWorkoutHeartRate() ─→ hrProfile ───────────→ Karvonen zones
                                                             │
                                                             v
athleteProfile ──→ phase (from raceDate) ──→ weeklyTargets ──→ selectTodaysDiscipline()
     │                     │                        │                    │
     v                     v                        v                    v
generateWorkoutLocally(discipline, phase, readiness, profile)
     │
     v
todayWorkout ──→ DashboardScreen ──→ WorkoutScreen
     │
     v
saveTodayWorkout() ──→ AsyncStorage('todayWorkout')

User message ──→ agentOrchestrator.processMessage()
     │                    │
     ├─ text response ←───┤
     └─ tool call ────→ skillExecutor.preview() ──→ confirmation ──→ commit()
```

---

## 6. Test Coverage

| Suite | Tests | Focus |
|-------|-------|-------|
| DashboardScreen | ~15 | Workout display, generation, swap, consistency card |
| OnboardingScreen | 5 | Full flow, profile save, history step |
| PlanSettingsScreen | ~10 | Settings edit, reset, target display |
| WeeklyScreen | ~10 | Grid, completion, consistency |
| ChatScreen | ~10 | Message send, model status, markdown |
| RecoveryScreen | ~8 | Health cards, sparklines, pull-to-refresh |
| WorkoutScreen | ~8 | Detail view, sections, empty state |
| LoginScreen | ~5 | OAuth buttons, loading state |
| localModel | ~40 | Workout generation, sanitization, weekly targets |
| healthKit | ~20 | Readiness, zones, fetch, write |
| chatService | ~25 | Intent detection, insights, context build |
| agentOrchestrator | ~15 | Tool routing, confirmation flow |
| agentSmoke | 6 | End-to-end agent message flow |
| workoutScoring | ~20 | Consistency, compliance, readiness |
| historyAnalyzer | ~15 | 30-day analysis, trends, gaps |
| reasoningHarness | 15 | Token budgets, prompt structure |
| trendAnalysis | ~15 | Health/workout trends, achievements |
| toolSchemas | ~5 | Tool definitions, executor mapping |
| skills/* | ~20 | Executor, registry, individual skills |
| **Total** | **527** | **27 suites** |
