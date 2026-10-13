import {
  ConnectionBlockedError,
  CredentialStore,
  credentialConnectionId,
  type PreparedConnection,
  ProfileStore,
} from "@t3tools/client-runtime/connection";
import { ClientCapabilities, Persistence } from "@t3tools/client-runtime/platform";
import { ManagedRelay, type ManagedRelaySession } from "@t3tools/client-runtime/relay";
import {
  type DeferredShellSnapshot,
  ShellSnapshotLoader,
} from "@t3tools/client-runtime/state/shell";
import type { OrchestrationV2ShellSnapshot } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import { AppRegistry } from "react-native";

// ponytail: client-runtime does not export the authorization service and is
// read-only here, so the refresh reaches into its source. Switch to the package
// path if upstream ever exports it from "@t3tools/client-runtime/authorization".
import * as RemoteEnvironmentAuthorization from "../../../../packages/client-runtime/src/authorization/service.ts";
import { postTurnCompletions } from "../features/agent-awareness/turnCompletionNotifier";
import { resolveHeadlessCloudSession } from "../features/cloud/headlessCloudSession";
import * as Runtime from "../lib/runtime";
import * as MobilePreferences from "../persistence/mobile-preferences";
import * as MobileStorage from "../persistence/mobile-storage";
import { backgroundRefreshNative } from "./background-refresh-native";
import {
  BACKGROUND_REFRESH_BUDGET_MS,
  BACKGROUND_REFRESH_CONCURRENCY,
  BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS,
  BACKGROUND_REFRESH_REQUEST_TIMEOUT_MS,
  BACKGROUND_REFRESH_RETRY_DELAY_MS,
  BACKGROUND_REFRESH_SESSION_TIMEOUT_MS,
  type BackgroundRefreshEnvironment,
  type BackgroundRefreshEnvironmentResult,
  type BackgroundRefreshNativeStatus,
  type BackgroundRefreshRecord,
  type BackgroundRefreshTarget,
  backgroundRefreshEnvironments,
  describeBackgroundRefreshFailure,
  isNothingToTry,
  isRetryableBackgroundRefreshFailure,
  summarizeBackgroundRefresh,
} from "./background-refresh-plan";
import {
  mobileClientPresentation,
  mobileCloudSession,
  mobileRelayDeviceIdentity,
} from "./platform";
import { offerShell, trackShellFetch } from "./shell-handoff";
import * as ConnectionStorage from "./storage";

/** The key the native worker starts (BackgroundRefresh.TASK_KEY). */
const BACKGROUND_REFRESH_TASK = "T3BackgroundRefresh";

/**
 * Everything a run needs to fetch a shell snapshot over HTTP and write it into
 * the cache the live client hydrates from. No supervisor, socket, or retry
 * ladder: one request per environment is the whole job. The catalog store here
 * shares its cache and lock with the live connection's (catalog-store.ts).
 */
function backgroundRefreshLayer(readSession: () => ManagedRelaySession | null) {
  const capabilities = Layer.effectContext(
    Effect.gen(function* () {
      const storage = yield* MobileStorage.MobileStorage;
      return Context.make(ClientCapabilities.CloudSession, mobileCloudSession(readSession)).pipe(
        Context.add(ClientCapabilities.RelayDeviceIdentity, mobileRelayDeviceIdentity(storage)),
        Context.add(ClientCapabilities.ClientPresentation, mobileClientPresentation),
      );
    }),
  );
  return RemoteEnvironmentAuthorization.layer.pipe(
    Layer.provideMerge(Layer.merge(ConnectionStorage.layer, capabilities)),
  );
}

/** A T3 Connect route with no Clerk session to authorize it: nothing to try. */
class MissingSession extends Data.TaggedError("BackgroundRefreshMissingSession")<{
  readonly reason: string;
}> {}

const requireSession = Effect.fn("mobile.backgroundRefresh.requireSession")(function* (
  session: SessionSource,
) {
  const resolved = yield* Effect.promise(session);
  if (resolved.session === null) {
    return yield* new MissingSession({ reason: resolved.reason ?? "no T3 Connect session" });
  }
});

