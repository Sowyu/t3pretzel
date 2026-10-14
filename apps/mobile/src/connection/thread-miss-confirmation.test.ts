import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import type { ThreadSnapshotLoadResult } from "@t3tools/client-runtime/state/threads";
import type { PreparedConnection } from "@t3tools/client-runtime/connection";
import { EnvironmentId, type OrchestrationV2ShellSnapshot, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import * as TestClock from "effect/testing/TestClock";

import { appAtomRegistry } from "../state/atom-registry";
import {
  awaitShellThreadPresence,
  confirmThreadMisses,
  registerShellStateSource,
  shellThreadPresence,
} from "./thread-miss-confirmation";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const THREAD_ID = ThreadId.make("thread-1");
const PREPARED = { environmentId: ENVIRONMENT_ID } as unknown as PreparedConnection;

function shell(
  status: EnvironmentShellState["status"],
  threads: ReadonlyArray<string>,
  archived: ReadonlyArray<string> = [],
): EnvironmentShellState {
  const snapshot = {
    schemaVersion: 1,
    snapshotSequence: 1,
    projects: [],
    threads: threads.map((id) => ({ id })),
    archivedThreads: archived.map((id) => ({ id })),
  } as unknown as OrchestrationV2ShellSnapshot;
  return { status, snapshot: Option.some(snapshot), error: Option.none() };
}

const missingLoader = {
  load: () => Effect.succeed({ _tag: "missing" } as ThreadSnapshotLoadResult),
};

describe("shellThreadPresence", () => {
  it("knows nothing until the shell is synchronized", () => {
    expect(shellThreadPresence(shell("synchronizing", ["thread-1"]), THREAD_ID)).toBe("unknown");
    expect(shellThreadPresence(shell("cached", ["thread-1"]), THREAD_ID)).toBe("unknown");
  });

  it("finds active and archived threads", () => {
    expect(shellThreadPresence(shell("live", ["thread-1"]), THREAD_ID)).toBe("listed");
    expect(shellThreadPresence(shell("live", [], ["thread-1"]), THREAD_ID)).toBe("listed");
    expect(shellThreadPresence(shell("live", ["other"]), THREAD_ID)).toBe("absent");
  });
});

describe("confirmThreadMisses", () => {
  it.effect("keeps loading a thread the shell still lists after a 404", () =>
    Effect.gen(function* () {
      const loader = confirmThreadMisses(missingLoader, () => Effect.succeed("listed"));
      expect(yield* loader.load(PREPARED, THREAD_ID)).toEqual({ _tag: "unavailable" });
    }),
  );

  it.effect("believes a 404 the shell agrees with", () =>
    Effect.gen(function* () {
      for (const presence of ["absent", "unknown"] as const) {
        const loader = confirmThreadMisses(missingLoader, () => Effect.succeed(presence));
        expect(yield* loader.load(PREPARED, THREAD_ID)).toEqual({ _tag: "missing" });
      }
    }),
  );

  it.effect("does not ask the shell about a snapshot that loaded", () =>
    Effect.gen(function* () {
      let asked = false;
      const loader = confirmThreadMisses(
        { load: () => Effect.succeed({ _tag: "unavailable" } as ThreadSnapshotLoadResult) },
        () => Effect.sync(() => (asked = true)).pipe(Effect.as("listed" as const)),
      );
      yield* loader.load(PREPARED, THREAD_ID);
      expect(asked).toBe(false);
    }),
  );
});

describe("awaitShellThreadPresence", () => {
  it.effect("waits for the shell to synchronize, then reports what it lists", () =>
    Effect.gen(function* () {
      const state = Atom.make(shell("synchronizing", [])).pipe(Atom.keepAlive);
      registerShellStateSource(() => state);
      const waiting = yield* Effect.forkChild(awaitShellThreadPresence(ENVIRONMENT_ID, THREAD_ID));
      yield* Effect.yieldNow;
      appAtomRegistry.set(state, shell("live", ["thread-1"]));
      expect(yield* Fiber.join(waiting)).toBe("listed");
    }),
  );

  it.effect("gives up as unknown when the shell never synchronizes", () =>
    Effect.gen(function* () {
      const state = Atom.make(shell("synchronizing", [])).pipe(Atom.keepAlive);
      registerShellStateSource(() => state);
      const waiting = yield* Effect.forkChild(awaitShellThreadPresence(ENVIRONMENT_ID, THREAD_ID));
      yield* TestClock.adjust("10 seconds");
      expect(yield* Fiber.join(waiting)).toBe("unknown");
    }),
  );
});
