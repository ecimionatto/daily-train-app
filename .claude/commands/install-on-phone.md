# Install DailyTrain on iPhone

Build and install the app on a connected physical iPhone.

## Steps

1. Verify a physical iPhone is connected:
   ```bash
   xcrun xctrace list devices 2>&1 | grep -i iphone | grep -v Simulator
   ```

2. Run expo prebuild (regenerates native iOS project from app.json):
   ```bash
   LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
   ```

3. Patch ExpoAppleAuthentication Swift compilation error — add `@unknown default` cases to both switch statements in:
   `node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift`
   - `credentialStateToInt`: add `@unknown default: return 0` after `.transferred` case
   - `realUserStatusToInt`: add `@unknown default: return 1` after `.unsupported, .none` case

4. Build and install on the connected iPhone (replace DEVICE_UDID with the actual device ID from step 1):
   ```bash
   xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
     -destination 'id=DEVICE_UDID' -configuration Debug \
     -allowProvisioningUpdates build
   ```

5. If signing fails with "Personal Team" errors about Sign In with Apple or Push Notifications:
   - Open `ios/DailyTrain.xcworkspace` in Xcode
   - Select DailyTrain target > Signing & Capabilities
   - Remove "Sign In with Apple" and "Push Notifications" capabilities
   - Build again from Xcode (Cmd+R) with the iPhone selected

6. On the iPhone, trust the developer profile if prompted:
   Settings > General > VPN & Device Management > [developer email] > Trust

## Notes
- Requires Xcode and a connected iPhone
- Free Apple account: app expires after 7 days
- Paid Apple Developer account ($99/yr): permanent installs
- HealthKit only works on physical devices, not simulator
- Metro bundler must be running (`npm start`) for JS bundle to load
