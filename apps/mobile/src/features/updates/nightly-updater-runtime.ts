import { useAtomValue } from "@effect/atom-react";
import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import { useCallback, useEffect } from "react";
import { Alert, AppState, Linking, PermissionsAndroid, Platform } from "react-native";

import {
  decodeNightlyRelease,
  describeNightlyInstallOutcome,
  getNightlyUpdaterState,
  isNightlyUpdaterBusy,
  nightlyUpdaterStateAtom,
  nightlyUpdaterUpdate,
  readNightlyBuild,
  resolveNightlyUpdate,
  setNightlyUpdaterState,
  shouldAutoCheckNightly,
  verifyNightlyApk,
  type NightlyBuild,
  type NightlyUpdate,
  type NightlyUpdaterState,
} from "./nightly-updater";

/* ─── Native boundary ────────────────────────────────────────────── */

interface NativeInstallInfo {
  readonly packageName: string;
  readonly versionName: string | null;
  readonly versionCode: number;
  readonly signerSha256: string | null;
  readonly installerPackageName: string | null;
  readonly canRequestPackageInstalls: boolean;
  readonly supportedAbis: ReadonlyArray<string>;
}

interface NativeApkInspection {
  readonly sha256: string;
  readonly packageName: string | null;
  readonly versionName: string | null;
  readonly versionCode: number;
  readonly signerSha256: string | null;
  readonly signerMatchesInstalled: boolean;
}

interface NativePendingUpdate {
  readonly commit: string;
  readonly sha256: string | null;
  readonly startedAt: number;
  readonly failureStatus?: number;
  readonly failureMessage?: string | null;
}

