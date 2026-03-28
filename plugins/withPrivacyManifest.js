const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Expo config plugin that copies the app-level PrivacyInfo.xcprivacy
 * into the ios/DTrain/ directory during prebuild.
 * Required for App Store 5.1.1 compliance.
 *
 * Source file lives in assets/ (survives prebuild --clean which deletes ios/).
 * The file is placed in the app target directory so Xcode automatically
 * includes it in the app bundle during the "Copy Bundle Resources" phase.
 */
function withPrivacyManifest(config) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const sourceFile = path.join(projectRoot, 'assets', 'PrivacyInfo.xcprivacy');
      const targetDir = path.join(projectRoot, 'ios', 'DTrain');
      const targetFile = path.join(targetDir, 'PrivacyInfo.xcprivacy');

      if (fs.existsSync(sourceFile) && fs.existsSync(targetDir)) {
        fs.copyFileSync(sourceFile, targetFile);
      }

      return modConfig;
    },
  ]);
}

module.exports = withPrivacyManifest;
