import * as Schema from "effect/Schema";
import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "../../state/atom-registry";

/* ─── Build identity ─────────────────────────────────────────────── */

/**
 * What `app.config.ts` stamps into `extra.build`. The updater compares this
 * against the GitHub release, so a binary that carries no build stamp can never
 * report itself up to date.
 */
export interface NightlyBuild {
  readonly commit: string;
  readonly versionCode: number;
  readonly builtAt: string;
  readonly repository: string;
}

/** Reads `extra.build` defensively: an old OTA bundle may predate the stamp. */
export function readNightlyBuild(extra: unknown): NightlyBuild | null {
  if (typeof extra !== "object" || extra === null || !("build" in extra)) return null;
  const build = (extra as { readonly build: unknown }).build;
  if (typeof build !== "object" || build === null) return null;
  const candidate = build as Partial<Record<keyof NightlyBuild, unknown>>;
  if (
    typeof candidate.commit !== "string" ||
    typeof candidate.builtAt !== "string" ||
    typeof candidate.repository !== "string"
  ) {
    return null;
  }
  const versionCode =
    typeof candidate.versionCode === "number" && Number.isInteger(candidate.versionCode)
      ? candidate.versionCode
      : 0;
  return {
    commit: candidate.commit,
    versionCode,
    builtAt: candidate.builtAt,
    repository: candidate.repository,
  };
}

export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/* ─── Release payload ────────────────────────────────────────────── */

const NightlyReleaseAssetSchema = Schema.Struct({
  name: Schema.String,
  size: Schema.Number,
  browser_download_url: Schema.String,
  // Added by GitHub in 2024; older releases and GHES omit it.
  digest: Schema.optional(Schema.NullOr(Schema.String)),
});

const NightlyReleaseSchema = Schema.Struct({
  name: Schema.optional(Schema.NullOr(Schema.String)),
  tag_name: Schema.optional(Schema.String),
  target_commitish: Schema.String,
  published_at: Schema.optional(Schema.NullOr(Schema.String)),
  assets: Schema.Array(NightlyReleaseAssetSchema),
});

export type NightlyRelease = typeof NightlyReleaseSchema.Type;
export type NightlyReleaseAsset = typeof NightlyReleaseAssetSchema.Type;

const decodeNightlyReleaseSync = Schema.decodeUnknownSync(NightlyReleaseSchema);

export function decodeNightlyRelease(value: unknown): NightlyRelease {
  return decodeNightlyReleaseSync(value);
}

/** The nightly workflow names one APK per ABI. */
export function nightlyAssetNameFor(abi: string): string {
  return `t3code-nightly-${abi}.apk`;
}

/**
 * The first asset matching the device's own ABI order, so a 64-bit device
 * prefers its arm64 APK over the 32-bit one it could also run.
 */
export function selectNightlyAsset(
  release: NightlyRelease,
  supportedAbis: ReadonlyArray<string>,
): NightlyReleaseAsset | null {
  for (const abi of supportedAbis) {
    const wanted = nightlyAssetNameFor(abi);
    const asset = release.assets.find((candidate) => candidate.name === wanted);
    if (asset) return asset;
  }
  return null;
}

