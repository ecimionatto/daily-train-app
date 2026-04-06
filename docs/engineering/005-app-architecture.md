---
layout: default
title: "DTrain Architecture: How the On-Device AI Agent Manages Your Training Plan"
---

# DTrain Architecture: How the On-Device AI Agent Manages Your Training Plan

*A deep dive into the data model, agent flow, screen rendering pipeline, and plan mutation propagation in a privacy-first triathlon training app.*

## System Overview

DTrain is a React Native (Expo 50) app that runs entirely on-device. There are three primary systems, and they never talk to a remote server:

```
+-------------------+     +--------------------+     +------------------+
|   Apple Health    |     |  On-Device LLM     |     |   AsyncStorage   |
|   (HealthKit)     |     |  (Hammer 2.1 1.5B) |     |   (App Data)     |
|                   |     |                    |     |                  |
|  Completed        |     |  Tool inference    |     |  athleteProfile  |
|  workouts, HR,    |     |  Text generation   |     |  workoutHistory  |
|  HRV, sleep       |     |  Tool selection    |     |  chatConversation|
+--------+----------+     +---------+----------+     +--------+---------+
         |                          |                          |
         +------------+-------------+-----------+--------------+
                      |                         |
              +-------v-------------------------v-------+
              |          React Context Layer            |
              |  AppContext | ChatContext | AuthContext   |
              |                                         |
              |  athleteProfile, weeklyTargets,          |
              |  todayWorkout, completedWorkouts,        |
              |  readinessScore, trends, modelStatus     |
              +-------------------+---------------------+
                                  |
              +-------------------v---------------------+
              |              UI Screens                  |
              |  Dashboard | Weekly | Calendar | Chat   |
              |  Workout | PlanSettings | Recovery      |
              +-----------------------------------------+
```

The data flows in one direction: HealthKit and AsyncStorage feed into React Context, which feeds into screens. The AI model sits to the side — it reads context to make decisions and writes changes back through AsyncStorage, which triggers React state updates that re-render all subscribed screens.

## Data Model

Three data entities drive the entire app:

### athleteProfile (Source of Truth)

Stored in AsyncStorage under the key `athleteProfile`. This is the single source of truth for the athlete's identity, goals, and plan configuration. Every other computed value derives from this object.

Key fields:

- `raceType`: triathlon or running
- `raceDate`: ISO date string for the target race
- `distance`: race distance (e.g., "Half Ironman (70.3)")
- `weeklyHours`: available training hours per week
- `schedulePreferences`: `{ weekendPreference, swimDays }`
- `athleteInsights`: temporary AI-generated adjustments (load reduction, discipline focus)
- `hrZones`: computed HR zones from lactate threshold test or estimation

### weeklyTargets (Computed)

Not stored — computed on every render via `useMemo` in AppContext. Takes `athleteProfile` and the current `phase` (BASE, BUILD, PEAK, TAPER, RACE_WEEK) and produces the week's workout targets: which disciplines, how many sessions, hard/easy distribution.

The computation chain:

```
athleteProfile.raceDate → phase (useMemo)
phase + athleteProfile → weekPlan via getWeeklyDisciplinePlan() (useMemo)
weekPlan + completedWorkouts → weeklyTargets with completion status
```

Because this is derived state in `useMemo`, it recomputes automatically whenever the profile or phase changes. No manual cache invalidation needed.

### completedWorkouts (HealthKit, Read-Only)

Fetched from Apple Health via `fetchCompletedWorkouts()`. DTrain never writes to this data — it is a read-only view of what the athlete has actually done. Each entry includes discipline, duration, distance, heart rate data, and date.

This data is refreshed:

1. On app load (when `athleteProfile` is available)
2. On any plan change (swap, schedule update, profile modification)
3. On dashboard pull-to-refresh and SYNC button tap
4. Before coach interactions that reference workout history

## Agent Architecture: Message to Plan Mutation

When the athlete sends a message through the chat interface, here is the complete flow:

