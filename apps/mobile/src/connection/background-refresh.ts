import { RemoteEnvironmentAuthorization } from "@t3tools/client-runtime/authorization";
import {
  ConnectionBlockedError,
  CredentialStore,
  type PreparedConnection,
  ProfileStore,
} from "@t3tools/client-runtime/connection";
import {
  ClientPresentation,
  CloudSession,
  ConnectionTargetStore,
  EnvironmentCacheStore,
  RelayDeviceIdentity,
} from "@t3tools/client-runtime/platform";
import { ManagedRelay, type ManagedRelaySession } from "@t3tools/client-runtime/relay";
import { fetchEnvironmentShellSnapshot } from "@t3tools/client-runtime/state/shell";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { AppState } from "react-native";

import { resolveHeadlessCloudSession } from "../features/cloud/headlessCloudSession";
import * as Runtime from "../lib/runtime";
import * as MobilePreferences from "../persistence/mobile-preferences";
import * as MobileSecureStorage from "../persistence/mobile-secure-storage";
import * as MobileStorage from "../persistence/mobile-storage";
import { MOBILE_BACKGROUND_RECONNECT_AFTER_MS } from "./app-state-wakeups";
import {
  BACKGROUND_REFRESH_BUDGET_MS,
  BACKGROUND_REFRESH_CONCURRENCY,
  BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS,
  BACKGROUND_REFRESH_INTERVAL_MINUTES,
  BACKGROUND_REFRESH_SESSION_TIMEOUT_MS,
  type BackgroundRefreshEnvironmentResult,
  type BackgroundRefreshRecord,
  type BackgroundRefreshStatus,
  type BackgroundRefreshTarget,
  type BackgroundRefreshTrigger,
  backgroundRefreshTargets,
  describeBackgroundRefreshFailure,
  shouldRegisterBackgroundRefresh,
  summarizeBackgroundRefresh,
} from "./background-refresh-plan";
import {
  mobileClientPresentation,
  mobileCloudSession,
  mobileRelayDeviceIdentity,
} from "./platform";
import { connectionStorageLayer } from "./storage";

const BACKGROUND_REFRESH_TASK = "t3code.connection.background-refresh";

const LAST_RUN_KEY = "t3code.background-refresh.last-run";

/**
 * Everything the worker needs to fetch a shell snapshot over HTTP and write it
 * into the same SQLite cache the live client reads on launch. The connection
 * supervisor, its socket, and its retry ladder are deliberately absent: a
 * wakeup is too short for them and the snapshot endpoint is the whole payload.
 *
 * ponytail: this builds its own connection catalog store, so a relay token
 * minted here and a catalog write made by a live foreground session can
 * overwrite each other. Android only runs the worker while the app is
 * backgrounded and a lost token is re-minted on the next use, so the window is
 * small and self-healing. Share one catalog store if either stops being true.
 */
function backgroundRefreshLayer(session: ManagedRelaySession | null) {
  const capabilitiesLayer = Layer.effectContext(
    Effect.gen(function* () {
      const storage = yield* MobileStorage.MobileStorage;
      return Context.make(
        CloudSession,
        mobileCloudSession(() => session),
      ).pipe(
        Context.add(RelayDeviceIdentity, mobileRelayDeviceIdentity(storage)),
        Context.add(ClientPresentation, mobileClientPresentation),
      );
    }),
  );
  return RemoteEnvironmentAuthorization.layer.pipe(
    Layer.provideMerge(Layer.merge(connectionStorageLayer, capabilitiesLayer)),
  );
}