/** `"sha256:<hex>"` is the only digest form GitHub emits today. */
export function releaseDigestSha256(digest: string | null | undefined): string | null {
  if (typeof digest !== "string") return null;
  const match = /^sha256:([0-9a-f]{64})$/i.exec(digest.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export interface NightlyUpdate {
  readonly assetName: string;
  readonly commit: string;
  readonly downloadUrl: string;
  readonly publishedAt: string | null;
  /** Null when the release predates asset digests; verification then can only check the signer. */
  readonly sha256: string | null;
  readonly sizeBytes: number;
  readonly title: string;
}

export type NightlyResolution =
  | { readonly kind: "available"; readonly update: NightlyUpdate }
  | { readonly kind: "upToDate" }
  | { readonly kind: "noAsset"; readonly abis: ReadonlyArray<string> };

/**
 * A release counts as an update only when it was built from a different commit
 * *and* published after this binary. The second half matters because the
 * rolling `nightly` release is recreated on every push: a device running a
 * newer local build would otherwise be told to downgrade.
 *
 * Times are compared as epoch millis, not as strings — GitHub's timestamps have
 * no milliseconds while `builtAt` does, and `"…:00Z" > "…:00.123Z"` lexically.
 */
export function resolveNightlyUpdate(
  release: NightlyRelease,
  build: NightlyBuild,
  supportedAbis: ReadonlyArray<string>,
): NightlyResolution {
  if (release.target_commitish === build.commit) return { kind: "upToDate" };
  if (!isReleaseNewerThanBuild(release.published_at, build.builtAt)) return { kind: "upToDate" };

  const asset = selectNightlyAsset(release, supportedAbis);
  if (!asset) return { kind: "noAsset", abis: supportedAbis };

  return {
    kind: "available",
    update: {
      assetName: asset.name,
      commit: release.target_commitish,
      downloadUrl: asset.browser_download_url,
      publishedAt: release.published_at ?? null,
      sha256: releaseDigestSha256(asset.digest),
      sizeBytes: asset.size,
      title: release.name?.trim() || release.tag_name || shortCommit(release.target_commitish),
    },
  };
}

function isReleaseNewerThanBuild(publishedAt: string | null | undefined, builtAt: string): boolean {
  const builtAtMs = Date.parse(builtAt);
  // No usable local build time: fall back to the commit mismatch alone rather
  // than refusing every update forever.
  if (Number.isNaN(builtAtMs)) return true;
  if (typeof publishedAt !== "string") return false;
  const publishedAtMs = Date.parse(publishedAt);
  return !Number.isNaN(publishedAtMs) && publishedAtMs > builtAtMs;
}

/* ─── State machine ──────────────────────────────────────────────── */

export type NightlyUpdaterStep = "check" | "download" | "verify" | "install" | "permission";

export type NightlyUpdaterState =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "upToDate" }
  | { readonly kind: "available"; readonly update: NightlyUpdate }
  | { readonly kind: "downloading"; readonly update: NightlyUpdate; readonly percent: number }
  | { readonly kind: "verifying"; readonly update: NightlyUpdate }
  | { readonly kind: "installing"; readonly update: NightlyUpdate }
  | {
      readonly kind: "error";
      readonly step: NightlyUpdaterStep;
      readonly message: string;
      readonly update: NightlyUpdate | null;
    };

export const nightlyUpdaterStateAtom = Atom.make<NightlyUpdaterState>({ kind: "idle" }).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:nightly-updater"),
);

export function getNightlyUpdaterState(): NightlyUpdaterState {
  return appAtomRegistry.get(nightlyUpdaterStateAtom);
}

export function setNightlyUpdaterState(state: NightlyUpdaterState): void {
  appAtomRegistry.set(nightlyUpdaterStateAtom, state);
}

/** Resets module state between test runs. */
export function resetNightlyUpdaterState(): void {
  setNightlyUpdaterState({ kind: "idle" });
}

/** True while the flow owns the network or the installer; nothing may restart it. */
export function isNightlyUpdaterBusy(state: NightlyUpdaterState): boolean {
  return (
    state.kind === "checking" ||
    state.kind === "downloading" ||
    state.kind === "verifying" ||
    state.kind === "installing"
  );
}

/** The update a retry should resume, if the state still remembers one. */
export function nightlyUpdaterUpdate(state: NightlyUpdaterState): NightlyUpdate | null {
  switch (state.kind) {
    case "available":
    case "downloading":
    case "verifying":
    case "installing":
      return state.update;
    case "error":
      return state.update;
    default:
      return null;
  }
}

