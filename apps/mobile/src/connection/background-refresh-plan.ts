import type { ConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";

/**
 * Android's WorkManager floor for repeating work. Asking for less is silently
 * rounded up, so this is both the request and the best case.
 */
export const BACKGROUND_REFRESH_INTERVAL_MINUTES = 15;

/** The whole run, including relay authorization, has to fit a short OS budget. */
export const BACKGROUND_REFRESH_BUDGET_MS = 25_000;
export const BACKGROUND_REFRESH_ENVIRONMENT_TIMEOUT_MS = 12_000;
/** Clerk's headless `load()` has no timeout of its own and can sit forever. */
export const BACKGROUND_REFRESH_SESSION_TIMEOUT_MS = 8_000;
export const BACKGROUND_REFRESH_CONCURRENCY = 3;

/**
 * Saved environments a headless run can reach on its own. Direct pairing carries
 * its own bearer token and relay re-mints a DPoP token from the stored cloud
 * session. SSH needs the desktop gateway and the primary target only exists
 * inside the desktop shell, so both stay a foreground concern.
 */
export type BackgroundRefreshTarget = Extract<
  ConnectionTarget,
  { readonly _tag: "BearerConnectionTarget" | "RelayConnectionTarget" }
>;

export type BackgroundRefreshOutcome =
  /** A fresh shell snapshot reached the cache. */
  | "refreshed"
  /** No credential, no cloud session, or the environment is switched off. */
  | "skipped"
  /** The request was made and did not come back with a snapshot. */
  | "failed";

/** What `BackgroundTask.getStatusAsync()` said, before it has said anything. */
export type BackgroundRefreshStatus = "available" | "restricted" | "unknown";

/** Who asked for the run. Only `worker` proves the OS still wakes the app. */
export type BackgroundRefreshTrigger = "worker" | "foreground";

export interface BackgroundRefreshEnvironmentResult {
  readonly label: string;
  readonly outcome: BackgroundRefreshOutcome;
  /** One short phrase, shown as-is: "no T3 Connect session", "HTTP 401". */
  readonly reason?: string;
}

export interface BackgroundRefreshRecord {
  readonly finishedAtMs: number;
  readonly durationMs: number;
  readonly refreshed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly trigger: BackgroundRefreshTrigger;
  /**
   * When the OS worker last finished a run, carried forward across foreground
   * runs. `null` means Android has never woken the app on its own, which is the
   * one failure the counts above cannot show.
   */
  readonly workerRanAtMs: number | null;
  readonly environments: ReadonlyArray<BackgroundRefreshEnvironmentResult>;
  /** Set when the run fell over before any environment was reached. */
  readonly error?: string;
}

function isBackgroundRefreshTarget(target: ConnectionTarget): target is BackgroundRefreshTarget {
  return target._tag === "BearerConnectionTarget" || target._tag === "RelayConnectionTarget";
}

export function backgroundRefreshTargets(
  targets: ReadonlyArray<ConnectionTarget>,
  disabledEnvironmentIds: ReadonlyArray<EnvironmentId>,
): ReadonlyArray<BackgroundRefreshTarget> {
  const disabled = new Set<string>(disabledEnvironmentIds);
  return targets.filter(
    (target) => isBackgroundRefreshTarget(target) && !disabled.has(target.environmentId),
  ) as ReadonlyArray<BackgroundRefreshTarget>;
}

/**
 * Registering the worker with nothing to refresh burns a wakeup every 15
 * minutes for no reason, so the registration follows the catalog.
 */
export function shouldRegisterBackgroundRefresh(input: {
  readonly enabled: boolean;
  readonly refreshableEnvironmentCount: number;
}): boolean {
  return input.enabled && input.refreshableEnvironmentCount > 0;
}

export function summarizeBackgroundRefresh(input: {
  readonly environments: ReadonlyArray<BackgroundRefreshEnvironmentResult>;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly trigger: BackgroundRefreshTrigger;
  /** The previous record's `workerRanAtMs`, so a foreground run keeps it. */
  readonly previousWorkerRanAtMs?: number | null;
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
    trigger: input.trigger,
    workerRanAtMs:
      input.trigger === "worker" ? input.finishedAtMs : (input.previousWorkerRanAtMs ?? null),
    environments: input.environments,
    ...(input.error === undefined ? {} : { error: input.error }),
  };
}

/** The counts half of the Settings row; the caller appends the relative time. */
export function backgroundRefreshSummaryLabel(record: BackgroundRefreshRecord): string {
  if (record.error !== undefined && record.refreshed === 0) {
    return "Failed";
  }
  if (record.refreshed > 0) {
    const suffix = record.failed > 0 ? `, ${record.failed} unreachable` : "";
    return `${record.refreshed} updated${suffix}`;
  }
  if (record.failed > 0) {
    return record.failed === 1 ? "1 unreachable" : `${record.failed} unreachable`;
  }
  if (record.skipped > 0) {
    return "Nothing to refresh";
  }
  return "No environments";
}

/**
 * The one explanation worth a row subtitle: what took the run down, else why the
 * first environment could not be reached.
 */
export function backgroundRefreshReason(record: BackgroundRefreshRecord): string | null {
  if (record.error !== undefined) return record.error;
  const blocking =
    record.environments.find(
      (environment) => environment.outcome === "failed" && environment.reason !== undefined,
    ) ??
    record.environments.find(
      (environment) => environment.outcome === "skipped" && environment.reason !== undefined,
    );
  return blocking?.reason ?? null;
}

/**
 * The whole Settings subtitle. `relativeLabel` is the caller's `relativeTime`
 * output so this stays a pure function of the record.
 */
export function backgroundRefreshRowSubtitle(input: {
  readonly enabled: boolean;
  readonly status: BackgroundRefreshStatus;
  readonly record: BackgroundRefreshRecord | null;
  readonly relativeLabel: string;
}): string {
  if (!input.enabled) return "Off";
  if (input.status === "restricted") return "Restricted by the system";
  if (input.record === null) return "Waiting for the first run";
  const reason = backgroundRefreshReason(input.record);
  const summary = `${backgroundRefreshSummaryLabel(input.record)} · ${input.relativeLabel} ago`;
  return reason === null ? summary : `${summary} · ${reason}`;
}

/**
 * A failed HTTP refresh in five words or fewer. The full cause is already in the
 * log; this is what fits under a Settings row.
 */
export function describeBackgroundRefreshFailure(error: unknown): string {
  if (typeof error === "string" && error.length > 0) return truncateReason(error);
  if (typeof error !== "object" || error === null) return "unknown error";
  const tagged = error as { readonly _tag?: unknown; readonly message?: unknown };
  const status = (error as { readonly status?: unknown }).status;
  switch (tagged._tag) {
    case "RemoteEnvironmentAuthUndeclaredStatusError":
      return typeof status === "number" ? `HTTP ${status}` : "unexpected response";
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
      return describeConnectionReason(error as { readonly reason?: unknown });
    default:
      break;
  }
  return typeof tagged.message === "string" && tagged.message.length > 0
    ? truncateReason(tagged.message)
    : "unknown error";
}

/** The connection errors carry a reason literal that is already a short phrase. */
function describeConnectionReason(error: { readonly reason?: unknown }): string {
  switch (error.reason) {
    case "authentication":
      return "sign-in needed";
    case "configuration":
      return "not paired";
    case "permission":
      return "not allowed";
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
    case "unsupported":
      return "unsupported server";
    default:
      return typeof error.reason === "string" ? error.reason : "blocked";
  }
}

// Long enough for "Could not authorize the environment request", short enough
// that the Settings row stays two lines on a narrow phone.
const MAX_REASON_LENGTH = 48;

function truncateReason(reason: string): string {
  const collapsed = reason.replaceAll(/\s+/gu, " ").trim();
  return collapsed.length <= MAX_REASON_LENGTH
    ? collapsed
    : `${collapsed.slice(0, MAX_REASON_LENGTH - 1)}…`;
}
