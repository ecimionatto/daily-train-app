const { withDangerousMod, withEntitlementsPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Local Expo config plugin for llama.rn compatibility.
 * Adds iOS memory entitlements and forces C++20 across all pods.
 */
function withLlamaRN(config) {
  // Add extended memory entitlements for loading large models
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.kernel.extended-virtual-addressing'] = true;
    mod.modResults['com.apple.developer.kernel.increased-memory-limit'] = true;
    return mod;
  });

  // Force C++20 in Podfile post_install
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, 'utf8');

        const cxx20Snippet = `
    # Force C++20 for llama.rn compatibility
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++20'
      end
    end`;

        if (!podfile.includes('gnu++20')) {
          // Insert into existing post_install block or create one
          if (podfile.includes('post_install do |installer|')) {
            podfile = podfile.replace(
              'post_install do |installer|',
              `post_install do |installer|${cxx20Snippet}`
            );
          } else {
            podfile += `\npost_install do |installer|${cxx20Snippet}\nend\n`;
          }
          fs.writeFileSync(podfilePath, podfile);
        }
      }
      return mod;
    },
  ]);

  return config;
}

module.exports = withLlamaRN;