/**
 * Authorizes one route for HTTP only. The descriptor and websocket-ticket
 * round trips the foreground resolver makes are skipped: a stale credential
 * shows up as a failed snapshot fetch, the same signal one request earlier.
 * Only T3 Connect routes wait on Clerk, so a direct pairing starts at once.
 */
const prepareRoute = Effect.fn("mobile.backgroundRefresh.prepare")(function* (
  target: BackgroundRefreshTarget,
  session: SessionSource,
) {
  const remote = yield* RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization;
  if (target._tag === "RelayConnectionTarget") {
    yield* requireSession(session);
    const authorized = yield* remote.authorizeDpopHttp({
      expectedEnvironmentId: target.environmentId,
    });
    return {
      ...authorized,
      // Nothing downstream of the snapshot fetch opens a socket.
      socketUrl: authorized.httpBaseUrl,
      target,
    } satisfies PreparedConnection;
  }

  const profile = yield* (yield* ProfileStore.ConnectionProfileStore).get(target.connectionId);
  if (Option.isNone(profile) || profile.value._tag !== "BearerConnectionProfile") {
    return yield* new ConnectionBlockedError({
      reason: "configuration",
      detail: `Connection ${target.connectionId} has no direct-pairing profile.`,
    });
  }
  const { httpBaseUrl, wsBaseUrl } = profile.value;
  if (profile.value.authorization === "t3-connect") {
    yield* requireSession(session);
    // The relay's token also works on the environment's own address; the
    // request keeps this route's origin and only renews the token.
    const authorized = yield* remote.authorizeDpopHttp({
      expectedEnvironmentId: target.environmentId,
    });
    return {
      environmentId: target.environmentId,
      label: target.label,
      httpBaseUrl,
      socketUrl: wsBaseUrl,
      httpAuthorization: authorized.httpAuthorization,
      target,
    } satisfies PreparedConnection;
  }
  // A learned route borrows the credential of the route it was learned from.
  const credential = yield* (yield* CredentialStore.ConnectionCredentialStore).get(
    credentialConnectionId(target.connectionId),
  );
  if (Option.isNone(credential) || credential.value._tag !== "BearerConnectionCredential") {
    return yield* new ConnectionBlockedError({
      reason: "authentication",
      detail: `Connection ${target.connectionId} has no saved credential.`,
    });
  }
  return {
    environmentId: target.environmentId,
    label: target.label,
    httpBaseUrl,
    socketUrl: wsBaseUrl,
    httpAuthorization: { _tag: "Bearer" as const, token: credential.value.token },
    target,
  } satisfies PreparedConnection;
});

/** The cache must hold each thread's pull request links, which the decode defers. */
const withPullRequests = Effect.fnUntraced(function* (deferred: DeferredShellSnapshot) {
  const { loadPullRequests, ...snapshot } = deferred;
  if (loadPullRequests === undefined) return snapshot satisfies OrchestrationV2ShellSnapshot;
  const links = yield* loadPullRequests;
  return {
    ...snapshot,
    threads: snapshot.threads.map((thread) => {
      const pullRequests = links.get(thread.id);
      return pullRequests === undefined ? thread : { ...thread, pullRequests };
    }),
  } satisfies OrchestrationV2ShellSnapshot;
});

const fetchRoute = Effect.fn("mobile.backgroundRefresh.fetchRoute")(function* (
  target: BackgroundRefreshTarget,
  session: SessionSource,
) {
  const prepared = yield* prepareRoute(target, session);
  // The loader service swallows the cause into `Option.none`, and the cause is
  // what the Settings row has to show, so this calls the fetch directly.
  const deferred = yield* ShellSnapshotLoader.fetchEnvironmentShellSnapshot({
    prepared,
    signer: yield* Effect.serviceOption(ManagedRelay.ManagedRelayDpopSigner),
    remoteAuthorization: yield* Effect.serviceOption(
      RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization,
    ),
    timeoutMs: BACKGROUND_REFRESH_REQUEST_TIMEOUT_MS,
  });
  return yield* withPullRequests(deferred);
});

