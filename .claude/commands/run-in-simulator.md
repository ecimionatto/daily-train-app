# Run DTrain in iOS Simulator

Build and run the app in the iOS Simulator.

## Steps

1. Run expo prebuild (regenerates native iOS project from app.json):
   ```bash
   LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
   ```

2. Patch ExpoAppleAuthentication Swift compilation error — add `@unknown default` cases to both switch statements in:
   `node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift`
   - `credentialStateToInt`: add `@unknown default: return 0` after `.transferred` case
   - `realUserStatusToInt`: add `@unknown default: return 1` after `.unsupported, .none` case

3. Build for simulator (no code signing required):
   ```bash
   xcodebuild -workspace ios/DTrain.xcworkspace -scheme DTrain \
     -destination 'platform=iOS Simulator,name=iPhone 17' \
     CODE_SIGNING_ALLOWED=NO build 2>&1 | tail -5
   ```

4. Boot the simulator if not already running:
   ```bash
   xcrun simctl boot 'iPhone 17' 2>/dev/null || true
   open -a Simulator
   ```

5. Install the built app:
   ```bash
   xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/DTrain.app
   ```

6. Start Metro bundler (required for JS bundle):
   ```bash
   npx expo start --port 8081
   ```

7. Launch the app:
   ```bash
   xcrun simctl launch booted com.dailytrain.app
   ```

## Notes
- Apple Sign In doesn't work on simulator — use the "Dev Sign In (Simulator)" button
- HealthKit returns mock data on simulator
- Model download (1.3GB Qwen 3.5 2B) may fail on simulator — app works with rule-based fallback
- If "No bundle URL present" error appears, ensure Metro is running on port 8081
