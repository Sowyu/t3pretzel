const path = require("node:path");
const fs = require("node:fs/promises");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// Android trusts only system CAs for app traffic unless a network security config
// says otherwise, so a server behind a private CA that the user installed on the
// device (Settings > Security > Install a certificate) failed to pair with a bare
// "Transport error" even though Chrome on the same device trusted it (#5639).
// Trust user-installed CAs the way the browser does, and keep cleartext allowed
// for plain-http LAN servers; the config replaces android:usesCleartextTraffic.
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const RESOURCE_NAME = "network_security_config";

function withAndroidNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, (nextConfig) => {
    const application = nextConfig.modResults.manifest.application?.[0];
    if (application == null) {
      throw new Error(
        "AndroidManifest.xml is missing the application element required for the network security config.",
      );
    }
    application.$ ??= {};
    application.$["android:networkSecurityConfig"] = `@xml/${RESOURCE_NAME}`;
    delete application.$["android:usesCleartextTraffic"];
    return nextConfig;
  });

  return withDangerousMod(config, [
    "android",
    async (nextConfig) => {
      const xmlDirectory = path.join(
        nextConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      await fs.mkdir(xmlDirectory, { recursive: true });
      await fs.writeFile(path.join(xmlDirectory, `${RESOURCE_NAME}.xml`), NETWORK_SECURITY_CONFIG);
      return nextConfig;
    },
  ]);
}

withAndroidNetworkSecurityConfig.NETWORK_SECURITY_CONFIG = NETWORK_SECURITY_CONFIG;

module.exports = withAndroidNetworkSecurityConfig;