```
Athlete types: "I'm exhausted, take it easy this week"
          |
          v
+--------------------+
| ChatContext        |
| sendMessage()      |
+--------+-----------+
         |
         v
+--------------------+
| Agent Orchestrator |  processMessage(userMessage, context)
| agentOrchestrator  |
+--------+-----------+
         |
         |  1. Check for pending confirmation → no
         |  2. Build system prompt (identity + constraints + athlete context)
         |  3. Call runToolInference(systemPrompt, message, COACH_TOOLS)
         |
         v
+--------------------+
| Hammer 2.1 Model   |  Selects: adjust_load
| (llama.rn)         |  Args: { direction: "reduce", durationDays: 7 }
+--------+-----------+
         |
         v
+--------------------+
| Skill Executor     |  executeSkillPreview("adjustLoad", ...)
| skills/adjustLoad  |
+--------+-----------+
         |
         |  Computes: 20% volume reduction for 7 days
         |  Builds diff table: before/after weekly hours
         |  Returns: { diff: { table, summary }, pendingAction }
         |
         v
+--------------------+
| Agent Orchestrator |  Formats preview message
+--------+-----------+
         |
         v
"Here's what would change:
 Weekly hours: 10h → 8h (7 days)
 Focus: all disciplines reduced proportionally

 Shall I apply this?"
         |
         v
Athlete responds: "yes"
         |
         v
+--------------------+
| Agent Orchestrator |  handleConfirmation("yes", context)
+--------+-----------+
         |
         v
+--------------------+
| commitSkill()      |  Applies change
+--------+-----------+
         |
         |  1. Updates athleteProfile.athleteInsights
         |  2. Saves to AsyncStorage
         |  3. Calls context.onProfileUpdate(updatedProfile)
         |
         v
+--------------------+
| AppContext          |  setAthleteProfile(updatedProfile)
+--------+-----------+
         |
         |  React state update triggers:
         |  - phase useMemo recomputes
         |  - weekPlan useMemo recomputes
         |  - todayWorkout regenerates
         |  - All subscribed screens re-render
         |
         v
Dashboard, Weekly, Calendar, PlanSettings
all reflect the reduced training load
```

The critical property of this flow is that **plan mutations always go through AsyncStorage first, then React state**. This ensures persistence — if the app is killed between the AsyncStorage write and the state update, the change survives because the next app launch reads from AsyncStorage.

## Screen Data Flow

Every screen reads from the same React Context. There is no direct AsyncStorage access from screens — all data flows through `useApp()`:

```
AsyncStorage (on app load)
     |
     v
AppContext Provider
     |
     +-- athleteProfile -----> Dashboard (race info, phase)
     |                    +--> PlanSettings (edit profile)
     |                    +--> Weekly (weekly targets header)
     |                    +--> Calendar (plan overview)
     |
     +-- weekPlan -----------> Dashboard (today's discipline)
     |   (useMemo)        +--> Weekly (day-by-day view)
     |                    +--> Calendar (month view)
     |
     +-- todayWorkout -------> Dashboard (current workout card)
     |                    +--> Workout (detailed view + timer)
     |
     +-- completedWorkouts --> Dashboard (completion status)
     |                    +--> Weekly (check marks)
     |                    +--> Calendar (completed indicators)
     |
     +-- readinessScore -----> Dashboard (readiness gauge)
     |                    +--> Recovery (detailed health view)
     |
     +-- trends -------------> Recovery (trend charts)
     |                    +--> Chat (AI context for coaching)
     |
     +-- modelStatus --------> Chat (AI ready indicator)
                          +--> Dashboard (coach status)
```

The `useApp()` hook is the only way screens access this data. This ensures that when `athleteProfile` changes (from any source — onboarding, chat skill, plan settings), every screen that uses any derived value re-renders with fresh data. There is no stale state problem because there is no local caching at the screen level.

## How Plan Mutations Propagate

When a skill commits a change, the propagation is automatic through React's rendering model:

