const fs = require("node:fs");
const { withAppBuildGradle } = require("expo/config-plugins");

// Expo's template signs release builds with the shared debug keystore, so an
// APK built on a fresh CI runner cannot update one built anywhere else: Android
// refuses the install because the signing keys differ. When a keystore is
// configured through the environment, sign release builds with it instead so
// every nightly updates the previous one. Without it the template signing stays.
const KEYSTORE_PATH_ENV = "T3CODE_ANDROID_KEYSTORE_PATH";
const KEYSTORE_PASSWORD_ENV = "T3CODE_ANDROID_KEYSTORE_PASSWORD";
const KEY_ALIAS_ENV = "T3CODE_ANDROID_KEY_ALIAS";

const DEBUG_SIGNING_BLOCK = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\}\n)/;
const RELEASE_BUILD_TYPE = /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/;

function readSigningFromEnv(env = process.env) {
  const storeFile = env[KEYSTORE_PATH_ENV];
  if (!storeFile) return null;
  const password = env[KEYSTORE_PASSWORD_ENV];
  if (!password) {
    throw new Error(`${KEYSTORE_PATH_ENV} is set but ${KEYSTORE_PASSWORD_ENV} is empty.`);
  }
  return { storeFile, password, keyAlias: env[KEY_ALIAS_ENV] || "nightly" };
}

function gradleString(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function patchAppBuildGradle(contents, signing) {
  if (!DEBUG_SIGNING_BLOCK.test(contents) || !RELEASE_BUILD_TYPE.test(contents)) {
    throw new Error(
      "app/build.gradle no longer matches the Expo template; update withAndroidReleaseSigning.cjs.",
    );
  }
  const releaseConfig = [
    "        release {",
    `            storeFile file(${gradleString(signing.storeFile)})`,
    `            storePassword ${gradleString(signing.password)}`,
    `            keyAlias ${gradleString(signing.keyAlias)}`,
    `            keyPassword ${gradleString(signing.password)}`,
    "        }",
    "",
  ].join("\n");
  return contents
    .replace(DEBUG_SIGNING_BLOCK, `$1${releaseConfig}`)
    .replace(RELEASE_BUILD_TYPE, "$1signingConfig signingConfigs.release");
}

function withAndroidReleaseSigning(config) {
  const signing = readSigningFromEnv();
  if (signing == null) return config;
  if (!fs.existsSync(signing.storeFile)) {
    throw new Error(`${KEYSTORE_PATH_ENV} points at ${signing.storeFile}, which does not exist.`);
  }
  return withAppBuildGradle(config, (nextConfig) => {
    nextConfig.modResults.contents = patchAppBuildGradle(nextConfig.modResults.contents, signing);
    return nextConfig;
  });
}

withAndroidReleaseSigning.patchAppBuildGradle = patchAppBuildGradle;
withAndroidReleaseSigning.readSigningFromEnv = readSigningFromEnv;

module.exports = withAndroidReleaseSigning;