/** The first route that answers wins; a LAN route away from home fails over to the next. */
const fetchEnvironment = Effect.fn("mobile.backgroundRefresh.fetchEnvironment")(function* (
  environment: BackgroundRefreshEnvironment,
  session: SessionSource,
) {
  let lastFailure: unknown = null;
  for (const [index, route] of environment.routes.entries()) {
    // The next route is the retry; only the last one gets a second attempt.
    const last = index === environment.routes.length - 1;
    const result = yield* fetchRoute(route, session).pipe(
      Effect.retry({
        times: last ? 1 : 0,
        schedule: Schedule.spaced(BACKGROUND_REFRESH_RETRY_DELAY_MS),
        while: isRetryableBackgroundRefreshFailure,
      }),
      Effect.result,
    );
    if (result._tag === "Success") return { snapshot: result.success, failure: null };
    lastFailure = result.failure;
  }
  return { snapshot: null, failure: lastFailure };
});

const refreshEnvironment = Effect.fn("mobile.backgroundRefresh.environment")(function* (
  environment: BackgroundRefreshEnvironment,
  session: SessionSource,
) {
  const named = { environmentId: environment.environmentId, label: environment.label };
  const fetched = yield* fetchEnvironment(environment, session);
  if (fetched.snapshot === null) {
    const reason = describeBackgroundRefreshFailure(fetched.failure);
    yield* Effect.logWarning("A background shell refresh did not come back.").pipe(
      Effect.annotateLogs({ environmentId: environment.environmentId, reason }),
    );
    return {
      result: {
        ...named,
        outcome: isNothingToTry(fetched.failure) ? "skipped" : "failed",
        reason,
      },
      alerts: 0,
    } satisfies EnvironmentRun;
  }

  const snapshot = fetched.snapshot;
  offerShell(environment.environmentId, snapshot);
  const cache = yield* Persistence.EnvironmentCacheStore;
  const previous = yield* cache.loadShell(environment.environmentId).pipe(
    Effect.map(Option.getOrNull),
    Effect.orElseSucceed(() => null),
  );
  const saved = yield* cache.saveShell(environment.environmentId, snapshot).pipe(Effect.result);
  const alerts = yield* Effect.promise(() =>
    postTurnCompletions({
      environmentId: environment.environmentId,
      hasRelayRoute: environment.routes.some((route) => route._tag === "RelayConnectionTarget"),
      previous: previous?.threads ?? null,
      current: snapshot.threads,
      projects: snapshot.projects,
    }).catch(() => 0),
  );
  if (saved._tag === "Failure") {
    yield* Effect.logWarning("Could not persist a background shell refresh.").pipe(
      Effect.annotateLogs({
        environmentId: environment.environmentId,
        error: saved.failure.message,
      }),
    );
    return {
      result: { ...named, outcome: "failed", reason: "could not write the cache" },
      alerts,
    } satisfies EnvironmentRun;
  }
  return { result: { ...named, outcome: "refreshed" }, alerts } satisfies EnvironmentRun;
});

interface EnvironmentRun {
  readonly result: BackgroundRefreshEnvironmentResult;
  readonly alerts: number;
}