1. **Skill writes to AsyncStorage** — `AsyncStorage.setItem('athleteProfile', JSON.stringify(updated))`
2. **Skill calls `onProfileUpdate(updated)`** — a callback passed through context
3. **AppContext calls `setAthleteProfile(updated)`** — React state update
4. **`phase` recomputes** — `useMemo` depends on `athleteProfile.raceDate`
5. **`weekPlan` recomputes** — `useMemo` depends on `phase` and `athleteProfile`
6. **`todayWorkout` clears and regenerates** — depends on `weekPlan` and `completedWorkouts`
7. **All screens re-render** — every component using `useApp()` receives new values

This means a single profile change (e.g., moving the race date forward by two weeks) automatically cascades through every derived value and every screen. The training phase might shift from BUILD to PEAK, the weekly plan adjusts to match the new phase, today's workout changes to reflect the new training emphasis, and the dashboard, weekly view, and calendar all update — all from one `setAthleteProfile` call.

There is no manual refresh, no "pull to update," no stale cache invalidation. React's dependency tracking handles it.

## Training Heuristics Injection

DTrain's coaching knowledge is not hardcoded in prompt templates. It is defined as a structured knowledge section in `agentConstitution.js` (`COACH_KNOWLEDGE`) and injected into every system prompt.

The knowledge includes:

- **HR zone definitions**: Z1 through Z5 with percentage-of-LTHR ranges
- **HRV/RHR thresholds**: what constitutes elevated resting HR or depressed HRV
- **Phase rules**: what each training phase (BASE through RACE_WEEK) emphasizes
- **80/20 rule**: 80% of training volume should be at easy effort (Z1-Z2)
- **Recovery indicators**: when to suggest reduced load based on health data

This knowledge travels with every inference call. When the model generates a coaching response, it has access to these rules as part of its system prompt context. The model does not need to have memorized training science — it reads the rules from the prompt and applies them to the athlete's specific situation.

The advantage of this approach is that training heuristics can be updated without retraining the model. If we revise the HRV threshold from "below 20ms" to "below 25ms," we change a constant in `agentConstitution.js` and every subsequent model inference uses the new threshold. No model update, no new GGUF download, no app store submission.

## No Hardcoded Coaching

DTrain generates all coaching text from model inference. There are no template strings like `"Great job completing your ${discipline} workout!"` in the codebase. The model receives the computed data (workout completed, discipline, duration, how it compared to prescribed) and generates a natural response.

This is a deliberate architectural choice. Template strings feel robotic after the first few interactions — the athlete recognizes the pattern and stops reading them. Model-generated text varies naturally in phrasing, emphasis, and detail, which keeps the coaching interaction feeling fresh.

The tradeoff is that model-generated text is occasionally wrong, awkward, or needs sanitization. The `modelSanitizer.js` layer handles the worst cases (ChatML tokens, raw JSON, code fragments). For everything else, the model's output is good enough — not perfect, but noticeably more engaging than templates.

The one exception is error states and confirmation prompts ("Shall I apply this?", "No changes made."). These are hardcoded because they are functional UI text, not coaching conversation, and they must be reliable.

## Putting It Together

The architecture is designed around one principle: **the AI model is a tool selection and narration layer on top of deterministic training logic.** The model does not decide what workout to prescribe (code does that). The model does not calculate readiness scores (code does that). The model does not determine the training phase (code does that).

What the model does is listen to natural language, pick the right tool, and explain what the code decided. This keeps the system reliable — deterministic code produces deterministic results — while still feeling like a conversation with a knowledgeable coach.

The data model is intentionally simple: one source-of-truth profile, computed derived state, and read-only health data. All mutations go through the same pipeline: skill preview, athlete confirmation, AsyncStorage write, React state update, screen re-render. There are no shortcuts, no direct state mutations, no screen-level caches that can go stale.

The result is an app where the AI feels like it is managing your training plan, but the code is actually managing it, and the AI is just the interface. That distinction is invisible to the athlete — and that is the point.