const prepareTarget = Effect.fn("mobile.backgroundRefresh.prepare")(function* (
  target: BackgroundRefreshTarget,
) {
  if (target._tag === "RelayConnectionTarget") {
    const remote = yield* RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization;
    const authorized = yield* remote.authorizeDpopHttp({
      expectedEnvironmentId: target.environmentId,
    });
    return {
      environmentId: authorized.environmentId,
      label: authorized.label,
      httpBaseUrl: authorized.httpBaseUrl,
      // Nothing downstream of the snapshot fetch opens a socket.
      socketUrl: authorized.httpBaseUrl,
      httpAuthorization: authorized.httpAuthorization,
      target,
    } satisfies PreparedConnection;
  }

  const profiles = yield* ProfileStore.ConnectionProfileStore;
  const credentials = yield* CredentialStore.ConnectionCredentialStore;
  const profile = yield* profiles.get(target.connectionId);
  const credential = yield* credentials.get(target.connectionId);
  if (Option.isNone(profile) || profile.value._tag !== "BearerConnectionProfile") {
    return yield* new ConnectionBlockedError({
      reason: "configuration",
      detail: `Connection ${target.connectionId} has no direct-pairing profile.`,
    });
  }
  if (Option.isNone(credential) || credential.value._tag !== "BearerConnectionCredential") {
    return yield* new ConnectionBlockedError({
      reason: "authentication",
      detail: `Connection ${target.connectionId} has no saved credential.`,
    });
  }
  // Deliberately skips the descriptor and websocket-ticket round trips the
  // foreground resolver makes. A stale token surfaces as a failed snapshot
  // fetch, which is the same signal one wasted request earlier.
  return {
    environmentId: target.environmentId,
    label: target.label,
    httpBaseUrl: profile.value.httpBaseUrl,
    socketUrl: profile.value.wsBaseUrl,
    httpAuthorization: { _tag: "Bearer" as const, token: credential.value.token },
    target,
  } satisfies PreparedConnection;
});

const refreshEnvironment = Effect.fn("mobile.backgroundRefresh.environment")(function* (
  target: BackgroundRefreshTarget,
  session: SessionResolution,
) {
  const label = target.label;
  // A relay environment cannot be authorized without T3 Connect, and saying so
  // is the whole diagnosis on a phone that never signed in headlessly.
  if (target._tag === "RelayConnectionTarget" && session.session === null) {
    return {
      label,
      outcome: "skipped",
      reason: session.reason ?? "no T3 Connect session",
    } satisfies BackgroundRefreshEnvironmentResult;
  }
  const cache = yield* EnvironmentCacheStore;
  const prepared = yield* prepareTarget(target).pipe(Effect.result);
  if (prepared._tag === "Failure") {
    const reason = describeBackgroundRefreshFailure(prepared.failure);
    yield* Effect.logInfo("Skipping a background refresh for an unauthorized environment.").pipe(
      Effect.annotateLogs({ environmentId: target.environmentId, reason }),
    );
    return { label, outcome: "skipped", reason } satisfies BackgroundRefreshEnvironmentResult;
  }
  // The loader service swallows the cause into `Option.none`, and the cause is
  // exactly what the Settings row has to show, so this calls the fetch directly.
  const signer = yield* Effect.serviceOption(ManagedRelay.ManagedRelayDpopSigner);
  const remoteAuthorization = yield* Effect.serviceOption(
    RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization,
  );
  const snapshot = yield* fetchEnvironmentShellSnapshot({
    prepared: prepared.success,
    signer,
    remoteAuthorization,
  }).pipe(Effect.result);
  if (snapshot._tag === "Failure") {
    const reason = describeBackgroundRefreshFailure(snapshot.failure);
    yield* Effect.logWarning("A background shell refresh did not come back.").pipe(
      Effect.annotateLogs({ environmentId: target.environmentId, reason }),
    );
    return { label, outcome: "failed", reason } satisfies BackgroundRefreshEnvironmentResult;
  }
  const saved = yield* cache.saveShell(target.environmentId, snapshot.success).pipe(Effect.result);
  if (saved._tag === "Failure") {
    yield* Effect.logWarning("Could not persist a background shell refresh.").pipe(
      Effect.annotateLogs({
        environmentId: target.environmentId,
        error: saved.failure.message,
      }),
    );
    return {
      label,
      outcome: "failed",
      reason: "could not write the cache",
    } satisfies BackgroundRefreshEnvironmentResult;
  }
  return { label, outcome: "refreshed" } satisfies BackgroundRefreshEnvironmentResult;
});

