import type { ConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";

/** The whole run, relay authorization included, before the native worker gives up at 60 s. */
export const BACKGROUND_REFRESH_BUDGET_MS = 45_000;
/** One environment: a dead LAN route, then the relay route and its retry. */
export const BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS = 30_000;
/** One snapshot request. A LAN route away from home should fail over to the next route quickly. */
export const BACKGROUND_REFRESH_REQUEST_TIMEOUT_MS = 8_000;
/**
 * A relay that cannot reach the host right now ("server unreachable") often
 * can a second later, once the host's tunnel wakes. One retry, not a ladder.
 */
export const BACKGROUND_REFRESH_RETRY_DELAY_MS = 1_000;
/** Clerk's headless `load()` has no timeout of its own and can sit forever. */
export const BACKGROUND_REFRESH_SESSION_TIMEOUT_MS = 8_000;
export const BACKGROUND_REFRESH_CONCURRENCY = 3;

/**
 * Routes a headless run can authenticate on its own: a direct pairing carries
 * its bearer token, and T3 Connect re-mints a DPoP token from the stored
 * session. SSH needs the desktop gateway and the primary target only exists in
 * the desktop shell, so both stay a foreground concern.
 */
export type BackgroundRefreshTarget = Extract<
  ConnectionTarget,
  { readonly _tag: "BearerConnectionTarget" | "RelayConnectionTarget" }
>;

/** One saved environment and the routes worth trying, preferred first. */
export interface BackgroundRefreshEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly routes: ReadonlyArray<BackgroundRefreshTarget>;
}

function isBackgroundRefreshTarget(target: ConnectionTarget): target is BackgroundRefreshTarget {
  return target._tag === "BearerConnectionTarget" || target._tag === "RelayConnectionTarget";
}

/**
 * The catalog lists every route of an environment as its own target, in
 * preference order. A run fetches each environment once, through the first
 * route that answers.
 */
export function backgroundRefreshEnvironments(
  targets: ReadonlyArray<ConnectionTarget>,
  disabledEnvironmentIds: ReadonlyArray<EnvironmentId>,
): ReadonlyArray<BackgroundRefreshEnvironment> {
  const disabled = new Set<string>(disabledEnvironmentIds);
  const byEnvironment = new Map<EnvironmentId, Array<BackgroundRefreshTarget>>();
  for (const target of targets) {
    if (!isBackgroundRefreshTarget(target) || disabled.has(target.environmentId)) continue;
    const routes = byEnvironment.get(target.environmentId);
    if (routes === undefined) byEnvironment.set(target.environmentId, [target]);
    else routes.push(target);
  }
  return [...byEnvironment].map(([environmentId, routes]) => ({
    environmentId,
    label: routes[0]!.label,
    routes,
  }));
}

export type BackgroundRefreshOutcome =
  /** A fresh shell snapshot reached the cache. */
  | "refreshed"
  /** No credential or no T3 Connect session: nothing to try. */
  | "skipped"
  /** A request was made and no snapshot came back. */
  | "failed";

export interface BackgroundRefreshEnvironmentResult {
  readonly environmentId: string;
  readonly label: string;
  readonly outcome: BackgroundRefreshOutcome;
  /** One short phrase, shown as-is: "no T3 Connect session", "HTTP 401". */
  readonly reason?: string;
}

/** What the last worker run's JS side did. Saved natively next to the worker's own record. */
export interface BackgroundRefreshRecord {
  readonly finishedAtMs: number;
  readonly durationMs: number;
  readonly refreshed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly notified: number;
  readonly environments: ReadonlyArray<BackgroundRefreshEnvironmentResult>;
  /** Set when the run fell over before any environment was reached. */
  readonly error?: string;
}

/** `T3BackgroundRefresh.getStatus()`; everything the worker and Android know. */
export interface BackgroundRefreshNativeStatus {
  readonly enabled: boolean;
  readonly armedAtMs: number | null;
  /** WorkManager's state for the periodic job: ENQUEUED, RUNNING, CANCELLED, … */
  readonly workState: string | null;
  /** When Android last started the worker. The only proof it still wakes the app. */
  readonly lastStartedAtMs: number | null;
  readonly lastFinishedAtMs: number | null;
  /** "finished", "timed out", "no React host", … */
  readonly lastOutcome: string | null;
  readonly record: string | null;
  readonly ignoringBatteryOptimizations: boolean;
  readonly backgroundRestricted: boolean;
  /** UsageStatsManager standby bucket; 40 (rare) and up defers jobs for hours. */
  readonly standbyBucket: number | null;
}

export function summarizeBackgroundRefresh(input: {
  readonly environments: ReadonlyArray<BackgroundRefreshEnvironmentResult>;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly notified: number;
  readonly error?: string;
}): BackgroundRefreshRecord {
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  for (const environment of input.environments) {
    if (environment.outcome === "refreshed") refreshed += 1;
    else if (environment.outcome === "skipped") skipped += 1;
    else failed += 1;
  }
  return {
    finishedAtMs: input.finishedAtMs,
    durationMs: Math.max(0, input.finishedAtMs - input.startedAtMs),
    refreshed,
    skipped,
    failed,
    notified: input.notified,
    environments: input.environments,
    ...(input.error === undefined ? {} : { error: input.error }),
  };
}