const refreshAllEnvironments = Effect.fn("mobile.backgroundRefresh.run")(function* (
  session: SessionSource,
) {
  const targetStore = yield* Persistence.ConnectionTargetStore;
  const environments = backgroundRefreshEnvironments(
    yield* targetStore.list,
    yield* targetStore.listDisabled,
  );
  // Registered up front, so a reconnect that starts during the run waits for
  // its snapshot instead of downloading the same shell.
  const settled = new Map(
    environments.map((environment) => {
      let settle = () => {};
      void trackShellFetch(
        environment.environmentId,
        new Promise<void>((resolve) => (settle = resolve)),
      );
      return [environment.environmentId, settle] as const;
    }),
  );
  return yield* Effect.forEach(
    environments,
    (environment) =>
      refreshEnvironment(environment, session).pipe(
        Effect.timeoutOrElse({
          duration: BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS,
          orElse: () =>
            Effect.succeed({
              result: {
                environmentId: environment.environmentId,
                label: environment.label,
                outcome: "failed",
                reason: "timed out",
              },
              alerts: 0,
            } satisfies EnvironmentRun),
        }),
        // One environment failing in a way nobody typed must not take the
        // others, or the run record, down with it.
        Effect.catchCause((cause) =>
          Effect.logWarning("A background refresh environment failed unexpectedly.").pipe(
            Effect.annotateLogs({ environmentId: environment.environmentId, cause: String(cause) }),
            Effect.as({
              result: {
                environmentId: environment.environmentId,
                label: environment.label,
                outcome: "failed",
                reason: "unexpected error",
              },
              alerts: 0,
            } satisfies EnvironmentRun),
          ),
        ),
        Effect.ensuring(Effect.sync(() => settled.get(environment.environmentId)?.())),
      ),
    { concurrency: BACKGROUND_REFRESH_CONCURRENCY },
  ).pipe(Effect.ensuring(Effect.sync(() => settled.forEach((settle) => settle()))));
});

interface SessionResolution {
  readonly session: ManagedRelaySession | null;
  /** Why there is no session, when that is the interesting part. */
  readonly reason: string | null;
}

/** Resolves the T3 Connect session on first use, once per run. */
type SessionSource = () => Promise<SessionResolution>;

/** A promise that cannot outlive the run's budget, whatever it waits on. */
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

function resolveSession(): Promise<SessionResolution> {
  return withTimeout(
    resolveHeadlessCloudSession().then(
      (session) => ({ session, reason: session === null ? "no T3 Connect session" : null }),
      (cause: unknown) => ({ session: null, reason: describeBackgroundRefreshFailure(cause) }),
    ),
    BACKGROUND_REFRESH_SESSION_TIMEOUT_MS,
    { session: null, reason: "T3 Connect sign-in timed out" },
  );
}

/**
 * One worker run: authorize every saved environment, pull its shell snapshot,
 * write it to the client cache, alert on turns that finished, and record what
 * happened. Every await is bounded, so the record is always written.
 */
async function executeRefresh(): Promise<BackgroundRefreshRecord> {
  const startedAtMs = Date.now();
  let error: string | undefined;
  let relaySession: ManagedRelaySession | null = null;
  let resolving: Promise<SessionResolution> | null = null;
  const session: SessionSource = () =>
    (resolving ??= resolveSession().then((resolved) => {
      relaySession = resolved.session;
      return resolved;
    }));
  const runs = await Runtime.runtime
    .runPromise(
      refreshAllEnvironments(session).pipe(
        Effect.provide(backgroundRefreshLayer(() => relaySession)),
        Effect.timeoutOrElse({
          duration: BACKGROUND_REFRESH_BUDGET_MS,
          orElse: () => {
            error = "ran out of time";
            return Effect.succeed([] as ReadonlyArray<EnvironmentRun>);
          },
        }),
        Effect.catchCause((cause) => {
          error = describeBackgroundRefreshFailure(cause);
          return Effect.logWarning("The background refresh run failed.").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as([] as ReadonlyArray<EnvironmentRun>),
          );
        }),
      ),
    )
    .catch((cause: unknown) => {
      error = describeBackgroundRefreshFailure(cause);
      return [] as ReadonlyArray<EnvironmentRun>;
    });
  return summarizeBackgroundRefresh({
    environments: runs.map((run) => run.result),
    startedAtMs,
    finishedAtMs: Date.now(),
    notified: runs.reduce((total, run) => total + run.alerts, 0),
    ...(error === undefined ? {} : { error }),
  });
}

// Room for the record write after the Effect budget, inside the native 60 s.
const RUN_DEADLINE_MS = BACKGROUND_REFRESH_BUDGET_MS + 5_000;

let runInFlight: Promise<BackgroundRefreshRecord> | null = null;

/**
 * The single entry point for a run. A second wakeup while one runs joins it.
 * The deadline settles the run even if a promise outside Effect hangs, so a
 * stuck run can never make every later wakeup join it forever.
 */
