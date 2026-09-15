import { describe, expect, it } from "vite-plus/test";

import {
  decodeNightlyRelease,
  describeNightlyInstallOutcome,
  getNightlyUpdaterState,
  NIGHTLY_AUTO_CHECK_INTERVAL_MS,
  nightlyUpdaterAction,
  nightlyUpdaterStatusLabel,
  readNightlyBuild,
  releaseDigestSha256,
  resetNightlyUpdaterState,
  resolveNightlyUpdate,
  selectNightlyAsset,
  setNightlyUpdaterState,
  shouldAutoCheckNightly,
  verifyNightlyApk,
  type NightlyBuild,
  type NightlyUpdate,
} from "./nightly-updater";

const ARM64_ASSET = {
  name: "t3code-nightly-arm64-v8a.apk",
  size: 92_000_000,
  browser_download_url: "https://github.com/Sowyu/t3pretzel/releases/download/nightly/arm64.apk",
  digest: `sha256:${"a".repeat(64)}`,
};

const ARMV7_ASSET = {
  name: "t3code-nightly-armeabi-v7a.apk",
  size: 88_000_000,
  browser_download_url: "https://github.com/Sowyu/t3pretzel/releases/download/nightly/v7a.apk",
  digest: `sha256:${"b".repeat(64)}`,
};

// The shape the GitHub API actually returns, extra keys and all.
function releasePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 1234,
    url: "https://api.github.com/repos/Sowyu/t3pretzel/releases/1234",
    tag_name: "nightly",
    name: "Nightly (2026-09-14, abcdef1)",
    target_commitish: "a".repeat(40),
    published_at: "2026-09-14T04:17:00Z",
    prerelease: true,
    assets: [ARM64_ASSET, ARMV7_ASSET],
    ...overrides,
  };
}

const BUILD: NightlyBuild = {
  commit: "b".repeat(40),
  versionCode: 41,
  builtAt: "2026-09-13T12:00:00.123Z",
  repository: "Sowyu/t3pretzel",
};

describe("decodeNightlyRelease", () => {
  it("keeps the fields the updater needs and tolerates the rest", () => {
    const release = decodeNightlyRelease(releasePayload());
    expect(release.target_commitish).toBe("a".repeat(40));
    expect(release.published_at).toBe("2026-09-14T04:17:00Z");
    expect(release.assets.map((asset) => asset.name)).toEqual([
      "t3code-nightly-arm64-v8a.apk",
      "t3code-nightly-armeabi-v7a.apk",
    ]);
  });

  it("accepts a release whose assets carry no digest", () => {
    const release = decodeNightlyRelease(
      releasePayload({ assets: [{ ...ARM64_ASSET, digest: null }] }),
    );
    expect(release.assets[0]?.digest).toBeNull();
  });

  it("rejects a payload with no target commit", () => {
    expect(() => decodeNightlyRelease(releasePayload({ target_commitish: 42 }))).toThrow();
  });
});

describe("selectNightlyAsset", () => {
  it("follows the device ABI order rather than the asset order", () => {
    const release = decodeNightlyRelease(releasePayload());
    expect(selectNightlyAsset(release, ["armeabi-v7a", "arm64-v8a"])?.name).toBe(
      "t3code-nightly-armeabi-v7a.apk",
    );
    expect(selectNightlyAsset(release, ["arm64-v8a", "armeabi-v7a"])?.name).toBe(
      "t3code-nightly-arm64-v8a.apk",
    );
  });

  it("is null when nothing matches the device", () => {
    const release = decodeNightlyRelease(releasePayload());
    expect(selectNightlyAsset(release, ["x86_64"])).toBeNull();
  });
});

describe("releaseDigestSha256", () => {
  it("unwraps the sha256 prefix and lowercases", () => {
    expect(releaseDigestSha256(`sha256:${"A".repeat(64)}`)).toBe("a".repeat(64));
  });

  it("is null for anything else", () => {
    expect(releaseDigestSha256(null)).toBeNull();
    expect(releaseDigestSha256(undefined)).toBeNull();
    expect(releaseDigestSha256("sha512:abc")).toBeNull();
    expect(releaseDigestSha256(`sha256:${"a".repeat(63)}`)).toBeNull();
  });
});

