import type { EnvironmentId, OrchestrationShellSnapshot } from "@t3tools/contracts";

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

// Older than one worker interval plus slack means the worker stopped running;
// the socket still replays from the cursor, but a fresh fetch is cheaper then.
const MAX_AGE_MS = 20 * 60_000;

const fresh = new Map<EnvironmentId, { snapshot: OrchestrationShellSnapshot; atMs: number }>();
const pending = new Map<EnvironmentId, Promise<unknown>>();

/** Background refresh calls this around each environment's fetch. */
export function trackShellFetch<A>(environmentId: EnvironmentId, run: Promise<A>): Promise<A> {
  pending.set(environmentId, run);
  void run.finally(() => {
    if (pending.get(environmentId) === run) pending.delete(environmentId);
  });
  return run;
}

export function offerShell(environmentId: EnvironmentId, snapshot: OrchestrationShellSnapshot) {
  fresh.set(environmentId, { snapshot, atMs: Date.now() });
}

/** One use per snapshot: a later reconnect must not rewind to it. */
export async function takeShell(
  environmentId: EnvironmentId,
  nowMs: () => number = Date.now,
): Promise<OrchestrationShellSnapshot | null> {
  await pending.get(environmentId)?.catch(() => undefined);
  const entry = fresh.get(environmentId);
  fresh.delete(environmentId);
  return entry && nowMs() - entry.atMs <= MAX_AGE_MS ? entry.snapshot : null;
}
