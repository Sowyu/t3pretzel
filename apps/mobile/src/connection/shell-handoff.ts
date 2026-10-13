import type { EnvironmentId, OrchestrationV2ShellSnapshot } from "@t3tools/contracts";

/**
 * Hands shell snapshots fetched by background refresh to the live connection.
 *
 * Android often keeps the process alive between worker runs, and the live
 * shell state reads the SQLite cache only when it starts, so a snapshot the
 * worker saved never reached the screen, and a reconnect during a run
 * downloaded the same shell again. The live loader (connection/runtime.ts)
 * takes the run's snapshot instead, waiting briefly for one still in flight,
 * and subscribes from its sequence for just the changes.
 */

// A snapshot only replaces the reconnect's own fetch when the reconnect waited
// for it or it is seconds old. An older one may predate events the live state
// already applied, and a rolled-back shell replays those changes.
const HANDOFF_WINDOW_MS = 30_000;
// A reconnect waits this long for a run in flight before fetching itself, so a
// slow background route never holds up the live thread list.
const MAX_WAIT_MS = 4_000;

const fresh = new Map<EnvironmentId, { snapshot: OrchestrationV2ShellSnapshot; atMs: number }>();
const pending = new Map<EnvironmentId, Promise<unknown>>();

/** Background refresh calls this around each environment's fetch. */
export function trackShellFetch<A>(environmentId: EnvironmentId, run: Promise<A>): Promise<A> {
  pending.set(environmentId, run);
  void run.finally(() => {
    if (pending.get(environmentId) === run) pending.delete(environmentId);
  });
  return run;
}

export function offerShell(
  environmentId: EnvironmentId,
  snapshot: OrchestrationV2ShellSnapshot,
  atMs: number = Date.now(),
) {
  fresh.set(environmentId, { snapshot, atMs });
}

/** One use per snapshot: a later reconnect must not rewind to it. */
export async function takeShell(
  environmentId: EnvironmentId,
  nowMs: () => number = Date.now,
  maxWaitMs: number = MAX_WAIT_MS,
): Promise<OrchestrationV2ShellSnapshot | null> {
  const askedAtMs = nowMs();
  const inFlight = pending.get(environmentId);
  if (inFlight !== undefined) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      inFlight.catch(() => undefined),
      new Promise<void>((resolve) => (timer = setTimeout(resolve, maxWaitMs))),
    ]);
    clearTimeout(timer);
  }
  const entry = fresh.get(environmentId);
  if (entry === undefined) return null;
  fresh.delete(environmentId);
  const waitedOn = entry.atMs >= askedAtMs;
  return waitedOn || nowMs() - entry.atMs <= HANDOFF_WINDOW_MS ? entry.snapshot : null;
}
