const { withXcodeProject, withEntitlementsPlist } = require('@expo/config-plugins');

const TEAM_ID = 'H3QS56VZ7D'; // ecimio@icloud.com — paid Apple Developer account

/**
 * Expo config plugin for App Store distribution builds.
 * - Sets DEVELOPMENT_TEAM to the paid Apple Developer account
 * - Keeps Sign In with Apple entitlement (required for App Store)
 * - Strips only entitlements that are explicitly unsupported / unused:
 *     aps-environment (push notifications — not used)
 *     com.apple.developer.kernel.extended-virtual-addressing (not used)
 */
function withAppStoreTeam(config) {
  // Set signing team in Xcode project build configurations
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const configs = project.pbxXCBuildConfigurationSection();

    Object.keys(configs).forEach((key) => {
      if (typeof configs[key] !== 'object') return;
      const entry = configs[key];
      if (
        entry.buildSettings &&
        (entry.buildSettings.PRODUCT_NAME === 'DailyTrain' ||
          entry.buildSettings.PRODUCT_NAME === '"DailyTrain"')
      ) {
        entry.buildSettings.DEVELOPMENT_TEAM = TEAM_ID;
        // Automatic signing lets Xcode pick Development cert for Debug
        // and Distribution cert for Archive/Release automatically
        entry.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        delete entry.buildSettings.CODE_SIGN_IDENTITY;
      }
    });

    return mod;
  });

  // Strip only entitlements that are unsupported or unused — keep Sign In with Apple
  config = withEntitlementsPlist(config, (mod) => {
    const unused = [
      'aps-environment', // push notifications — not implemented
      'com.apple.developer.kernel.extended-virtual-addressing', // not needed
    ];
    unused.forEach((key) => {
      delete mod.modResults[key];
    });
    return mod;
  });

  return config;
}

module.exports = withAppStoreTeam;
