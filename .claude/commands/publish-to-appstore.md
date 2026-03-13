# Publish DailyTrain to the App Store

Build a release archive and submit to App Store Connect.

## Prerequisites

- Paid Apple Developer Program membership ($99/year)
- App Store Connect account with the app registered
- Distribution certificate and provisioning profile configured
- App icons (1024x1024) and screenshots prepared

## Steps

1. Ensure all tests pass and code is clean:
   ```bash
   npm test && npm run lint
   ```

2. Bump the version in `app.json` if needed (update `version` and `ios.buildNumber`).

3. Run expo prebuild:
   ```bash
   LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo prebuild --platform ios --clean
   ```

4. Patch ExpoAppleAuthentication Swift compilation error — add `@unknown default` cases to both switch statements in:
   `node_modules/expo-apple-authentication/ios/AppleAuthenticationUtils.swift`

5. Open in Xcode for release build:
   ```bash
   open ios/DailyTrain.xcworkspace
   ```

6. In Xcode:
   - Select the DailyTrain target
   - Set Team to your paid Apple Developer account
   - Ensure "Sign In with Apple" capability is added (requires paid account)
   - Select "Any iOS Device" as destination
   - Product > Archive
   - Once archive completes, click "Distribute App"
   - Choose "App Store Connect" > Upload

7. Alternatively, build and upload from command line:
   ```bash
   # Build archive
   xcodebuild -workspace ios/DailyTrain.xcworkspace -scheme DailyTrain \
     -configuration Release -archivePath build/DailyTrain.xcarchive archive

   # Export IPA
   xcodebuild -exportArchive -archivePath build/DailyTrain.xcarchive \
     -exportPath build/DailyTrain -exportOptionsPlist ExportOptions.plist

   # Upload to App Store Connect (requires app-specific password)
   xcrun altool --upload-app -f build/DailyTrain/DailyTrain.ipa \
     -t ios -u YOUR_APPLE_ID -p YOUR_APP_SPECIFIC_PASSWORD
   ```

8. In App Store Connect (https://appstoreconnect.apple.com):
   - Add app metadata, description, screenshots, and keywords
   - Set pricing and availability
   - Submit for review

## App Store Review Checklist

- HealthKit usage descriptions are set in `app.json` (NSHealthShareUsageDescription, NSHealthUpdateUsageDescription)
- Privacy policy URL is required for HealthKit apps
- No hardcoded API keys or tokens in the bundle
- App works offline (required since it uses on-device AI)
- Sign In with Apple is available (required if any third-party sign-in is offered)

## Notes
- First submission typically takes 24-48 hours for review
- HealthKit apps require extra review scrutiny — ensure privacy descriptions are clear
- The on-device AI model (1.3GB) will increase app size significantly — consider App Thinning