export function nightlyUpdaterStatusLabel(state: NightlyUpdaterState): string | null {
  switch (state.kind) {
    case "checking":
      return "Checking…";
    case "upToDate":
      return "Up to date";
    case "available":
      return `Update available · ${state.update.title}`;
    case "downloading":
      return `Downloading ${Math.round(state.percent)}%`;
    case "verifying":
      return "Verifying…";
    case "installing":
      return "Installing…";
    case "error":
      return state.message;
    default:
      return null;
  }
}

export type NightlyUpdaterAction = "check" | "update" | "retry" | "allowInstalls";

export function nightlyUpdaterAction(state: NightlyUpdaterState): NightlyUpdaterAction | null {
  switch (state.kind) {
    case "idle":
    case "upToDate":
      return "check";
    case "available":
      return "update";
    case "error":
      return state.step === "permission" ? "allowInstalls" : "retry";
    default:
      // Checking, downloading, verifying, installing: the status line is the UI.
      return null;
  }
}

export function nightlyUpdaterActionLabel(action: NightlyUpdaterAction): string {
  switch (action) {
    case "check":
      return "Check";
    case "update":
      return "Update";
    case "retry":
      return "Retry";
    case "allowInstalls":
      return "Allow installs";
  }
}

/* ─── Auto-check cadence ─────────────────────────────────────────── */

/**
 * Six hours: nightlies land a few times a day at most, and a checkout of the
 * GitHub API on every foreground would be noise on a metered connection.
 */
export const NIGHTLY_AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function shouldAutoCheckNightly(input: {
  readonly lastCheckedAtMs: number | null;
  readonly nowMs: number;
  readonly state: NightlyUpdaterState;
}): boolean {
  // Never interrupt a download or an install, and never re-check something the
  // user has already been offered.
  if (isNightlyUpdaterBusy(input.state) || input.state.kind === "available") return false;
  if (input.lastCheckedAtMs === null) return true;
  return input.nowMs - input.lastCheckedAtMs >= NIGHTLY_AUTO_CHECK_INTERVAL_MS;
}

/* ─── Verification ───────────────────────────────────────────────── */

export interface NightlyApkInspection {
  readonly sha256: string;
  readonly packageName: string | null;
  readonly versionCode: number;
  readonly signerMatchesInstalled: boolean;
}

/**
 * Everything checked between "downloaded" and "handed to PackageInstaller".
 * Returns the first failure so the error state can name the reason.
 */
export function verifyNightlyApk(input: {
  readonly expectedSha256: string | null;
  readonly inspection: NightlyApkInspection;
  readonly installedPackageName: string;
  readonly installedVersionCode: number;
}): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const { inspection } = input;
  if (input.expectedSha256 !== null && inspection.sha256 !== input.expectedSha256) {
    return { ok: false, message: "The download does not match the published checksum." };
  }
  if (inspection.packageName !== input.installedPackageName) {
    return { ok: false, message: "The download is for a different app." };
  }
  if (!inspection.signerMatchesInstalled) {
    return { ok: false, message: "The download is signed with a different key." };
  }
  if (inspection.versionCode < input.installedVersionCode) {
    return { ok: false, message: "The download is older than the installed build." };
  }
  return { ok: true };
}

/* ─── Install outcome ────────────────────────────────────────────── */

export interface NightlyPendingUpdate {
  readonly commit: string;
  readonly failureMessage?: string | null;
  readonly failureStatus?: number;
}

/**
 * What to tell the user about the install that ran before this launch. The
 * running commit is the only trustworthy signal: PackageInstaller's success
 * status arrives in a process that is about to be replaced.
 */
export function describeNightlyInstallOutcome(
  pending: NightlyPendingUpdate,
  currentCommit: string,
): { readonly ok: boolean; readonly message: string } {
  if (pending.commit === currentCommit) {
    return { ok: true, message: `Updated to ${shortCommit(currentCommit)}` };
  }
  const detail = pending.failureMessage?.trim();
  return {
    ok: false,
    message: detail
      ? `The update to ${shortCommit(pending.commit)} did not install: ${detail}`
      : `The update to ${shortCommit(pending.commit)} did not install.`,
  };
}
