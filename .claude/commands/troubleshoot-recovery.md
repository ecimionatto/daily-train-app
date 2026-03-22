# Troubleshoot DailyTrain Recovery Screen

Diagnose and fix issues with the recovery/dashboard screen — readiness score, HRV, RHR, sleep data, and completion tracking.

## Architecture

Health data flows: Apple Watch → Apple Health → `services/healthKit.js` → `context/AppContext.js` → `screens/DashboardScreen.js`

Key functions:
- `fetchHealthData()` → returns `{ restingHR, hrv, sleepHours, vo2Max }`
- `calculateReadiness(data)` → returns 0-100 score
- `loadCompletedWorkouts()` → fetches workout history from HealthKit
- The readiness card only renders when `displayScore !== null`

## Issue: RHR or HRV showing `--`

### Step 1 — Run the in-app diagnostic
In the Dashboard, scroll to **Recent Activity** and tap the **DIAGNOSE** button. An alert shows raw results from four HealthKit queries. Look for:
- `err=null` + `count>0` + `first=<number>` → API works, bug is in read path
- `err=null` + `count=0` → No data in Apple Health (see Step 3)
- `err!=null` → HealthKit permission not granted (see Step 2)

### Step 2 — Check HealthKit permissions
```
Settings → Health → Data Access & Devices → DailyTrain
```
Ensure these are toggled ON:
- Heart Rate
- Heart Rate Variability (HRV)
- Resting Heart Rate
- Sleep Analysis
- Workouts

If the app is not listed, it hasn't requested permissions yet. Open DailyTrain and pull-to-refresh the dashboard.

### Step 3 — Verify Apple Health has the data
```
Health app → Browse → Heart → Resting Heart Rate
Health app → Browse → Heart → Heart Rate Variability (HRV)
```
- RHR is a **daily aggregate** written by Apple Watch overnight. If the watch wasn't worn during sleep, there's no RHR for that day.
- HRV (RMSSD) is measured during sleep. Requires Apple Watch to be worn and charging at night.
- Look back window: 60 days. If no data exists in Apple Health for 60 days, both show `--`.

### Step 4 — Check the HealthKit API call in code
```bash
grep -n "getRestingHeartRateSamples\|getHeartRateVariability" services/healthKit.js
```
Current approach:
- RHR: `getRestingHeartRateSamples` with `{ startDate: 60d ago, limit: 1, ascending: false }`
- HRV: `getHeartRateVariabilitySamples` with `{ startDate: 30d ago, limit: 1, ascending: false }`

If the diagnostic shows `count>0` but `first=undefined`, the data field name has changed. Check the raw `data` object in the alert and update the field accessor in `getRestingHeartRate()`.

### Step 5 — Check readiness card visibility
The readiness card (containing RHR/HRV metrics) only renders when `displayScore !== null`:
```js
const displayScore = overallReadiness?.overall ?? readinessScore;
```
If `fetchHealthData()` returns `null` (HealthKit init failed), `readinessScore` is `null` and the whole card is hidden. Check AppContext logs for `[HealthKit] Init failed`.

## Issue: Completion check incorrect (e.g., brick shows ✓ when only run done)

The calendar completion logic:
- **Green ✓** = completed as prescribed (matching discipline)
- **Orange ~** = partial (for brick: only bike or only run done; for others: wrong discipline completed)
- **—** = missed (past day, no workout)

For brick specifically: completion requires **both** a cycling workout AND a running workout on the same day in Apple Health.

Discipline matching logic is in `getCompletionStatus()` in `screens/CalendarScreen.js`. The mapping:
```
swim → 'swim' or 'swimming'
bike → 'bike', 'cycling', 'cycling_indoor', 'indoor_cycling'
run  → 'run', 'running', 'outdoor_run', 'indoor_run'
brick → bike match AND run match on same day
```

If Apple Health uses a different activity type string, add it to the mapping in `getCompletionStatus()`.

## Issue: Readiness card not appearing at all

1. `fetchHealthData()` returned `null` → HealthKit init failed. Check that `NSHealthShareUsageDescription` is in `app.json` and the app was rebuilt after adding it.
2. `calculateReadiness(data)` returned `null` → `data` was `null`. Same as above.
3. `overallReadiness` and `readinessScore` both `null` → loadHealthData hasn't completed yet. Pull-to-refresh the dashboard.

## Issue: Sleep data missing

`getSleepAnalysis()` checks for samples where `s.value === 'ASLEEP' || s.value === 'INBED'`. On iOS 16+, Apple Health may use stage-specific values (`HKCategoryValueSleepAnalysisAsleepCore`, etc.). If sleep always shows `--`:
```bash
# Check what value strings the library returns
grep -n "ASLEEP\|INBED\|sleep" services/healthKit.js
```
Fix: add `'ASLEEP_CORE'`, `'ASLEEP_DEEP'`, `'ASLEEP_REM'`, `'ASLEEP_UNSPECIFIED'` to the sleep value check.

## Diagnostic Commands

```bash
# Check HealthKit service
grep -n "getRestingHeartRate\|getHRV\|getSleep" services/healthKit.js

# Check readiness calculation
grep -n "calculateReadiness\|displayScore\|readinessCard" screens/DashboardScreen.js

# Check completion logic
grep -n "getCompletionStatus\|completed\|brick" screens/CalendarScreen.js

# Run tests
npm test

# Run lint
npm run lint
```
