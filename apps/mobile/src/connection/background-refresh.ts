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
import type { ManagedRelaySession } from "@t3tools/client-runtime/relay";
import { ShellSnapshotLoader, shellSnapshotLoaderLayer } from "@t3tools/client-runtime/state/shell";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { resolveHeadlessCloudSession } from "../features/cloud/headlessCloudSession";
import * as Runtime from "../lib/runtime";
import * as MobilePreferences from "../persistence/mobile-preferences";
import * as MobileSecureStorage from "../persistence/mobile-secure-storage";
import * as MobileStorage from "../persistence/mobile-storage";
import {
  BACKGROUND_REFRESH_BUDGET_MS,
  BACKGROUND_REFRESH_CONCURRENCY,
  BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS,
  BACKGROUND_REFRESH_INTERVAL_MINUTES,
  type BackgroundRefreshOutcome,
  type BackgroundRefreshRecord,
  type BackgroundRefreshTarget,
  backgroundRefreshTargets,
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
  return Layer.mergeAll(shellSnapshotLoaderLayer, RemoteEnvironmentAuthorization.layer).pipe(
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
) {
  const cache = yield* EnvironmentCacheStore;
  const loader = yield* ShellSnapshotLoader;
  const prepared = yield* prepareTarget(target).pipe(Effect.result);
  if (prepared._tag === "Failure") {
    yield* Effect.logInfo("Skipping a background refresh for an unauthorized environment.").pipe(
      Effect.annotateLogs({
        environmentId: target.environmentId,
        reason: prepared.failure.detail,
      }),
    );
    return "skipped" as BackgroundRefreshOutcome;
  }
  // The loader already swallows transport failures into `none`.
  const snapshot = yield* loader.load(prepared.success);
  if (Option.isNone(snapshot)) return "failed" as BackgroundRefreshOutcome;
  yield* cache
    .saveShell(target.environmentId, snapshot.value)
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("Could not persist a background shell refresh.").pipe(
          Effect.annotateLogs({ environmentId: target.environmentId, error: error.message }),
        ),
      ),
    );
  return "refreshed" as BackgroundRefreshOutcome;
});

const refreshAllEnvironments = Effect.fn("mobile.backgroundRefresh.run")(function* () {
  const targetStore = yield* ConnectionTargetStore;
  const targets = backgroundRefreshTargets(
    yield* targetStore.list,
    yield* targetStore.listDisabled,
  );
  return yield* Effect.forEach(
    targets,
    (target) =>
      refreshEnvironment(target).pipe(
        Effect.timeoutOrElse({
          duration: BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS,
          orElse: () => Effect.succeed("failed" as BackgroundRefreshOutcome),
        }),
      ),
    { concurrency: BACKGROUND_REFRESH_CONCURRENCY },
  );
});

function parseRecord(raw: string): BackgroundRefreshRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Partial<BackgroundRefreshRecord>;
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
let lastRecordLoaded = false;
const recordListeners = new Set<() => void>();

function publishRecord(record: BackgroundRefreshRecord | null): void {
  lastRecord = record;
  lastRecordLoaded = true;
  for (const listener of recordListeners) listener();
}

/** Settings reads this through `useSyncExternalStore`. */
export function subscribeBackgroundRefreshRecord(listener: () => void): () => void {
  recordListeners.add(listener);
  if (!lastRecordLoaded) {
    lastRecordLoaded = true;
    void Runtime.runtime
      .runPromise(readRecord)
      .then(publishRecord)
      .catch(() => publishRecord(null));
  }
  return () => {
    recordListeners.delete(listener);
  };
}

export function backgroundRefreshRecordSnapshot(): BackgroundRefreshRecord | null {
  return lastRecord;
}

/**
 * One wakeup: authenticate every reachable saved environment, pull its shell
 * snapshot over HTTP, write it to the client cache, record what happened.
 */
async function runBackgroundRefresh(): Promise<BackgroundRefreshRecord> {
  const startedAtMs = Date.now();
  const session = await resolveHeadlessCloudSession().catch(() => null);
  const outcomes = await Runtime.runtime
    .runPromise(
      refreshAllEnvironments().pipe(
        Effect.provide(backgroundRefreshLayer(session)),
        Effect.timeoutOrElse({
          duration: BACKGROUND_REFRESH_BUDGET_MS,
          orElse: () => Effect.succeed([] as ReadonlyArray<BackgroundRefreshOutcome>),
        }),
        Effect.catchCause((cause) =>
          Effect.logWarning("The background refresh run failed.").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as([] as ReadonlyArray<BackgroundRefreshOutcome>),
          ),
        ),
      ),
    )
    .catch(() => [] as ReadonlyArray<BackgroundRefreshOutcome>);
  const record = summarizeBackgroundRefresh({
    outcomes,
    startedAtMs,
    finishedAtMs: Date.now(),
  });
  await Runtime.runtime.runPromise(writeRecord(record)).catch(() => undefined);
  publishRecord(record);
  return record;
}

TaskManager.defineTask(BACKGROUND_REFRESH_TASK, async () => {
  const record = await runBackgroundRefresh();
  return record.failed > 0 && record.refreshed === 0
    ? BackgroundTask.BackgroundTaskResult.Failed
    : BackgroundTask.BackgroundTaskResult.Success;
});

const countRefreshableEnvironments = Effect.fn(
  "mobile.backgroundRefresh.countRefreshableEnvironments",
)(function* () {
  const targetStore = yield* ConnectionTargetStore;
  return backgroundRefreshTargets(yield* targetStore.list, yield* targetStore.listDisabled).length;
});

let registered: boolean | null = null;

/**
 * Matches the OS registration to "the user wants this and has something to
 * refresh". Cheap enough to call on every launch and whenever the switch moves.
 */
export async function reconcileBackgroundRefreshRegistration(enabled: boolean): Promise<void> {
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
}

/** Unset means on: a saved environment should stay fresh without being asked. */
export function backgroundRefreshEnabled(
  preferences: Pick<MobilePreferences.Preferences, "backgroundRefreshEnabled">,
): boolean {
  return preferences.backgroundRefreshEnabled !== false;
}

/**
 * Called once per launch from `index.ts`. Defining the task happens at import;
 * this only matches the OS registration to the current preference and catalog.
 */
export async function startBackgroundRefresh(): Promise<void> {
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