export function parseBackgroundRefreshRecord(raw: string | null): BackgroundRefreshRecord | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Partial<Record<keyof BackgroundRefreshRecord, unknown>>;
  if (
    typeof record.finishedAtMs !== "number" ||
    typeof record.refreshed !== "number" ||
    typeof record.skipped !== "number" ||
    typeof record.failed !== "number"
  ) {
    return null;
  }
  const environments = Array.isArray(record.environments)
    ? (record.environments as ReadonlyArray<Partial<BackgroundRefreshEnvironmentResult>>).flatMap(
        (entry): Array<BackgroundRefreshEnvironmentResult> =>
          typeof entry?.environmentId === "string" &&
          typeof entry.label === "string" &&
          (entry.outcome === "refreshed" ||
            entry.outcome === "skipped" ||
            entry.outcome === "failed")
            ? [
                {
                  environmentId: entry.environmentId,
                  label: entry.label,
                  outcome: entry.outcome,
                  ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}),
                },
              ]
            : [],
      )
    : [];
  return {
    finishedAtMs: record.finishedAtMs,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : 0,
    refreshed: record.refreshed,
    skipped: record.skipped,
    failed: record.failed,
    notified: typeof record.notified === "number" ? record.notified : 0,
    environments,
    ...(typeof record.error === "string" ? { error: record.error } : {}),
  };
}

// Four missed 15 minute periods. Doze alone rarely stretches the gap this far.
const OVERDUE_AFTER_MS = 60 * 60_000;
// STANDBY_BUCKET_RARE. Rare and restricted apps get jobs a few times a day.
const RARE_STANDBY_BUCKET = 40;

export type BackgroundRefreshDeferral =
  /** The user set background usage to Restricted. Jobs never run. */
  | "restricted"
  /** Battery optimisation is on and the worker is overdue or the app is in a rare bucket. */
  | "battery"
  | null;

/**
 * Whether Android is holding the worker back, from evidence rather than the
 * optimisation flag alone: almost every app is optimised, and most still get
 * their periodic work.
 */
export function backgroundRefreshDeferral(
  status: BackgroundRefreshNativeStatus,
  nowMs: number,
): BackgroundRefreshDeferral {
  if (!status.enabled) return null;
  if (status.backgroundRestricted) return "restricted";
  if (status.ignoringBatteryOptimizations) return null;
  const lastWakeMs = status.lastStartedAtMs ?? status.armedAtMs;
  const overdue = lastWakeMs !== null && nowMs - lastWakeMs > OVERDUE_AFTER_MS;
  const rare = status.standbyBucket !== null && status.standbyBucket >= RARE_STANDBY_BUCKET;
  return overdue || rare ? "battery" : null;
}

/** "just now", "12 min ago", "3 h ago", "2 d ago". */
export function formatAgo(atMs: number, nowMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - atMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** "340 ms" under a second, "2.4 s" above it. */
export function formatRefreshDuration(durationMs: number): string {
  return durationMs < 1_000
    ? `${Math.round(durationMs)} ms`
    : `${Math.round(durationMs / 100) / 10} s`;
}

/** The counts half of the Settings subtitle. */
export function backgroundRefreshSummaryLabel(record: BackgroundRefreshRecord): string {
  if (record.error !== undefined && record.refreshed === 0) return "Failed";
  if (record.refreshed > 0) {
    const suffix = record.failed > 0 ? `, ${record.failed} unreachable` : "";
    return `${record.refreshed} updated${suffix}`;
  }
  if (record.failed > 0) return `${record.failed} unreachable`;
  if (record.skipped > 0) return "Nothing it could refresh";
  return "No environments";
}

/** What took the run down, else why the first environment could not be reached. */
export function backgroundRefreshReason(record: BackgroundRefreshRecord): string | null {
  if (record.error !== undefined) return record.error;
  const blocking =
    record.environments.find((entry) => entry.outcome === "failed" && entry.reason) ??
    record.environments.find((entry) => entry.outcome === "skipped" && entry.reason);
  return blocking?.reason ?? null;
}

/**
 * The Background refresh row's subtitle: when Android last woke the app, what
 * the run did, and why it did not run when that is the interesting part.
 */
export function backgroundRefreshRowSubtitle(input: {
  /** The user's switch. The native `enabled` also needs a saved environment. */
  readonly enabled: boolean;
  readonly status: BackgroundRefreshNativeStatus | null;
  readonly nowMs: number;
}): string {
  const { status, nowMs } = input;
  if (!input.enabled) return "Off";
  if (status === null) return "Not available in this build";
  if (!status.enabled) return "Starts when you pair an environment";
  const deferral = backgroundRefreshDeferral(status, nowMs);
  if (deferral === "restricted") return "Blocked: background usage is restricted";
  const deferred = deferral === "battery" ? "Android is deferring it" : null;
  if (status.lastStartedAtMs === null) {
    return deferred === null ? "Waiting for Android to run it" : `Not run yet · ${deferred}`;
  }
  const record = parseBackgroundRefreshRecord(status.record);
  // A worker that started after the last record never got as far as writing one.
  const recordIsCurrent = record !== null && record.finishedAtMs >= status.lastStartedAtMs;
  const parts =
    record !== null && recordIsCurrent
      ? [
          `${backgroundRefreshSummaryLabel(record)} · ${formatAgo(record.finishedAtMs, nowMs)}`,
          backgroundRefreshReason(record),
        ]
      : [
          `Woke ${formatAgo(status.lastStartedAtMs, nowMs)}`,
          status.lastOutcome !== null && status.lastOutcome !== "finished"
            ? status.lastOutcome
            : null,
        ];
  return [...parts, deferred].filter((part) => part !== null && part !== "").join(" · ");
}

/**
 * Worth one more try inside the same run: the relay or the network flaked.
 * A missing credential or a rejected sign-in will fail the same way again.
 */
export function isRetryableBackgroundRefreshFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const tagged = error as {
    readonly _tag?: unknown;
    readonly status?: unknown;
    readonly cause?: unknown;
  };
  switch (tagged._tag) {
    case "ConnectionTransientError":
    case "RemoteEnvironmentAuthTimeoutError":
    case "EnvironmentInternalError":
      return true;
    case "RemoteEnvironmentAuthFetchError":
      // Wraps relay authorization failures too; only a transient cause retries.
      return (
        typeof tagged.cause !== "object" ||
        tagged.cause === null ||
        (tagged.cause as { readonly _tag?: unknown })._tag !== "ConnectionBlockedError"
      );
    case "RemoteEnvironmentAuthUndeclaredStatusError":
      return typeof tagged.status === "number" && tagged.status >= 500;
    default:
      return false;
  }
}

