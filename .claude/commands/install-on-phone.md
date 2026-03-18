# Install DailyTrain on iPhone

Fully build and install DailyTrain as a Release build on a connected iPhone.
The Release build embeds the JS bundle — no cable or Metro required after install.

## Steps

Execute these steps in order. Do not skip any step.

### 1. Detect connected iPhone
```bash
xcrun xctrace list devices 2>&1 | grep -i iphone | grep -v Simulator
```
Extract the UDID (format: `00008140-001A543814E2801C`) from the physical device line.
If no physical device is found, stop and ask the user to connect their iPhone.

### 2. Expo prebuild
```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
```
The `withPersonalTeam` plugin automatically sets `DEVELOPMENT_TEAM=J52KM8A8YH` and strips unsupported entitlements.

### 3. Patch ExpoAppleAuthentication
Check if already patched:
```bash
grep "@unknown default" node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift
```
If the grep returns 0 matches, apply the patch — add `@unknown default` cases to both switch statements in `node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift`:
- `credentialStateToInt`: add `@unknown default: return 0` after the `.transferred` case
- `realUserStatusToInt`: add `@unknown default: return 1` after the `.unsupported, .none` case

If grep already shows `@unknown default` entries, skip this step.

### 4. Release build
```bash
xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
  -destination 'id=DEVICE_UDID' -configuration Release \
  DEVELOPMENT_TEAM=J52KM8A8YH -allowProvisioningUpdates build 2>&1 | \
  grep -E "error:|BUILD SUCCEEDED|BUILD FAILED|Bundle React Native"
```
Replace `DEVICE_UDID` with the UDID from step 1.
Must see `Bundle React Native code and images` and `BUILD SUCCEEDED`. If `BUILD FAILED`, stop and report errors.

### 5. Install on device
`xcodebuild build` only compiles — it does NOT push to the iPhone. Install explicitly:
```bash
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData/DailyTrain-*/Build/Products/Release-iphoneos -name "DailyTrain.app" -maxdepth 1 | head -1)
echo "Installing: $APP_PATH"
ls "$APP_PATH/main.jsbundle" && echo "Bundle present" || echo "ERROR: Bundle missing"
xcrun devicectl device install app --device DEVICE_UDID "$APP_PATH"
```
Replace `DEVICE_UDID` with the UDID from step 1.
Must see `App installed` and `bundleID: com.dailytrain.app`.

### 6. Trust profile (if needed)
If the iPhone shows an "Untrusted Developer" alert:
> Settings → General → VPN & Device Management → [developer email] → Trust

## Notes
- Free Apple account (Personal Team J52KM8A8YH): app expires after 7 days, rebuild to renew
- Debug builds (for hot reload development) skip steps 3-5 and use `-configuration Debug`; Metro must be running via `npm start`
- HealthKit only works on physical devices, not simulator
- Release builds take 5-10 min longer than Debug (Hermes bundles + minifies JS)
