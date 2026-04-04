---
name: publish-to-appstore
description: Build and publish DailyTrain to the App Store. Use this skill whenever the user asks to publish, submit, release, or upload the app to the App Store, App Store Connect, or TestFlight. Also use it when the user says "send to Apple", "release the app", or "submit for review".
---

# Publish DailyTrain to the App Store

End-to-end workflow: test → version bump → prebuild → archive → export → upload.

## Config

- **Team ID:** `J52KM8A8YH` (paid Apple Developer account — has Apple Distribution certificate)
- **Apple ID:** `ecimio@icloud.com`
- **Bundle ID:** `com.dailytrain.app`
- **ExportOptions.plist:** must exist at project root (see step 5)

---

## Steps

Execute in order. Stop and report on any failure.

### 1. Tests and lint

```bash
npm test -- --no-coverage && npm run lint
```

All 315 tests must pass. Zero lint warnings. Fix any failures before proceeding.

### 2. Bump build number

Read the current `buildNumber` from `app.json` → increment by 1 → write it back using the Edit tool.
Note the new build number — you'll need it for the commit message in step 9.

### 3. Expo prebuild

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
```

This regenerates the `ios/` directory from `app.json`. Wait for CocoaPods to finish.

### 4. Patch ExpoAppleAuthentication

```bash
grep "@unknown default" node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift | wc -l
```

If the result is **less than 2**, patch the file — add `@unknown default` cases to both switch statements in `node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift`:
- `credentialStateToInt`: add `@unknown default: return 0` after the `.transferred` case
- `realUserStatusToInt`: add `@unknown default: return 1` after the `.unsupported, .none` case

If the result is 2 or more, skip this step.

### 5. Ensure ExportOptions.plist exists

Check for `ExportOptions.plist` at the project root. If missing, create it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>J52KM8A8YH</string>
  <key>uploadSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
```

> Note: `method` must be `app-store-connect` — the old value `app-store` no longer works.

### 6. Build archive

```bash
mkdir -p build

xcodebuild \
  -workspace ios/DailyTrain.xcworkspace \
  -scheme DailyTrain \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/DailyTrain.xcarchive \
  DEVELOPMENT_TEAM=J52KM8A8YH \
  -allowProvisioningUpdates \
  archive 2>&1 | grep -E "error:|ARCHIVE SUCCEEDED|ARCHIVE FAILED|Bundle React Native"
```

Must see `Bundle React Native code and images` and `** ARCHIVE SUCCEEDED **`. If `ARCHIVE FAILED`, stop and report all `error:` lines.

This step takes 5–10 minutes.

### 7. Export IPA

```bash
xcodebuild -exportArchive \
  -archivePath build/DailyTrain.xcarchive \
  -exportPath build/AppStore \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates \
  2>&1 | grep -E "error:|EXPORT SUCCEEDED|EXPORT FAILED"
```

Must see `** EXPORT SUCCEEDED **`. Verify the IPA exists:

```bash
ls -lh build/AppStore/DailyTrain.ipa
```

### 8. Upload to App Store Connect

**Retrieve the app-specific password** from the macOS Keychain (already stored):

```bash
APP_PWD=$(security find-generic-password -s "DailyTrain-Altool" -w 2>/dev/null)
```

The password is stored in two places:
- **Local:** macOS Keychain under service `DailyTrain-Altool`
- **CI/CD:** GitHub secret `APP_SPECIFIC_PASSWORD`

If the Keychain lookup fails (empty `APP_PWD`), ask the user for the password. Once provided, store it in both places:
```bash
security add-generic-password -s "DailyTrain-Altool" -a "ecimio@icloud.com" -w "THE_PASSWORD"
gh secret set APP_SPECIFIC_PASSWORD --body "THE_PASSWORD"
```

**Upload the IPA:**

```bash
xcrun altool --upload-app \
  -f build/AppStore/DailyTrain.ipa \
  -t ios \
  -u "ecimio@icloud.com" \
  --password "$APP_PWD" \
  2>&1
```

> The on-device AI model (~1.3 GB) makes this a large upload — expect 10–20 minutes on a typical connection.

A successful upload shows: `No errors uploading` or `Package Summary`.

### 9. Commit the version bump

```bash
git add app.json ExportOptions.plist
git commit -m "chore: bump build number to X for App Store"
git push origin main
```

Replace `X` with the new build number from step 2.

---

## After Upload

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Select DailyTrain → TestFlight (to test the build) or App Store (to submit for review)
3. Add metadata: description, screenshots (6.5" + 5.5" required), keywords, support URL, privacy policy URL
4. HealthKit apps require a privacy policy URL — required before submission
5. Submit for review — first review typically takes 24–48 hours

## Troubleshooting

**Signing error / no provisioning profile:**
- Open Xcode → Settings → Accounts → `ecimio@icloud.com` → Download Manual Profiles
- Re-run step 6

**`AuthenticationFailure` on upload:**
- The app-specific password may be expired or revoked — generate a new one at appleid.apple.com

**Archive fails with Swift compilation error in expo-apple-authentication:**
- The `@unknown default` patch (step 4) wasn't applied — apply it and retry step 6
