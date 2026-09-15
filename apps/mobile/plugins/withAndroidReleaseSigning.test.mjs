import { describe, expect, it } from "vitest";

import withAndroidReleaseSigning from "./withAndroidReleaseSigning.cjs";

const { patchAppBuildGradle, readSigningFromEnv } = withAndroidReleaseSigning;

const template = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

describe("Android release signing", () => {
  it("adds a release signing config and points only the release build type at it", () => {
    const patched = patchAppBuildGradle(template, {
      storeFile: "/tmp/nightly.keystore",
      password: "it's secret",
      keyAlias: "nightly",
    });
    expect(patched).toContain("storeFile file('/tmp/nightly.keystore')");
    expect(patched).toContain("storePassword 'it\\'s secret'");
    expect(patched).toContain("keyAlias 'nightly'");
    expect(patched.match(/signingConfig signingConfigs\.release/g)).toHaveLength(1);
    expect(patched.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
    expect(patched.indexOf("signingConfigs.debug")).toBeLessThan(
      patched.indexOf("signingConfigs.release"),
    );
  });

  it("stays inert without a keystore path and rejects a path without a password", () => {
    expect(readSigningFromEnv({})).toBeNull();
    expect(() => readSigningFromEnv({ T3CODE_ANDROID_KEYSTORE_PATH: "/tmp/x" })).toThrow(
      /PASSWORD/,
    );
    expect(
      readSigningFromEnv({
        T3CODE_ANDROID_KEYSTORE_PATH: "/tmp/x",
        T3CODE_ANDROID_KEYSTORE_PASSWORD: "p",
      }),
    ).toEqual({ storeFile: "/tmp/x", password: "p", keyAlias: "nightly" });
  });

  it("refuses a build.gradle that drifted from the Expo template", () => {
    expect(() =>
      patchAppBuildGradle("android {}", { storeFile: "a", password: "b", keyAlias: "c" }),
    ).toThrow(/template/);
  });
});
