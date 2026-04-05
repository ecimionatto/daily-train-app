# DTrain Training Heuristics v1.0

> Single source of truth for triathlon training science rules.
> Injected into the on-device AI agent's system prompt.
> Editable by coaches and athletes via pull request.

---

## Weekly Session Targets

Session counts by weekly volume tier. These are minimums for balanced triathlon development.

| Volume Tier | Swim | Bike | Run | Strength | Total Sessions | Minutes/Week |
|-------------|------|------|-----|----------|----------------|--------------|
| 5-7 hrs     | 2    | 2    | 3   | 0        | 7              | 300-420      |
| 8-10 hrs    | 3    | 3    | 3   | 1        | 10             | 480-600      |
| 11-14 hrs   | 3    | 3    | 4   | 1        | 11             | 660-840      |
| 15+ hrs     | 4    | 4    | 4   | 1        | 13             | 900+         |

- Two-a-day sessions (swim+bike, swim+run) count toward both disciplines.
- Brick sessions (bike-to-run) count toward both bike and run.
- 5-7 hr athletes drop strength; the slot goes to their weakest discipline.

---

## Key Workouts by Phase

Key workouts are non-negotiable for progression. Everything else is volume filler at Z1-Z2.

### BASE Phase

Build aerobic capacity. Volume increases up to 8% per week. No intensity above Z2.

| Discipline | Key Workout              | Zone Target | Focus                              |
|------------|--------------------------|-------------|------------------------------------|
| Swim       | Long steady swim         | Z2          | Technique and aerobic endurance    |
| Bike       | Long aerobic ride        | Z2          | Aerobic base, fat oxidation        |
| Run        | Long easy run (Sunday)   | Z1-Z2       | Musculoskeletal adaptation         |
| Strength   | Max strength (heavy)     | N/A         | Squat 4x5, RDL 4x5, row 3x5, Bulgarian split squat 3x6/side, dead bug 3x8/side |

### BUILD Phase

Introduce threshold and interval work. Volume stabilizes, intensity increases.

| Discipline | Key Workout              | Zone Target | Focus                              |
|------------|--------------------------|-------------|------------------------------------|
| Swim       | Threshold intervals      | Z3-Z4       | 6x200m at threshold, 20s rest      |
| Bike       | Tempo/threshold ride     | Z3-Z4       | Sustained power at lactate threshold|
| Run        | Tempo run or intervals   | Z3-Z4       | Lactate clearance, race pace       |
| Strength   | Power/explosive          | N/A         | Jump squat 3x5, hang clean 4x3, SL deadlift 3x6/side, box jump 3x5, Pallof press 3x10/side |

### PEAK Phase

Race-specific intensity. Volume begins to taper. Sharpen fitness.

| Discipline | Key Workout              | Zone Target | Focus                              |
|------------|--------------------------|-------------|------------------------------------|
| Swim       | Race-pace intervals      | Z4          | Goal pace rehearsal                |
| Bike       | Race simulation          | Z4          | Sustained race-pace effort         |
| Run        | Race-pace tempo          | Z4          | Goal pace, mental rehearsal        |
| Strength   | Maintenance only         | N/A         | Goblet squat 3x5, SL RDL 3x6/side, plank 3x30s, calf raise 3x8 |

### TAPER Phase

Volume drops 40-60%. Maintain intensity with reduced load. 14-21 days before race.

| Discipline | Key Workout              | Zone Target | Focus                              |
|------------|--------------------------|-------------|------------------------------------|
| Swim       | Short race-pace openers  | Z3-Z4       | Neuromuscular sharpening           |
| Bike       | Short openers with surges| Z3-Z4       | Keep legs sharp, no fatigue        |
| Run        | Strides and openers      | Z3-Z4       | Turnover, confidence               |
| Strength   | Reduced maintenance      | N/A         | 30 min cap, same exercises at lighter load |

### RACE_WEEK Phase

Minimal volume (30% or less). Rest and activation only.

| Discipline | Key Workout              | Zone Target | Focus                              |
|------------|--------------------------|-------------|------------------------------------|
| Swim       | Easy technique swim      | Z1-Z2       | Feel for the water, no fatigue     |
| Bike       | Short spin               | Z1          | Keep legs loose                    |
| Run        | Short shakeout + strides | Z1-Z2       | Activation, not fitness            |
| Strength   | None                     | N/A         | Full rest from strength work       |

---

## Intensity Distribution (80/20 Rule)

This is a **session count** distribution, not a time split.

- **80% of weekly sessions** are easy: Z1-Z2 aerobic work.
- **20% of weekly sessions** are hard: Z3-Z5 intensity work.
- Maximum **1 hard session per discipline per week**. All other sessions of that discipline are Z1-Z2.
- **Never raise volume AND intensity in the same week.** Pick one.
- Example: 10 sessions/week = 8 easy + 2 hard (e.g., 1 threshold swim + 1 tempo run).

---

## Periodization Cycle

- **3 build weeks followed by 1 deload week** (4-week mesocycle).
- Deload week: **30-40% volume reduction**, maintain session frequency, cut duration and intensity.
- Deload intensity: Z1-Z2 only. No double sessions. No intervals.
- Volume increase during build weeks: max **8% per week** (BASE phase).
- Never skip the deload — cumulative fatigue leads to injury and plateau.

---

## Recovery Rules (HRV/RHR Driven)

All thresholds are relative to the athlete's personal baseline.

### HRV-Based Adjustments

