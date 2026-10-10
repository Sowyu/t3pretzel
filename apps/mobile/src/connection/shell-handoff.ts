import type { EnvironmentId, OrchestrationV2ShellSnapshot } from "@t3tools/contracts";

/**
 * Hands shell snapshots fetched by background refresh to the live connection.
 *
 * Android usually keeps the process alive between wakeups, and the live shell
 * state only reads the SQLite cache at startup, so a snapshot the worker saved
 * never reached the screen. On resume the reconnect downloaded the whole shell
 * again, often while the resume refresh downloaded the same one. The live
 * loader (connection/runtime.ts) now takes the refresh's snapshot, waiting for
 * one still in flight, and subscribes from its sequence for just the changes.
 */

// A snapshot only replaces the reconnect's own fetch when the reconnect waited
// for it or it is seconds old. An older one may predate events the live state
// already applied: a resume that resubscribed on the same session never takes
// it, and a later new session (Wi-Fi to cellular) would roll the shell back and
// replay completions, which re-fires "finished" alerts.
const HANDOFF_WINDOW_MS = 30_000;

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
): Promise<OrchestrationV2ShellSnapshot | null> {
  const askedAtMs = nowMs();
  await pending.get(environmentId)?.catch(() => undefined);
  const entry = fresh.get(environmentId);
  fresh.delete(environmentId);
  if (entry === undefined) return null;
  const waitedOn = entry.atMs >= askedAtMs;
  return waitedOn || nowMs() - entry.atMs <= HANDOFF_WINDOW_MS ? entry.snapshot : null;
}
