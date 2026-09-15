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

export interface BackgroundRefreshRecord {
  readonly finishedAtMs: number;
  readonly durationMs: number;
  readonly refreshed: number;
  readonly skipped: number;
  readonly failed: number;
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
  readonly outcomes: ReadonlyArray<BackgroundRefreshOutcome>;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
}): BackgroundRefreshRecord {
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  for (const outcome of input.outcomes) {
    if (outcome === "refreshed") refreshed += 1;
    else if (outcome === "skipped") skipped += 1;
    else failed += 1;
  }
  return {
    finishedAtMs: input.finishedAtMs,
    durationMs: Math.max(0, input.finishedAtMs - input.startedAtMs),
    refreshed,
    skipped,
    failed,
  };
}

/** The counts half of the Settings row; the caller appends the relative time. */
export function backgroundRefreshSummaryLabel(record: BackgroundRefreshRecord): string {
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