describe("resolveNightlyUpdate", () => {
  it("offers a newer release built from a different commit", () => {
    const resolution = resolveNightlyUpdate(decodeNightlyRelease(releasePayload()), BUILD, [
      "arm64-v8a",
    ]);
    expect(resolution.kind).toBe("available");
    if (resolution.kind !== "available") return;
    expect(resolution.update.commit).toBe("a".repeat(40));
    expect(resolution.update.sha256).toBe("a".repeat(64));
    expect(resolution.update.title).toBe("Nightly (2026-09-14, abcdef1)");
  });

  it("is up to date when the release was built from this commit", () => {
    const release = decodeNightlyRelease(releasePayload({ target_commitish: BUILD.commit }));
    expect(resolveNightlyUpdate(release, BUILD, ["arm64-v8a"]).kind).toBe("upToDate");
  });

  it("does not offer a release published before this build", () => {
    const release = decodeNightlyRelease(releasePayload({ published_at: "2026-09-12T04:17:00Z" }));
    expect(resolveNightlyUpdate(release, BUILD, ["arm64-v8a"]).kind).toBe("upToDate");
  });

  it("compares timestamps numerically, not as strings", () => {
    // Lexically "…:00Z" sorts after "…:00.123Z"; the release is one second older.
    const build = { ...BUILD, builtAt: "2026-09-14T04:17:01.123Z" };
    const release = decodeNightlyRelease(releasePayload({ published_at: "2026-09-14T04:17:00Z" }));
    expect(resolveNightlyUpdate(release, build, ["arm64-v8a"]).kind).toBe("upToDate");
  });

  it("reports the device ABIs when the release carries no matching APK", () => {
    const release = decodeNightlyRelease(releasePayload({ assets: [ARMV7_ASSET] }));
    const resolution = resolveNightlyUpdate(release, BUILD, ["arm64-v8a"]);
    expect(resolution).toEqual({ kind: "noAsset", abis: ["arm64-v8a"] });
  });

  it("falls back to the tag when the release has no title", () => {
    const release = decodeNightlyRelease(releasePayload({ name: null }));
    const resolution = resolveNightlyUpdate(release, BUILD, ["arm64-v8a"]);
    expect(resolution.kind === "available" && resolution.update.title).toBe("nightly");
  });

  it("still offers an update when the local build time is unusable", () => {
    const build = { ...BUILD, builtAt: "unknown" };
    const release = decodeNightlyRelease(releasePayload({ published_at: "2020-01-01T00:00:00Z" }));
    expect(resolveNightlyUpdate(release, build, ["arm64-v8a"]).kind).toBe("available");
  });
});

describe("readNightlyBuild", () => {
  it("reads the stamp app.config.ts writes", () => {
    expect(
      readNightlyBuild({
        appVariant: "nightly",
        build: {
          commit: "c".repeat(40),
          versionCode: 7,
          builtAt: "2026-09-14T00:00:00.000Z",
          repository: "Sowyu/t3pretzel",
        },
      }),
    ).toEqual({
      commit: "c".repeat(40),
      versionCode: 7,
      builtAt: "2026-09-14T00:00:00.000Z",
      repository: "Sowyu/t3pretzel",
    });
  });

  it("is null for a bundle that predates the stamp", () => {
    expect(readNightlyBuild(undefined)).toBeNull();
    expect(readNightlyBuild({ appVariant: "nightly" })).toBeNull();
    expect(readNightlyBuild({ build: { commit: 1 } })).toBeNull();
  });
});