const refreshAllEnvironments = Effect.fn("mobile.backgroundRefresh.run")(function* (
  session: SessionResolution,
) {
  const targetStore = yield* ConnectionTargetStore;
  const targets = backgroundRefreshTargets(
    yield* targetStore.list,
    yield* targetStore.listDisabled,
  );
  return yield* Effect.forEach(
    targets,
    (target) =>
      refreshEnvironment(target, session).pipe(
        Effect.timeoutOrElse({
          duration: BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS,
          orElse: () =>
            Effect.succeed({
              label: target.label,
              outcome: "failed",
              reason: "timed out",
            } satisfies BackgroundRefreshEnvironmentResult),
        }),
        // One environment that fails in a way nobody typed must not take the
        // other environments, or the run record, down with it.
        Effect.catchCause((cause) =>
          Effect.logWarning("A background refresh environment failed unexpectedly.").pipe(
            Effect.annotateLogs({ environmentId: target.environmentId, cause: String(cause) }),
            Effect.as({
              label: target.label,
              outcome: "failed",
              reason: "unexpected error",
            } satisfies BackgroundRefreshEnvironmentResult),
          ),
        ),
      ),
    { concurrency: BACKGROUND_REFRESH_CONCURRENCY },
  );
});

function parseEnvironments(raw: unknown): ReadonlyArray<BackgroundRefreshEnvironmentResult> {
  if (!Array.isArray(raw)) return [];
  const results: Array<BackgroundRefreshEnvironmentResult> = [];
  for (const entry of raw as ReadonlyArray<Partial<BackgroundRefreshEnvironmentResult>>) {
    if (typeof entry?.label !== "string") continue;
    if (
      entry.outcome !== "refreshed" &&
      entry.outcome !== "skipped" &&
      entry.outcome !== "failed"
    ) {
      continue;
    }
    results.push({
      label: entry.label,
      outcome: entry.outcome,
      ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}),
    });
  }
  return results;
}

function parseRecord(raw: string): BackgroundRefreshRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Partial<BackgroundRefreshRecord> & { readonly environments?: unknown };
  if (
    typeof record.finishedAtMs !== "number" ||
    typeof record.refreshed !== "number" ||
    typeof record.skipped !== "number" ||
    typeof record.failed !== "number"
  ) {
    return null;
  }
  return {
    finishedAtMs: record.finishedAtMs,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : 0,
    refreshed: record.refreshed,
    skipped: record.skipped,
    failed: record.failed,
    // Records written before the run carried a trigger came from the worker,
    // which was the only thing that wrote one.
    trigger: record.trigger === "foreground" ? "foreground" : "worker",
    workerRanAtMs:
      typeof record.workerRanAtMs === "number"
        ? record.workerRanAtMs
        : record.trigger === "foreground"
          ? null
          : record.finishedAtMs,
    environments: parseEnvironments(record.environments),
    ...(typeof record.error === "string" ? { error: record.error } : {}),
  };
}

const readRecord = Effect.gen(function* () {
  const storage = yield* MobileSecureStorage.MobileSecureStorage;
  const raw = yield* storage.getItem(LAST_RUN_KEY);
  return raw === null ? null : parseRecord(raw);
}).pipe(Effect.catch(() => Effect.succeed(null)));

const writeRecord = Effect.fn("mobile.backgroundRefresh.writeRecord")(function* (
  record: BackgroundRefreshRecord,
) {
  const storage = yield* MobileSecureStorage.MobileSecureStorage;
  yield* storage.setItem(LAST_RUN_KEY, JSON.stringify(record));
});

let lastRecord: BackgroundRefreshRecord | null = null;
let recordLoad: Promise<void> | null = null;
const recordListeners = new Set<() => void>();

function publishRecord(record: BackgroundRefreshRecord | null): void {
  lastRecord = record;
  for (const listener of recordListeners) listener();
}

/** Reads the saved record once per launch, whoever asks for it first. */
function loadRecordOnce(): Promise<void> {
  recordLoad ??= Runtime.runtime.runPromise(readRecord).then(publishRecord, () => {
    publishRecord(null);
  });
  return recordLoad;
}

/** Settings reads this through `useSyncExternalStore`. */
export function subscribeBackgroundRefreshRecord(listener: () => void): () => void {
  recordListeners.add(listener);
  void loadRecordOnce();
  return () => {
    recordListeners.delete(listener);
  };
}

export function backgroundRefreshRecordSnapshot(): BackgroundRefreshRecord | null {
  return lastRecord;
}

let status: BackgroundRefreshStatus = "unknown";
let statusProbed = false;
const statusListeners = new Set<() => void>();

/**
 * Android's module answers "available" unconditionally, so a restricted status
 * only ever comes from iOS or Expo Go. It still beats guessing, and it is the
 * one signal the OS hands us for free.
 */