/** No credential, no session, not paired: the environment was skipped, not unreachable. */
export function isNothingToTry(error: unknown): boolean {
  const tag =
    typeof error === "object" && error !== null ? (error as { _tag?: unknown })._tag : null;
  return tag === "ConnectionBlockedError" || tag === "BackgroundRefreshMissingSession";
}

/** A failed refresh in a few words. The full cause is in the log; this fits under a row. */
export function describeBackgroundRefreshFailure(error: unknown): string {
  if (typeof error === "string" && error.length > 0) return truncateReason(error);
  if (typeof error !== "object" || error === null) return "unknown error";
  const tagged = error as {
    readonly _tag?: unknown;
    readonly message?: unknown;
    readonly status?: unknown;
    readonly reason?: unknown;
  };
  switch (tagged._tag) {
    case "BackgroundRefreshMissingSession":
      return typeof tagged.reason === "string" ? tagged.reason : "no T3 Connect session";
    case "RemoteEnvironmentAuthUndeclaredStatusError":
      return typeof tagged.status === "number" ? `HTTP ${tagged.status}` : "unexpected response";
    case "RemoteEnvironmentAuthTimeoutError":
      return "timed out";
    case "RemoteEnvironmentAuthFetchError":
      return "network error";
    case "RemoteEnvironmentAuthInvalidJsonError":
      return "unreadable response";
    case "EnvironmentAuthInvalidError":
      return "sign-in rejected";
    case "EnvironmentScopeRequiredError":
    case "EnvironmentOperationForbiddenError":
      return "not allowed";
    case "EnvironmentResourceNotFoundError":
      return "environment not found";
    case "EnvironmentInternalError":
      return "server error";
    case "ConnectionBlockedError":
    case "ConnectionTransientError":
      return describeConnectionReason((error as { readonly reason?: unknown }).reason);
    default:
      break;
  }
  return typeof tagged.message === "string" && tagged.message.length > 0
    ? truncateReason(tagged.message)
    : "unknown error";
}

function describeConnectionReason(reason: unknown): string {
  switch (reason) {
    case "authentication":
      return "sign-in needed";
    case "configuration":
      return "not paired";
    case "permission":
      return "not allowed";
    case "unsupported":
      return "unsupported server";
    case "timeout":
      return "timed out";
    case "network":
    case "transport":
      return "network error";
    case "endpoint-unavailable":
      return "server unreachable";
    case "relay-unavailable":
      return "relay unreachable";
    case "remote-unavailable":
      return "remote unreachable";
    default:
      return typeof reason === "string" ? reason : "blocked";
  }
}

// Long enough for "Could not authorize the environment request", short enough
// that the Settings row stays at most three lines on a narrow phone.
const MAX_REASON_LENGTH = 48;

function truncateReason(reason: string): string {
  const collapsed = reason.replaceAll(/\s+/gu, " ").trim();
  return collapsed.length <= MAX_REASON_LENGTH
    ? collapsed
    : `${collapsed.slice(0, MAX_REASON_LENGTH - 1)}…`;
}
