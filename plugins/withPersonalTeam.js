const { withXcodeProject, withEntitlementsPlist } = require('@expo/config-plugins');

const TEAM_ID = 'J52KM8A8YH';

/**
 * Expo config plugin for Personal Team (free Apple account) builds.
 * - Sets DEVELOPMENT_TEAM and CODE_SIGN_STYLE in Xcode project
 * - Strips entitlements unsupported on free accounts
 */
function withPersonalTeam(config) {
  // Set signing team in Xcode project build configurations
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const configs = project.pbxXCBuildConfigurationSection();

    Object.keys(configs).forEach((key) => {
      // Skip comment entries (strings like "Debug", "Release")
      if (typeof configs[key] !== 'object') return;
      const entry = configs[key];
      if (
        entry.buildSettings &&
        (entry.buildSettings.PRODUCT_NAME === 'DailyTrain' ||
          entry.buildSettings.PRODUCT_NAME === '"DailyTrain"')
      ) {
        entry.buildSettings.DEVELOPMENT_TEAM = TEAM_ID;
        entry.buildSettings.CODE_SIGN_STYLE = 'Automatic';
      }
    });

    return mod;
  });

  // Remove entitlements unsupported on Personal Team
  config = withEntitlementsPlist(config, (mod) => {
    const unsupported = [
      'aps-environment',
      'com.apple.developer.applesignin',
      'com.apple.developer.kernel.extended-virtual-addressing',
    ];

    unsupported.forEach((key) => {
      delete mod.modResults[key];
    });

    return mod;
  });

  return config;
}

module.exports = withPersonalTeam;