export async function refreshBackgroundRefreshStatus(): Promise<void> {
  const next = await BackgroundTask.getStatusAsync().then(
    (value) =>
      value === BackgroundTask.BackgroundTaskStatus.Restricted
        ? ("restricted" as const)
        : ("available" as const),
    () => "unknown" as const,
  );
  if (next === status) return;
  status = next;
  for (const listener of statusListeners) listener();
}

export function subscribeBackgroundRefreshStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  if (!statusProbed) {
    statusProbed = true;
    void refreshBackgroundRefreshStatus();
  }
  return () => {
    statusListeners.delete(listener);
  };
}

export function backgroundRefreshStatusSnapshot(): BackgroundRefreshStatus {
  return status;
}

interface SessionResolution {
  readonly session: ManagedRelaySession | null;
  /** Why there is no session, when that is the interesting part. */
  readonly reason: string | null;
}

/**
 * A promise that cannot outlive the OS wakeup budget. `clerk.load()` and
 * `session.getToken()` both wait on the network with no timeout of their own,
 * and a wakeup that hangs never enqueues the next one (see the note on the
 * task definition below).
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Secure storage is on-device and fast; this only guards against a stuck read. */
const RECORD_READ_TIMEOUT_MS = 2_000;

function resolveSession(): Promise<SessionResolution> {
  return withTimeout(
    resolveHeadlessCloudSession().then(
      (session) => ({
        session,
        reason: session === null ? "no T3 Connect session" : null,
      }),
      (cause: unknown) => ({ session: null, reason: describeBackgroundRefreshFailure(cause) }),
    ),
    BACKGROUND_REFRESH_SESSION_TIMEOUT_MS,
    { session: null, reason: "T3 Connect sign-in timed out" },
  );
}

/**
 * One wakeup: authenticate every reachable saved environment, pull its shell
 * snapshot over HTTP, write it to the client cache, record what happened.
 * Every await is guarded, because a rejection here would leave the Settings row
 * showing the previous run forever.
 */
async function executeRefresh(trigger: BackgroundRefreshTrigger) {
  const startedAtMs = Date.now();
  // A headless launch starts the read and the run in the same tick, and the
  // previous record is what carries "the system last woke us at" forward.
  await withTimeout(loadRecordOnce(), RECORD_READ_TIMEOUT_MS, undefined);
  const previous = lastRecord;
  let error: string | undefined;
  const session = await resolveSession();
  const environments = await Runtime.runtime
    .runPromise(
      refreshAllEnvironments(session).pipe(
        Effect.provide(backgroundRefreshLayer(session.session)),
        Effect.timeoutOrElse({
          duration: BACKGROUND_REFRESH_BUDGET_MS,
          orElse: () => {
            error = "ran out of time";
            return Effect.succeed([] as ReadonlyArray<BackgroundRefreshEnvironmentResult>);
          },
        }),
        Effect.catchCause((cause) => {
          error = describeBackgroundRefreshFailure(cause);
          return Effect.logWarning("The background refresh run failed.").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as([] as ReadonlyArray<BackgroundRefreshEnvironmentResult>),
          );
        }),
      ),
    )
    .catch((cause: unknown) => {
      error = describeBackgroundRefreshFailure(cause);
      return [] as ReadonlyArray<BackgroundRefreshEnvironmentResult>;
    });
  // Nothing to refresh is not a failure, but nothing to refresh *and* no
  // session is the state the user is actually in.
  if (environments.length === 0 && error === undefined && session.reason !== null) {
    error = session.reason;
  }
  const record = summarizeBackgroundRefresh({
    environments,
    startedAtMs,
    finishedAtMs: Date.now(),
    trigger,
    previousWorkerRanAtMs: previous?.workerRanAtMs ?? null,
    ...(error === undefined ? {} : { error }),
  });
  await withTimeout(
    Runtime.runtime.runPromise(writeRecord(record)).catch(() => undefined),
    RECORD_READ_TIMEOUT_MS,
    undefined,
  );
  publishRecord(record);
  return record;
}

let runInFlight: Promise<BackgroundRefreshRecord> | null = null;

/**
 * The single entry point for a refresh. A wakeup that lands while a resume is
 * still running joins that run instead of racing it for the same cache rows.
 *
 * ponytail: the joined run keeps the first caller's trigger, so a wakeup that
 * arrives mid-resume is recorded as a foreground run. Split the two if the
 * "last woken by the system" line in Diagnostics ever has to be exact.
 */