| HRV vs Baseline  | Action                            | Zone Adjustment       |
|-------------------|-----------------------------------|-----------------------|
| > +10%            | Upgrade: add intensity or volume  | Up to planned max zone|
| +/-10% (normal)   | Execute as planned                | No change             |
| -5% to -10%       | Drop 1 zone from planned workout  | Max Z2                |
| -10% to -15%      | Easy session, 20% shorter         | Z1-Z2 only            |
| > -15% + RHR up   | Rest day                          | No training           |
| 3+ days declining | Trigger light week (mini deload)  | Z1-Z2, reduced volume |

### RHR-Based Adjustments

| RHR vs Baseline   | Action                            |
|--------------------|-----------------------------------|
| +3 to +5 bpm      | Moderate sessions only (Z1-Z2)    |
| +5 to +10 bpm     | No intensity work, easy only      |
| > +10 bpm         | Rest day, monitor for illness     |

### Combined Signals

When HRV and RHR both indicate stress, always take the more conservative action. A single bad night of sleep can skew readings; look at 3-day rolling trends before making structural changes.

---

## Session Duration by Volume Tier

Base session duration in minutes, before phase multiplier is applied.

| Volume Tier | Swim | Bike | Run  | Strength |
|-------------|------|------|------|----------|
| 5-7 hrs     | 40   | 55   | 45   | 30       |
| 8-10 hrs    | 50   | 70   | 55   | 40       |
| 11-14 hrs   | 55   | 85   | 65   | 45       |
| 15+ hrs     | 60   | 100  | 75   | 45       |

### Phase Multipliers

These multiply the base session duration above.

| Phase      | Volume Multiplier | Max Zone |
|------------|-------------------|----------|
| BASE       | 0.9x              | Z2       |
| BUILD      | 1.0x              | Z4       |
| PEAK       | 1.1x              | Z5       |
| TAPER      | 0.7x              | Z4       |
| RACE_WEEK  | 0.4x              | Z2       |

Example: An 8-10 hr athlete in BUILD phase has a base run duration of 55 min x 1.0 = 55 min.

---

## Consistency Targets

Weekly workout compliance measured as (completed sessions / prescribed sessions) x 100.

| Status | Compliance | Meaning                                    |
|--------|------------|--------------------------------------------|
| Green  | >= 85%     | On track. Maintain current plan.           |
| Yellow | 70-84%     | Falling behind. Coach flags and encourages.|
| Red    | < 70%      | Plan at risk. Coach suggests adjustments.  |

A missed key workout (see Key Workouts by Phase) weighs more than a missed filler session. If the key workout for a discipline is missed two weeks in a row, the coach should prioritize rescheduling it.

---

## Constraints

These rules are non-negotiable and must never be violated by the plan generator or coach.

1. **No consecutive same-discipline days.** The same single discipline must not appear on back-to-back days, unless the prior day was a brick/combo session.

2. **Strength stacks with hard interval day (High-Low model).** Strength is always scheduled on the same day as the hardest interval session, with at least 6 hours between them (sport session AM, strength PM). Never schedule strength on long ride or long run days.

3. **Weekend long session.** One weekend day is a long session. The athlete chooses the order via `weekendPreference`:
   - `bike-sat-run-sun`: Saturday = long bike or brick, Sunday = long run.
   - `run-sat-bike-sun`: Saturday = long run, Sunday = long bike or brick.

4. **Two-a-day rules.** Two-a-day sessions are swim + another discipline:
   - AM: swim (may be moderate, up to Z3).
   - PM: easy bike or run (must be Z1-Z2 only).
   - Minimum 4 hours between sessions.
   - Total daily load must not exceed 150% of a single session.
   - Never two hard sessions on the same day.

5. **Brick sessions.** A bike-to-run brick counts toward both bike and run session targets. Transition time should be minimized (under 5 minutes) to simulate race conditions.

6. **Swim day preferences.** Athletes select their swim days during onboarding:
   - `mwf`: Monday, Wednesday, Friday.
   - `tts`: Tuesday, Thursday, Saturday.

7. **Mandatory rest day.** At least 1 full rest day per week. Rest days are configurable via `schedulePreferences.restDays`.

8. **Strength never on weekends.** Strength sessions are weekday only. Never on Saturday or Sunday.

9. **Strength never to failure.** Always stop with 1-2 reps in reserve. Focus: single-leg stability, tendon stiffness, core anti-rotation.

10. **Injury protocol.** If the athlete reports an injury, prescribe 3 days of rest for that discipline, then reassess. Cross-training in non-affected disciplines is encouraged.

---

## HR Zone Definitions

For reference, heart rate zones are defined as percentage of max HR:

| Zone | % Max HR  | Name        | Usage                                     |
|------|-----------|-------------|-------------------------------------------|
| Z1   | < 65%     | Recovery    | Warmup, cooldown, recovery sessions       |
| Z2   | 65-75%    | Aerobic     | Base building, majority of weekly volume   |
| Z3   | 76-82%    | Tempo       | Threshold work, max 1 session per week     |
| Z4   | 83-89%    | Threshold   | Intervals, requires readiness > 70         |
| Z5   | >= 90%    | VO2max      | BUILD and PEAK phases only, short efforts  |

---

## Taper Timeline

| Days to Race | Action                                          |
|--------------|-------------------------------------------------|
| 21-14 days   | Begin taper: reduce volume 40-60%, keep intensity|
| 7 days       | Openers only: short race-pace efforts            |
| 2-3 days     | Rest or very easy activation                     |
| Race day     | Execute race plan                                |

---

*Last updated: 2026-04-05 | Version 1.0*