describe("verifyNightlyApk", () => {
  const inspection = {
    sha256: "a".repeat(64),
    packageName: "com.t3tools.t3code.preview",
    versionCode: 42,
    signerMatchesInstalled: true,
  };
  const base = {
    expectedSha256: "a".repeat(64),
    inspection,
    installedPackageName: "com.t3tools.t3code.preview",
    installedVersionCode: 41,
  };

  it("accepts a matching APK", () => {
    expect(verifyNightlyApk(base)).toEqual({ ok: true });
  });

  it("rejects a checksum mismatch", () => {
    const result = verifyNightlyApk({ ...base, expectedSha256: "f".repeat(64) });
    expect(result).toEqual({
      ok: false,
      message: "The download does not match the published checksum.",
    });
  });

  it("rejects another app's package", () => {
    const result = verifyNightlyApk({
      ...base,
      inspection: { ...inspection, packageName: "com.example.other" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a different signing key", () => {
    const result = verifyNightlyApk({
      ...base,
      inspection: { ...inspection, signerMatchesInstalled: false },
    });
    expect(result).toEqual({
      ok: false,
      message: "The download is signed with a different key.",
    });
  });

  it("rejects a downgrade", () => {
    const result = verifyNightlyApk({
      ...base,
      inspection: { ...inspection, versionCode: 40 },
    });
    expect(result).toEqual({
      ok: false,
      message: "The download is older than the installed build.",
    });
  });

  it("checks the signer even when the release published no digest", () => {
    expect(verifyNightlyApk({ ...base, expectedSha256: null })).toEqual({ ok: true });
    expect(
      verifyNightlyApk({
        ...base,
        expectedSha256: null,
        inspection: { ...inspection, signerMatchesInstalled: false },
      }).ok,
    ).toBe(false);
  });
});

describe("state machine", () => {
  const update: NightlyUpdate = {
    assetName: "t3code-nightly-arm64-v8a.apk",
    commit: "a".repeat(40),
    downloadUrl: "https://example.invalid/apk",
    publishedAt: "2026-09-14T04:17:00Z",
    sha256: "a".repeat(64),
    sizeBytes: 1,
    title: "Nightly (2026-09-14, aaaaaaa)",
  };

  it("labels each state", () => {
    expect(nightlyUpdaterStatusLabel({ kind: "idle" })).toBeNull();
    expect(nightlyUpdaterStatusLabel({ kind: "checking" })).toBe("Checking…");
    expect(nightlyUpdaterStatusLabel({ kind: "upToDate" })).toBe("Up to date");
    expect(nightlyUpdaterStatusLabel({ kind: "available", update })).toBe(
      "Update available · Nightly (2026-09-14, aaaaaaa)",
    );
    expect(nightlyUpdaterStatusLabel({ kind: "downloading", update, percent: 41.6 })).toBe(
      "Downloading 42%",
    );
    expect(nightlyUpdaterStatusLabel({ kind: "verifying", update })).toBe("Verifying…");
    expect(nightlyUpdaterStatusLabel({ kind: "installing", update })).toBe("Installing…");
    expect(
      nightlyUpdaterStatusLabel({
        kind: "error",
        step: "download",
        message: "Network is unreachable.",
        update,
      }),
    ).toBe("Network is unreachable.");
  });

  it("offers the right trailing action", () => {
    expect(nightlyUpdaterAction({ kind: "idle" })).toBe("check");
    expect(nightlyUpdaterAction({ kind: "upToDate" })).toBe("check");
    expect(nightlyUpdaterAction({ kind: "available", update })).toBe("update");
    expect(nightlyUpdaterAction({ kind: "downloading", update, percent: 0 })).toBeNull();
    expect(nightlyUpdaterAction({ kind: "error", step: "verify", message: "nope", update })).toBe(
      "retry",
    );
    expect(
      nightlyUpdaterAction({ kind: "error", step: "permission", message: "nope", update: null }),
    ).toBe("allowInstalls");
  });

  it("stores state on the app registry", () => {
    resetNightlyUpdaterState();
    expect(getNightlyUpdaterState()).toEqual({ kind: "idle" });
    setNightlyUpdaterState({ kind: "available", update });
    expect(getNightlyUpdaterState()).toEqual({ kind: "available", update });
    resetNightlyUpdaterState();
  });

  it("auto-checks on a first run and then only after the interval", () => {
    const state = { kind: "idle" } as const;
    expect(shouldAutoCheckNightly({ lastCheckedAtMs: null, nowMs: 1_000, state })).toBe(true);
    expect(shouldAutoCheckNightly({ lastCheckedAtMs: 1_000, nowMs: 2_000, state })).toBe(false);
    expect(
      shouldAutoCheckNightly({
        lastCheckedAtMs: 1_000,
        nowMs: 1_000 + NIGHTLY_AUTO_CHECK_INTERVAL_MS,
        state,
      }),
    ).toBe(true);
  });

  it("never auto-checks over an in-flight or already-offered update", () => {
    for (const state of [
      { kind: "checking" } as const,
      { kind: "downloading", update, percent: 10 } as const,
      { kind: "verifying", update } as const,
      { kind: "installing", update } as const,
      { kind: "available", update } as const,
    ]) {
      expect(shouldAutoCheckNightly({ lastCheckedAtMs: null, nowMs: Date.now(), state })).toBe(
        false,
      );
    }
  });
});

describe("describeNightlyInstallOutcome", () => {
  it("reports success when the running commit is the one that was installed", () => {
    expect(describeNightlyInstallOutcome({ commit: "a".repeat(40) }, "a".repeat(40))).toEqual({
      ok: true,
      message: "Updated to aaaaaaa",
    });
  });

  it("reports the recorded failure when the commit did not change", () => {
    expect(
      describeNightlyInstallOutcome(
        { commit: "a".repeat(40), failureStatus: 4, failureMessage: "INSTALL_FAILED_ABORTED" },
        "b".repeat(40),
      ),
    ).toEqual({
      ok: false,
      message: "The update to aaaaaaa did not install: INSTALL_FAILED_ABORTED",
    });
  });

  it("reports a bare failure when the installer said nothing", () => {
    expect(describeNightlyInstallOutcome({ commit: "a".repeat(40) }, "b".repeat(40))).toEqual({
      ok: false,
      message: "The update to aaaaaaa did not install.",
    });
  });
});