export function runBackgroundRefresh(
  trigger: BackgroundRefreshTrigger,
): Promise<BackgroundRefreshRecord> {
  if (runInFlight !== null) return runInFlight;
  const run = executeRefresh(trigger).finally(() => {
    runInFlight = null;
  });
  runInFlight = run;
  return run;
}

/**
 * Android ignores the returned value: the consumer completes the wakeup as soon
 * as the JS promise settles, whatever it settled with. What it cannot survive
 * is a promise that never settles or a throw, because the next wakeup is only
 * enqueued after this one returns, and a failed run marks the already-appended
 * next run failed with it. So this always settles, and only reports a failure
 * when the run never got as far as an environment.
 */
TaskManager.defineTask(BACKGROUND_REFRESH_TASK, async () => {
  try {
    const record = await runBackgroundRefresh("worker");
    return record.error !== undefined && record.refreshed + record.skipped + record.failed === 0
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (cause) {
    console.warn("[background-refresh] the wakeup fell over", cause);
    return BackgroundTask.BackgroundTaskResult.Success;
  }
});

const countRefreshableEnvironments = Effect.fn(
  "mobile.backgroundRefresh.countRefreshableEnvironments",
)(function* () {
  const targetStore = yield* ConnectionTargetStore;
  return backgroundRefreshTargets(yield* targetStore.list, yield* targetStore.listDisabled).length;
});

let registered: boolean | null = null;
let enabledPreference = true;

/**
 * Matches the OS registration to "the user wants this and has something to
 * refresh". Cheap enough to call on every launch and whenever the switch moves.
 */
export async function reconcileBackgroundRefreshRegistration(enabled: boolean): Promise<void> {
  enabledPreference = enabled;
  const refreshableEnvironmentCount = await Runtime.runtime
    .runPromise(
      countRefreshableEnvironments().pipe(
        Effect.provide(connectionStorageLayer),
        Effect.catchCause(() => Effect.succeed(0)),
      ),
    )
    .catch(() => 0);
  const shouldRegister = shouldRegisterBackgroundRefresh({
    enabled,
    refreshableEnvironmentCount,
  });
  if (registered === shouldRegister) return;
  try {
    if (shouldRegister) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_REFRESH_TASK, {
        minimumInterval: BACKGROUND_REFRESH_INTERVAL_MINUTES,
      });
    } else {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_REFRESH_TASK);
    }
    registered = shouldRegister;
  } catch (cause) {
    // A device with background work disabled, or a build without the native
    // module, must not take the launch down with it.
    console.warn("[background-refresh] could not update the task registration", cause);
  }
  void refreshBackgroundRefreshStatus();
}

/** Unset means on: a saved environment should stay fresh without being asked. */
export function backgroundRefreshEnabled(
  preferences: Pick<MobilePreferences.Preferences, "backgroundRefreshEnabled">,
): boolean {
  return preferences.backgroundRefreshEnabled !== false;
}

/**
 * Android decides whether the worker ever runs, and on a phone with battery
 * optimisation on it often decides no. A resume that finds the newest run older
 * than the reconnect window pulls the same snapshot over HTTP itself, so the
 * thread list is current by the time the socket finishes connecting.
 */
function refreshOnResume(): void {
  AppState.addEventListener("change", (state) => {
    if (state !== "active" || !enabledPreference) return;
    const finishedAtMs = lastRecord?.finishedAtMs ?? 0;
    if (Date.now() - finishedAtMs < MOBILE_BACKGROUND_RECONNECT_AFTER_MS) return;
    void runBackgroundRefresh("foreground").catch(() => undefined);
  });
}

/**
 * Called once per launch from `index.ts`. Defining the task happens at import;
 * this only matches the OS registration to the current preference and catalog.
 */
export async function startBackgroundRefresh(): Promise<void> {
  void loadRecordOnce();
  refreshOnResume();
  const preferences = await Runtime.runtime
    .runPromise(
      MobilePreferences.MobilePreferencesStore.pipe(
        Effect.flatMap((store) => store.load),
        Effect.catch(() => Effect.succeed<MobilePreferences.Preferences>({})),
      ),
    )
    .catch(() => ({}) as MobilePreferences.Preferences);
  await reconcileBackgroundRefreshRegistration(backgroundRefreshEnabled(preferences));
}
