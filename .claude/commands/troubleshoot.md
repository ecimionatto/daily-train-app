# Troubleshoot DailyTrain Build Issues

Diagnose and fix common build, signing, and runtime errors.

## Common Issues

### 1. "Signing requires a development team"
- The `withPersonalTeam.js` plugin should set `DEVELOPMENT_TEAM=J52KM8A8YH` automatically during prebuild
- Verify: `grep DEVELOPMENT_TEAM ios/DailyTrain.xcodeproj/project.pbxproj`
- Fix: re-run `LANG=en_US.UTF-8 npx expo prebuild --platform ios --clean`
- Belt-and-suspenders: pass `DEVELOPMENT_TEAM=J52KM8A8YH` to xcodebuild

### 2. Unsupported entitlements (Personal Team)
These capabilities are NOT supported on free accounts and must not appear in entitlements:
- `aps-environment` (Push Notifications)
- `com.apple.developer.applesignin` (Sign In with Apple)
- `com.apple.developer.kernel.extended-virtual-addressing` (Extended Virtual Addressing)

Check: `cat ios/DailyTrain/DailyTrain.entitlements`
Fix: the `withPersonalTeam.js` plugin strips these. Re-run prebuild if they reappear.

### 3. ExpoAppleAuthentication Swift compilation error
After every prebuild, add `@unknown default` cases to switch statements in:
`node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift`
- `credentialStateToInt`: add `@unknown default: return 0` after `.transferred` case
- `realUserStatusToInt`: add `@unknown default: return 1` after `.unsupported, .none` case

### 4. CocoaPods encoding error (`Encoding::CompatibilityError`)
Fix: `export LANG=en_US.UTF-8 && export LC_ALL=en_US.UTF-8` before running prebuild.

### 5. Metro bundler "port in use"
```bash
lsof -ti:8081 | xargs kill -9
npm start
```

### 6. iPhone not showing as build destination
- Ensure Developer Mode is enabled: Settings > Privacy & Security > Developer Mode
- Ensure the device is trusted: unplug and replug, tap "Trust" on the phone
- Open Xcode (`open ios/DailyTrain.xcworkspace`) and let it pair with the device

### 7. App crashes on launch (no JS bundle)
- Ensure Metro bundler is running (`npm start`)
- Ensure the phone and Mac are on the same Wi-Fi network
- Check Metro console for bundle errors

### 8. HealthKit returns no data
- HealthKit only works on physical devices, not simulator
- Check that Health permissions were granted in Settings > Health > Data Access
- Call `loadCompletedWorkouts()` to refresh data from Apple Health

### 9. AI model not loading
- The Qwen 3.5 2B GGUF model (~1.5GB) must be downloaded to the device
- Check available storage on the device
- The `increased-memory-limit` entitlement allows loading large models

## Diagnostic Commands

```bash
# Check signing configuration
grep -E 'DEVELOPMENT_TEAM|CODE_SIGN' ios/DailyTrain.xcodeproj/project.pbxproj

# Check entitlements
cat ios/DailyTrain/DailyTrain.entitlements

# List connected devices
xcrun xctrace list devices 2>&1 | grep -i iphone | grep -v Simulator

# Check Metro status
lsof -i:8081

# Run tests
npm test

# Check lint
npm run lint
```
