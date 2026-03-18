# Install DailyTrain on iPhone

Build and install the app on a connected physical iPhone.

## Debug vs Release

| | Debug | Release |
|---|---|---|
| JS bundle | Loaded live from Metro over USB | Bundled & embedded in the .app |
| Cable required at runtime | Yes | No |
| Rebuild needed for JS changes | No (hot reload) | Yes |
| Use when | Developing | Running standalone |

**Default: Release** — so the app works without a cable or Mac running.

## Steps

1. Verify a physical iPhone is connected:
   ```bash
   xcrun xctrace list devices 2>&1 | grep -i iphone | grep -v Simulator
   ```

2. Run expo prebuild (regenerates native iOS project from app.json):
   ```bash
   LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
   ```
   The `withPersonalTeam` plugin automatically sets `DEVELOPMENT_TEAM` and strips unsupported entitlements.

3. Patch ExpoAppleAuthentication Swift compilation error — add `@unknown default` cases to both switch statements in:
   `node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift`
   - `credentialStateToInt`: add `@unknown default: return 0` after `.transferred` case
   - `realUserStatusToInt`: add `@unknown default: return 1` after `.unsupported, .none` case

4. **Release build + install** — JS bundle embedded, no cable required at runtime (replace DEVICE_UDID with the actual device ID from step 1):
   ```bash
   xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
     -destination 'id=DEVICE_UDID' -configuration Release \
     DEVELOPMENT_TEAM=J52KM8A8YH -allowProvisioningUpdates build

   # xcodebuild 'build' only builds — push .app to device explicitly:
   APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData/DailyTrain-*/Build/Products/Release-iphoneos -name "DailyTrain.app" -maxdepth 1 | head -1)
   xcrun devicectl device install app --device DEVICE_UDID "$APP_PATH"
   ```

   **Debug build** — use only when actively developing with hot reload (Metro must be running):
   ```bash
   xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
     -destination 'id=DEVICE_UDID' -configuration Debug \
     DEVELOPMENT_TEAM=J52KM8A8YH -allowProvisioningUpdates build
   ```

5. On the iPhone, trust the developer profile if prompted:
   Settings > General > VPN & Device Management > [developer email] > Trust

## Notes
- Requires Xcode and a connected iPhone with Developer Mode enabled
- Free Apple account (Personal Team J52KM8A8YH): app expires after 7 days
- Paid Apple Developer account ($99/yr): permanent installs
- HealthKit only works on physical devices, not simulator
- Release builds take longer (Hermes bundles + minifies JS) — expect 5-10 min extra