interface AppUpdaterNativeModule {
  getInstallInfo(): NativeInstallInfo;
  inspectApk(path: string): Promise<NativeApkInspection>;
  openInstallPermissionSettings(): boolean;
  install(path: string, expected: { commit: string; sha256: string }): Promise<void>;
  consumePendingUpdateResult(): NativePendingUpdate | null;
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<AppUpdaterNativeModule>("T3AppUpdater")
    : null;

const build = readNightlyBuild(Constants.expoConfig?.extra);

/**
 * The whole feature is off unless this is a nightly Android binary carrying a
 * build stamp and the native module. Every entry point checks it, so the UI can
 * hide the row without repeating the conditions.
 */
export function nightlyUpdaterApplies(): boolean {
  return (
    Platform.OS === "android" &&
    Constants.expoConfig?.extra?.appVariant === "nightly" &&
    build !== null &&
    native !== null
  );
}

/** The commit shown in the settings row. Empty when the feature does not apply. */
export function nightlyBuildCommit(): string {
  return build?.commit ?? "";
}

function activeUpdater(): {
  readonly build: NightlyBuild;
  readonly native: AppUpdaterNativeModule;
} | null {
  if (!nightlyUpdaterApplies() || build === null || native === null) return null;
  return { build, native };
}

/* ─── Check ──────────────────────────────────────────────────────── */

const CHECK_TIMEOUT_MS = 15_000;
const RELEASE_TAG = "nightly";

async function fetchNightlyRelease(repository: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases/tags/${RELEASE_TAG}`,
      { headers: { Accept: "application/vnd.github+json" }, signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`GitHub answered ${response.status} for the nightly release.`);
    }
    return decodeNightlyRelease(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForNightlyUpdate(): Promise<void> {
  const active = activeUpdater();
  if (active === null || isNightlyUpdaterBusy(getNightlyUpdaterState())) return;

  setNightlyUpdaterState({ kind: "checking" });
  // Stamped before the request, so a flaky network cannot turn the auto-check
  // into a retry loop. The user can still retry by hand.
  await writeLastCheckedAt(Date.now());

  let release;
  try {
    release = await fetchNightlyRelease(active.build.repository);
  } catch (error) {
    setNightlyUpdaterState({
      kind: "error",
      step: "check",
      message: failureMessage(error, "Could not reach GitHub to check for updates."),
      update: null,
    });
    return;
  }

  const abis = installInfoAbis(active.native);
  const resolution = resolveNightlyUpdate(release, active.build, abis);
  switch (resolution.kind) {
    case "available":
      setNightlyUpdaterState({ kind: "available", update: resolution.update });
      return;
    case "upToDate":
      setNightlyUpdaterState({ kind: "upToDate" });
      return;
    case "noAsset":
      setNightlyUpdaterState({
        kind: "error",
        step: "check",
        message: `The latest nightly has no build for this device (${resolution.abis.join(", ")}).`,
        update: null,
      });
  }
}

function installInfoAbis(module: AppUpdaterNativeModule): ReadonlyArray<string> {
  try {
    return module.getInstallInfo().supportedAbis;
  } catch {
    return [];
  }
}

/* ─── Download, verify, install ──────────────────────────────────── */

const DOWNLOAD_DIRECTORY = "nightly-updates";

// Guards the flow independently of the state atom: two taps in one frame both
// read the old state, and only one of them may own the download and the session.
let updateInFlight = false;

export async function startNightlyUpdate(update: NightlyUpdate): Promise<void> {
  const active = activeUpdater();
  if (active === null || updateInFlight || isNightlyUpdaterBusy(getNightlyUpdaterState())) return;
  updateInFlight = true;
  try {
    await runNightlyUpdate(active, update);
  } finally {
    updateInFlight = false;
  }
}

async function runNightlyUpdate(
  active: NonNullable<ReturnType<typeof activeUpdater>>,
  update: NightlyUpdate,
): Promise<void> {
  let info: NativeInstallInfo;
  try {
    info = active.native.getInstallInfo();
  } catch (error) {
    setNightlyUpdaterState({
      kind: "error",
      step: "install",
      message: failureMessage(error, "Could not read this app's install details."),
      update,
    });
    return;
  }

  if (!info.canRequestPackageInstalls) {
    setNightlyUpdaterState({
      kind: "error",
      step: "permission",
      message: "Allow this app to install updates, then tap Update again.",
      update,
    });
    return;
  }

  setNightlyUpdaterState({ kind: "downloading", update, percent: 0 });
  let downloadedUri: string;
  try {
    downloadedUri = await downloadNightlyApk(update);
  } catch (error) {
    setNightlyUpdaterState({
      kind: "error",
      step: "download",
      message: failureMessage(error, "The download failed."),
      update,
    });
    return;
  }

  setNightlyUpdaterState({ kind: "verifying", update });
  // The measured hash, not the published one: a release with no digest still
  // gets a real checksum recorded alongside the pending install.
  let verifiedSha256: string;
  try {
    const inspection = await active.native.inspectApk(downloadedUri);
    const verified = verifyNightlyApk({
      expectedSha256: update.sha256,
      inspection,
      installedPackageName: info.packageName,
      installedVersionCode: info.versionCode,
    });
    if (!verified.ok) {
      await deleteDownloadDirectory();
      setNightlyUpdaterState({
        kind: "error",
        step: "verify",
        message: verified.message,
        update,
      });
      return;
    }
    verifiedSha256 = inspection.sha256;
  } catch (error) {
    await deleteDownloadDirectory();
    setNightlyUpdaterState({
      kind: "error",
      step: "verify",
      message: failureMessage(error, "The download could not be verified."),
      update,
    });
    return;
  }

  setNightlyUpdaterState({ kind: "installing", update });
  // A finished install kills this process, and Android 14 will not let a
  // process with no window relaunch itself. The "tap to open" notification the
  // native side posts is the way back in, and it needs this permission.
  await requestNotificationPermission();
  try {
    // Resolves as soon as the session is committed; a success then replaces this
    // process, so the outcome is read back on the next launch.
    await active.native.install(downloadedUri, {
      commit: update.commit,
      sha256: verifiedSha256,
    });
  } catch (error) {
    setNightlyUpdaterState({
      kind: "error",
      step: "install",
      message: failureMessage(error, "The install could not be started."),
      update,
    });
  }
}

async function requestNotificationPermission(): Promise<void> {
  if (Platform.OS !== "android" || Platform.Version < 33) return;
  try {
    await PermissionsAndroid.request("android.permission.POST_NOTIFICATIONS");
  } catch {
    // A refused or unavailable prompt only costs the notification; the install proceeds.
  }
}

async function downloadNightlyApk(update: NightlyUpdate): Promise<string> {
  const { Directory, File, Paths } = await import("expo-file-system");
  const directory = new Directory(Paths.cache, DOWNLOAD_DIRECTORY);
  // A previous attempt may have left a partial or superseded APK behind.
  if (directory.exists) directory.delete();
  directory.create({ intermediates: true });
  const target = new File(directory, update.assetName).uri;

  const { createDownloadResumable } = await import("expo-file-system/legacy");
  let lastPercent = -1;
  const download = createDownloadResumable(update.downloadUrl, target, {}, (progress) => {
    const total = progress.totalBytesExpectedToWrite || update.sizeBytes;
    if (total <= 0) return;
    const percent = Math.min(100, Math.round((progress.totalBytesWritten / total) * 100));
    // One repaint per whole percent; the callback fires far more often than that.
    if (percent === lastPercent) return;
    lastPercent = percent;
    const state = getNightlyUpdaterState();
    if (state.kind === "downloading") {
      setNightlyUpdaterState({ ...state, percent });
    }
  });

  const result = await download.downloadAsync();
  if (!result) throw new Error("The download was cancelled.");
  return result.uri;
}

async function deleteDownloadDirectory(): Promise<void> {
  try {
    const { Directory, Paths } = await import("expo-file-system");
    const directory = new Directory(Paths.cache, DOWNLOAD_DIRECTORY);
    if (directory.exists) directory.delete();
  } catch {
    // Cache cleanup is best effort: the OS reclaims this directory anyway.
  }
}

export function openNightlyInstallPermissionSettings(): void {
  const active = activeUpdater();
  if (active === null) return;
  try {
    if (active.native.openInstallPermissionSettings()) return;
  } catch {
    // Fall through to the generic app settings screen.
  }
  void Linking.openSettings();
}

/* ─── Install outcome from the previous process ──────────────────── */

/** `PackageInstaller.STATUS_FAILURE_ABORTED`: the user cancelled the confirmation. */
const PACKAGE_INSTALLER_STATUS_FAILURE_ABORTED = 3;

export function consumeNightlyInstallResult(): void {
  const active = activeUpdater();
  if (active === null) return;

  let pending: NativePendingUpdate | null;
  try {
    pending = active.native.consumePendingUpdateResult();
  } catch {
    return;
  }
  if (pending === null) return;

  // The user dismissed the system's install dialog. Nothing went wrong, so the
  // update stays on offer instead of turning into a failure.
  if (pending.failureStatus === PACKAGE_INSTALLER_STATUS_FAILURE_ABORTED) {
    const update = nightlyUpdaterUpdate(getNightlyUpdaterState());
    setNightlyUpdaterState(update ? { kind: "available", update } : { kind: "idle" });
    return;
  }

  const outcome = describeNightlyInstallOutcome(pending, active.build.commit);
  if (outcome.ok) {
    setNightlyUpdaterState({ kind: "upToDate" });
    Alert.alert("Update installed", outcome.message);
    return;
  }
  setNightlyUpdaterState({
    kind: "error",
    step: "install",
    message: outcome.message,
    update: null,
  });
  Alert.alert("Update failed", outcome.message);
}

/* ─── Last-check stamp ───────────────────────────────────────────── */

const CHECK_STAMP_FILE = "nightly-update-check.json";

async function readLastCheckedAt(): Promise<number | null> {
  try {
    const { File, Paths } = await import("expo-file-system");
    const file = new File(Paths.document, CHECK_STAMP_FILE);
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(file.textSync());
    if (typeof parsed !== "object" || parsed === null || !("checkedAtMs" in parsed)) return null;
    const value = (parsed as { readonly checkedAtMs: unknown }).checkedAtMs;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeLastCheckedAt(checkedAtMs: number): Promise<void> {
  try {
    const { File, Paths } = await import("expo-file-system");
    const file = new File(Paths.document, CHECK_STAMP_FILE);
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify({ checkedAtMs }));
  } catch {
    // Losing the stamp only costs one extra check on the next launch.
  }
}

/* ─── Auto-check ─────────────────────────────────────────────────── */

let started = false;

/**
 * Runs the launch check and arms the foreground one. Idempotent, so the mounting
 * component does not have to be a singleton.
 */
export function startNightlyUpdater(): void {
  if (started || !nightlyUpdaterApplies()) return;
  started = true;

  consumeNightlyInstallResult();
  void autoCheckIfDue();

  AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    // A failed install brings the app back to the foreground rather than
    // replacing it, so the recorded failure surfaces here too.
    consumeNightlyInstallResult();
    recoverFromMissingInstallPermission();
    void autoCheckIfDue();
  });
}

async function autoCheckIfDue(): Promise<void> {
  const lastCheckedAtMs = await readLastCheckedAt();
  if (
    !shouldAutoCheckNightly({
      lastCheckedAtMs,
      nowMs: Date.now(),
      state: getNightlyUpdaterState(),
    })
  ) {
    return;
  }
  await checkForNightlyUpdate();
}

/** The user may have granted "install unknown apps" while the app was away. */
function recoverFromMissingInstallPermission(): void {
  const active = activeUpdater();
  if (active === null) return;
  const state = getNightlyUpdaterState();
  if (state.kind !== "error" || state.step !== "permission" || state.update === null) return;
  try {
    if (!active.native.getInstallInfo().canRequestPackageInstalls) return;
  } catch {
    return;
  }
  setNightlyUpdaterState({ kind: "available", update: state.update });
}

/* ─── React binding ─────────────────────────────────────────────── */

export interface NightlyUpdaterBinding {
  readonly applies: boolean;
  readonly commit: string;
  readonly state: NightlyUpdaterState;
  readonly allowInstalls: () => void;
  readonly check: () => void;
  readonly update: () => void;
}

/**
 * Starts the updater on first mount and exposes the state plus the three things
 * the UI can do with it. Safe to call from any platform: it no-ops when the
 * nightly updater does not apply.
 */
export function useNightlyUpdater(): NightlyUpdaterBinding {
  const state = useAtomValue(nightlyUpdaterStateAtom);
  const applies = nightlyUpdaterApplies();

  useEffect(() => {
    startNightlyUpdater();
  }, []);

  const check = useCallback(() => {
    void checkForNightlyUpdate();
  }, []);

  const update = useCallback(() => {
    const pending = nightlyUpdaterUpdate(getNightlyUpdaterState());
    if (pending === null) {
      void checkForNightlyUpdate();
      return;
    }
    void startNightlyUpdate(pending);
  }, []);

  return {
    applies,
    check,
    commit: nightlyBuildCommit(),
    state,
    allowInstalls: openNightlyInstallPermissionSettings,
    update,
  };
}

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}
