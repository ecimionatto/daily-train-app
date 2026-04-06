---
layout: default
title: "Why We Ditched the Daily Training Calendar"
---

# Why We Ditched the Daily Training Calendar

*How DTrain replaced rigid daily plans with weekly workout targets that adapt to how athletes actually live.*

## The Calendar Problem

Open any triathlon training app — TrainingPeaks, TrainerRoad, Garmin Coach, 80/20 Endurance — and you will see the same thing: a calendar grid with specific workouts assigned to specific days. Monday is a swim. Tuesday is an easy run. Wednesday is a bike interval session. Thursday is another swim. It looks organized. It looks like a plan. And for most age-group triathletes, it falls apart within the first week.

The problem is not the training science. The prescribed workouts are usually well-designed. The problem is the assumption that an adult with a job, a family, and unpredictable life events can reliably train at 6 AM on Tuesday, get to the pool at noon on Thursday, and block three hours for a long bike ride on Saturday morning.

Real athletes train when they can. The pool is closed Monday so they swim Wednesday. They have a work dinner Thursday so they run Friday instead. The kids are sick Saturday so the long ride moves to Sunday, but now Sunday's long run moves to... where? By mid-week, the rigid plan is out of sync with reality. The athlete either ignores the plan (and feels guilty), manually rearranges everything (and spends more time planning than training), or gives up and just does whatever feels right (and loses the structure entirely).

Every coach knows this. Ask any experienced triathlon coach how they handle athletes who miss days, and they will say some version of: "The specific day doesn't matter. What matters is hitting the right mix of workouts each week." The calendar is a constraint that coaches use for planning convenience, not because Monday versus Wednesday makes a physiological difference for an easy swim.

## DTrain's Approach: Weekly Targets

DTrain does not assign workouts to specific days. Instead, it computes **weekly targets** — the set of workouts the athlete needs to complete this week to stay on track for their race.

For a typical Ironman athlete in the BUILD phase, the weekly targets might be:

- 3 swim sessions (2 easy, 1 hard)
- 3 bike sessions (2 easy, 1 hard)
- 3 run sessions (2 easy, 1 hard)
- 1 strength session (stacked with a hard day)

The athlete sees these as a checklist, not a calendar. They check off workouts as they complete them, in whatever order life permits. The AI coach generates the specific workout (intervals, zones, duration) when the athlete is ready to train, not days in advance.

This is not a new training philosophy. It is how most coaches actually operate — they care about weekly volume, discipline balance, and hard/easy distribution, not which specific day each session falls on. DTrain just encodes that reality into software instead of pretending the calendar is gospel.

## Consistency Percentage

The primary metric in DTrain is **consistency** — the percentage of prescribed weekly workouts the athlete actually completes. This is computed from Apple Health data: the app reads completed swim, bike, and run workouts from HealthKit and matches them against the week's targets.

An athlete who completes 8 out of 10 prescribed sessions scores 80% consistency. The dashboard shows this as a simple visual indicator:

- **85%+**: Green. The athlete is on track. No adjustments needed.
- **70-84%**: Yellow. Mild concern. The AI coach may suggest reducing volume.
- **Below 70%**: Red. The coach proactively asks what is going on and offers to adjust the plan.

This replaces the demoralizing red X that calendar-based apps show when you miss a specific day. Missing Tuesday's swim is not a failure — it is a data point. The question is not "did you follow the calendar?" but "are you getting enough training stimulus this week?"

The psychological difference is significant. Calendar compliance creates a pass/fail mindset where a single missed day feels like a setback. Consistency percentage creates a continuous progress mindset where every completed workout moves the needle, regardless of when it happened.

## Smart Discipline Selection

When the athlete opens DTrain and says "I'm ready to train," the AI coach does not just pull the next item off a calendar. It evaluates what is remaining this week, what the athlete has already completed, and what their current recovery status supports.

The selection logic considers:

1. **Remaining weekly targets**: If the athlete has completed all three bike sessions but still owes two swims, the coach suggests a swim — regardless of what day it is.
2. **Hard/easy distribution**: If the last two sessions were hard intervals, the next session should be easy. The 80/20 rule (80% easy, 20% hard) is enforced at the weekly level.
3. **Recovery status**: Readiness score, computed from HRV, resting HR, and sleep data from Apple Health. Low readiness shifts the suggestion toward easier workouts or rest.
4. **Time since last session in each discipline**: If the athlete has not swum in 5 days but ran yesterday, swim takes priority — not because the calendar says so, but because discipline balance matters for triathlon preparation.
5. **Training phase**: During TAPER, the coach reduces volume and shifts toward shorter, sharper sessions. During BASE, it favors longer easy efforts. The phase rules override individual session preferences.

This is computed deterministically by the app's training logic. The AI model does not decide the discipline — code computes the optimal choice, and the model narrates why. "You've got your three bike sessions done this week but still owe two swims. Let's get in the pool today."

## 30-Day History Analysis

When a new athlete sets up DTrain, the app reads 30 days of workout history from Apple Health. This is not just for display — it drives the initial plan calibration.

The analysis extracts:

- **Actual weekly volume** per discipline (not what a plan prescribed, but what the athlete actually did)
- **Typical training days** (does this athlete train on weekdays, weekends, or both?)
- **Session duration patterns** (45-minute runs or 90-minute runs?)
- **Hard/easy distribution** (are they doing too much intensity?)
- **Consistency patterns** (do they train 3 days a week or 6?)

This data initializes the athlete's profile with realistic targets. If the athlete has been running three times a week for 45 minutes, DTrain does not prescribe five 60-minute runs. It starts with what the athlete is actually doing and gradually adjusts toward the race goal.

The 30-day analysis also feeds the AI coach's first conversation. Instead of generic onboarding questions, the coach can say: "I can see you've been averaging 3 runs and 2 bikes per week, with most sessions around 45-50 minutes. Let's build from there." This makes the first interaction feel personalized rather than robotic.

## Schedule Preferences, Not Schedule Requirements

Athletes do have preferences. Some prefer long bikes on Saturday and long runs on Sunday. Others want it the other way around. Some can only swim on Monday/Wednesday/Friday because that is when their pool offers lane swimming.

DTrain captures these as **preferences**, not requirements:

- **Weekend long session order**: bike-Saturday/run-Sunday or run-Saturday/bike-Sunday
- **Swim day pattern**: Monday/Wednesday/Friday or Tuesday/Thursday/Saturday

These preferences influence the AI's suggestions but do not create rigid assignments. If the athlete set bike-Saturday but trained on a Sunday instead, there is no red X. The weekly target still got completed, and that is what matters.

The preferences are stored in `athleteProfile.schedulePreferences` and the athlete can change them anytime through the coach chat ("move my swims to Tuesday Thursday Saturday") or the plan settings screen. The AI coach processes these changes through the `set_schedule` tool, shows a preview of the new weekly layout, and applies it after confirmation.

## Adapting the Plan to Life

The core philosophy is simple: **the plan adapts to the athlete's life, not the other way around.** A missed Monday swim does not cascade into a week of rescheduling. An unexpectedly free Wednesday afternoon becomes an opportunity to knock out a workout that would otherwise wait until the weekend. A tough work week that limits training to four sessions instead of six is not a failure — it is an 80% consistency week, and the AI adjusts next week's targets accordingly.

This is what makes DTrain fundamentally different from calendar-based training apps. It acknowledges that age-group triathletes are not professional athletes with controlled schedules. They are real people who train around everything else in their lives. The training app should support that reality, not pretend it does not exist.

The training science supports this approach. Adaptations happen over weeks and months, not on specific calendar days. Whether you swim on Monday or Wednesday makes zero physiological difference if the weekly stimulus is the same. What matters is consistency over time — and the best way to achieve consistency is to remove the friction that makes athletes abandon their plans.