export function runBackgroundRefresh(): Promise<BackgroundRefreshRecord> {
  if (runInFlight !== null) return runInFlight;
  const startedAtMs = Date.now();
  const run = withTimeout(
    executeRefresh(),
    RUN_DEADLINE_MS,
    summarizeBackgroundRefresh({
      environments: [],
      startedAtMs,
      finishedAtMs: startedAtMs + RUN_DEADLINE_MS,
      notified: 0,
      error: "ran out of time",
    }),
  ).then((record) => {
    backgroundRefreshNative?.saveRecord(JSON.stringify(record));
    void refreshBackgroundRefreshStatus();
    return record;
  });
  runInFlight = run.finally(() => {
    runInFlight = null;
  });
  return runInFlight;
}

/** Called once from index.ts, before the root component, so a headless launch finds it. */
export function registerBackgroundRefreshTask(): void {
  AppRegistry.registerHeadlessTask(BACKGROUND_REFRESH_TASK, () => async () => {
    await runBackgroundRefresh().catch((cause: unknown) => {
      console.warn("[background-refresh] the run fell over", cause);
    });
  });
}

/** The native status and when it was read, which is the "now" its labels are relative to. */
export interface BackgroundRefreshStatusReading {
  readonly status: BackgroundRefreshNativeStatus | null;
  readonly readAtMs: number;
}

let status: BackgroundRefreshStatusReading = { status: null, readAtMs: 0 };
const statusListeners = new Set<() => void>();

/** Rereads the worker's record and Android's battery state; Settings calls this on focus. */
export async function refreshBackgroundRefreshStatus(): Promise<void> {
  const next = await backgroundRefreshNative?.getStatus().catch(() => null);
  status = { status: next ?? null, readAtMs: Date.now() };
  for (const listener of statusListeners) listener();
}

/** Settings reads this through `useSyncExternalStore`. */
export function subscribeBackgroundRefreshStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function backgroundRefreshStatusSnapshot(): BackgroundRefreshStatusReading {
  return status;
}

/** Unset means on: a saved environment should stay fresh without being asked. */
export function backgroundRefreshEnabled(
  preferences: Pick<MobilePreferences.Preferences, "backgroundRefreshEnabled">,
): boolean {
  return preferences.backgroundRefreshEnabled !== false;
}

let enabledPreference = true;

const countRefreshableEnvironments = Effect.gen(function* () {
  const targetStore = yield* Persistence.ConnectionTargetStore;
  return backgroundRefreshEnvironments(yield* targetStore.list, yield* targetStore.listDisabled)
    .length;
}).pipe(
  Effect.provide(ConnectionStorage.layer),
  Effect.catchCause(() => Effect.succeed(0)),
);

/**
 * Arms the native schedule when the user wants it and something can be
 * refreshed, and cancels it otherwise. Idempotent: the native side enqueues
 * with KEEP, so calling it on every launch never moves the next run.
 */
export async function reconcileBackgroundRefresh(enabled: boolean): Promise<void> {
  enabledPreference = enabled;
  if (backgroundRefreshNative === null) return;
  const count = await Runtime.runtime.runPromise(countRefreshableEnvironments).catch(() => 0);
  backgroundRefreshNative.setEnabled(enabled && count > 0);
  await refreshBackgroundRefreshStatus();
}

let started = false;

/** Called from the home screen. Arms the schedule and follows pairing changes. */
export function startBackgroundRefresh(): void {
  if (started || backgroundRefreshNative === null) return;
  started = true;
  // Pairing the first environment arms the schedule and removing the last one
  // cancels it, without waiting for a relaunch.
  ConnectionStorage.onConnectionTargetsChanged(() => {
    void reconcileBackgroundRefresh(enabledPreference);
  });
  void Runtime.runtime
    .runPromise(
      MobilePreferences.MobilePreferencesStore.pipe(
        Effect.flatMap((store) => store.load),
        Effect.orElseSucceed((): MobilePreferences.Preferences => ({})),
      ),
    )
    .catch((): MobilePreferences.Preferences => ({}))
    .then((preferences) => reconcileBackgroundRefresh(backgroundRefreshEnabled(preferences)));
}
