# Review Coach Response Consistency

Audit the AI coach pipeline in `services/chatService.js` and `services/localModel.js` for consistency bugs, then fix every issue found. This skill is the main tool for keeping coach responses accurate and coherent.

## What to audit

### 1. Data fabrication — coach invents numbers not in the system prompt

Read `buildCoachSystemPrompt()` and map exactly which fields are injected:
- Athlete profile fields (race type, distance, level, weekly hours, strongest/weakest discipline, injuries, goal time)
- Current status (phase, readiness score, days to race, today's workout — only if `discipline !== 'rest'`)
- Health data (HRV, resting HR, sleep hours, VO2max) when present
- Yesterday's performance breakdown
- Recent workout history (last 7 sessions, each showing discipline + duration + avgHeartRate + effortScore + pace + date)
- Athlete insights (mood, pain points, load adjustments, discipline focus)
- Coaching knowledge section (HR zones, HRV rules, RHR rules, periodization, taper, 80/20)
- Conversation summary (last 4 messages, capped at 120 chars)
- Constraints (150-word cap, PLAN ADAPTATION, FUTURE WORKOUTS, no fabricated stats)

Check that no field name, number, or claim in the coach system prompt is derived from outside these injected fields. Any reference to a specific number (bpm, duration, date, percentage) that has no source in the injected data is a fabrication bug.

### 2. 80/20 rule misstatement

The 80/20 rule means: **80% of training volume should be Zone 2 (aerobic), 20% hard (Zone 3-5)**. It does NOT mean "80% recovery, 20% training." Grep for the 80/20 string in the system prompt and confirm the wording is unambiguous. If the model can misread it, rewrite it.

### 3. FUTURE WORKOUTS constraint effectiveness

Read the `FUTURE WORKOUTS` rule injected by `buildCoachSystemPrompt()`. Confirm:
- It explicitly says "NEVER invent or describe specific workouts for tomorrow or future days"
- It provides a concrete fallback phrase the model can use ("tomorrow's workout will be generated based on your recovery")
- It is placed in the final constraints section (after all data, so it is close to the inference call)

If the rule is weak or ambiguous, rewrite it to be more directive.

### 4. Rest day consistency

Confirm that:
- `buildCoachSystemPrompt` formats rest days as `Rest Day (recovery — no training)` with no duration
- `sanitizeWorkout()` in `localModel.js` clamps `duration` to 0 whenever `discipline === 'rest'`
- The rule-based `buildWorkout('rest', ...)` template also sets `duration: 0`

### 5. Heart rate data path

Trace `avgHeartRate` from `fetchHeartRateForWorkout()` through `enrichWorkoutWithDetails()` to the system prompt line `avg ${w.avgHeartRate}bpm`. Confirm:
- The exercise floor filter (`EXERCISE_FLOOR_BPM = 100`) is applied before averaging
- The fallback (all samples) only fires when no samples clear the floor
- The `maxHeartRate` field is also available in the system prompt (add it if missing)

### 6. Self-contradiction within a single response

This occurs when the model output contains two incompatible statements in one message (e.g., prescribing two different workouts for tomorrow, or saying both "your HRV is fine" and "reduce your intensity"). This is a prompt-length / temperature issue. Check:
- Is `n_predict` set high enough (≥512) so the model doesn't truncate mid-thought?
- Is `temperature` set conservatively (≤0.7)?
- Does the system prompt word count (estimate: chars/4) fit comfortably inside `n_ctx` with space for the user prompt and response?

### 7. Word count constraint

The system prompt says "Keep responses under 150 words." Verify this instruction is present and that it is the last line before `return sections.join('\n\n')`. Instructions near the end of a system prompt have stronger effect on small models.

### 8. classifyMessage coverage gaps

Review the keyword lists in `classifyMessage()` for these categories:
- `load_adjustment` — does it cover natural expressions like "I'm exhausted", "I'm burned out", "feeling destroyed", "dead legs"?
- `profile_change` — does it cover "my race is next month", "I pushed my race", "I cancelled my race"?

For each gap found, add the missing keywords.

## How to run this audit

```bash
# Read the full system prompt builder
grep -n "sections.push" services/chatService.js

# Estimate system prompt token budget
node -e "
const fs = require('fs');
const src = fs.readFileSync('services/chatService.js', 'utf8');
const match = src.match(/export function buildCoachSystemPrompt[\s\S]*?^}/m);
console.log('buildCoachSystemPrompt ~lines:', match ? match[0].split('\n').length : 'not found');
"

# Check n_ctx and temperature
grep -n "n_ctx\|temperature\|n_predict" services/localModel.js

# Find all system prompt sections
grep -n 'sections.push' services/chatService.js

# Check sanitizeWorkout
grep -n "sanitizeWorkout\|discipline.*rest\|rest.*duration" services/localModel.js

# Check HR floor
grep -n "EXERCISE_FLOOR\|exerciseValues\|allValues" services/healthKit.js

# Check 80/20 rule wording
grep -n "80/20\|80%" services/chatService.js
```

## Fix protocol

For each issue found:
1. Edit the source file directly — do not leave issues as comments or TODOs
2. Run `npm run lint` after each file change
3. Run `npm test` after all changes
4. All 267+ tests must pass with 0 lint warnings before committing
5. Commit with message: `fix: coach consistency — <summary of issues fixed>`

## Known past issues (already fixed — do not re-introduce)

- Coach called athlete "Coach" — fixed by using athlete name from profile
- "70-minute rest day" — fixed by `sanitizeWorkout()` + prompt formatting
- HR reported as 87bpm instead of ~140bpm — fixed by `EXERCISE_FLOOR_BPM = 100`
- "Context is full" crash — fixed by `n_ctx: 4096` + condensed coaching knowledge
- Tomorrow's conflicting workouts — fixed by `FUTURE WORKOUTS` constraint
- Workout history wrong order — fixed by sorting `completedWorkouts` chronologically
- Empty `completedWorkouts` array not falling back to `workoutHistory` — fixed with `?.length` check
