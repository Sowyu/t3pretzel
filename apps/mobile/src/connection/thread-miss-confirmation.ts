import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import type {
  ThreadSnapshotLoader,
  ThreadSnapshotLoadResult,
} from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Atom } from "effect/reactivity";

import { appAtomRegistry } from "../state/atom-registry";

type Loader = ThreadSnapshotLoader["Service"];

/** What a synchronized shell says about a thread, or "unknown" before it is synchronized. */
export type ShellThreadPresence = "listed" | "absent" | "unknown";

export function shellThreadPresence(
  state: EnvironmentShellState,
  threadId: ThreadId,
): ShellThreadPresence {
  if (state.status !== "live" || Option.isNone(state.snapshot)) return "unknown";
  const { threads, archivedThreads } = state.snapshot.value;
  return threads.some((thread) => thread.id === threadId) ||
    archivedThreads.some((thread) => thread.id === threadId)
    ? "listed"
    : "absent";
}

/** How long a 404 waits for the shell to synchronize before it is believed anyway. */
export const SHELL_CONFIRMATION_TIMEOUT = Duration.seconds(10);

type ShellStateAtom = (environmentId: EnvironmentId) => Atom.Atom<EnvironmentShellState>;
let shellStateAtom: ShellStateAtom | null = null;

/**
 * The shell atoms run on the connection runtime, which this loader is part of,
 * so the shell module hands its atom family over once it loads.
 */
export function registerShellStateSource(source: ShellStateAtom): void {
  shellStateAtom = source;
}

/** What the environment's shell says once it has synchronized, or "unknown" after the timeout. */
export const awaitShellThreadPresence = (
  environmentId: EnvironmentId,
  threadId: ThreadId,
): Effect.Effect<ShellThreadPresence> => {
  const source = shellStateAtom;
  if (source === null) return Effect.succeed("unknown");
  const atom = source(environmentId);
  return Effect.callback<ShellThreadPresence>((resume) => {
    const settle = () => {
      const presence = shellThreadPresence(appAtomRegistry.get(atom), threadId);
      if (presence === "unknown") return false;
      resume(Effect.succeed(presence));
      return true;
    };
    if (settle()) return;
    const unsubscribe = appAtomRegistry.subscribe(atom, () => {
      if (settle()) unsubscribe();
    });
    return Effect.sync(unsubscribe);
  }).pipe(
    Effect.timeoutOrElse({
      duration: SHELL_CONFIRMATION_TIMEOUT,
      orElse: () => Effect.succeed("unknown" as const),
    }),
  );
};

/**
 * The thread state marks a thread deleted on one snapshot 404 and keeps that
 * for five minutes, so a thread the list still shows opened as "Thread
 * unavailable". A 404 counts only once the synchronized shell agrees the
 * thread is gone. Otherwise the load reports the snapshot unavailable: the
 * socket subscription then asks again, shows the server's error, and retries
 * with backoff until the thread loads.
 */
export function confirmThreadMisses(
  loader: Loader,
  presence: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
  ) => Effect.Effect<ShellThreadPresence>,
): Loader {
  return {
    load: (prepared, threadId) =>
      Effect.gen(function* () {
        const result = yield* loader.load(prepared, threadId);
        if (result._tag !== "missing") return result;
        if ((yield* presence(prepared.environmentId, threadId)) !== "listed") return result;
        yield* Effect.logWarning(
          "The thread snapshot returned 404 for a thread the shell lists; retrying.",
        ).pipe(Effect.annotateLogs({ threadId }));
        const unavailable: ThreadSnapshotLoadResult = { _tag: "unavailable" };
        return unavailable;
      }),
  };
}
