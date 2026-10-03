import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  formatTurnCompletionNotification,
  reconcileTurnCompletions,
  type TurnCompletionPhases,
  type TurnCompletionThread,
} from "./turnCompletionNotifications";

const ENVIRONMENT = "env-1" as EnvironmentId;
const KEY = "env-1:thread-1";

function thread(
  overrides: {
    readonly id?: string;
    readonly title?: string;
    readonly runStatus?: "running" | "completed" | "failed" | "interrupted";
    readonly lineage?: TurnCompletionThread["thread"]["lineage"];
    readonly hasPendingApprovals?: boolean;
    readonly hasPendingUserInput?: boolean;
  } = {},
): TurnCompletionThread {
  const id = (overrides.id ?? "thread-1") as ThreadId;
  return {
    environmentId: ENVIRONMENT,
    projectTitle: "t3pretzel",
    thread: {
      id,
      title: overrides.title ?? "Fix the thread list",
      lineage: overrides.lineage ?? {
        parentThreadId: null,
        relationshipToParent: null,
        rootThreadId: id,
      },
      modelSelection: {
        instanceId: "claude",
        model: "sonnet",
      } as TurnCompletionThread["thread"]["modelSelection"],
      pendingBackgroundTasks: [],
      latestRun:
        overrides.runStatus === undefined
          ? null
          : {
              runId: "run-1" as RunId,
              status: overrides.runStatus,
              requestedAt: "2026-01-01T00:00:00.000Z",
              startedAt: "2026-01-01T00:00:00.000Z",
              completedAt: overrides.runStatus === "running" ? null : "2026-01-01T00:00:09.000Z",
              assistantMessageId: null,
            },
      runtime: null,
      updatedAt: "2026-01-01T00:00:10.000Z",
      hasPendingApprovals: overrides.hasPendingApprovals ?? false,
      hasPendingUserInput: overrides.hasPendingUserInput ?? false,
    },
  };
}

function reconcile(
  phases: TurnCompletionPhases,
  threads: ReadonlyArray<TurnCompletionThread>,
  options: {
    readonly enabled?: boolean;
    readonly foreground?: boolean;
    readonly openThreadKey?: string | null;
  } = {},
) {
  return reconcileTurnCompletions({
    phases,
    threads,
    enabled: options.enabled ?? true,
    foreground: options.foreground ?? false,
    openThreadKey: options.openThreadKey ?? null,
  });
}

describe("reconcileTurnCompletions", () => {
  it("stays silent the first time it sees a thread", () => {
    const result = reconcile(new Map(), [thread({ runStatus: "completed" })]);

    expect(result.notifications).toEqual([]);
    expect(result.phases.get(KEY)).toBe("completed");
  });

  it("notifies when a running turn completes", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "completed" })]);

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      key: KEY,
      title: "Fix the thread list finished",
      deepLink: "/threads/env-1/thread-1",
    });
  });

  it("notifies when a running turn fails", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "failed" })]);

    expect(result.notifications[0]?.title).toBe("Fix the thread list failed");
  });

  it("does not repeat once the completed phase is already recorded", () => {
    const first = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "completed" })]);
    const second = reconcile(first.phases, [thread({ runStatus: "completed" })]);

    expect(second.notifications).toEqual([]);
  });

  it("does not fire for a turn the user paused for approval", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [
      thread({ runStatus: "running", hasPendingApprovals: true }),
    ]);

    expect(result.notifications).toEqual([]);
    expect(result.phases.get(KEY)).toBe("waiting_for_approval");
  });

  it("stays silent while the finished thread is open in the foreground", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "completed" })], {
      foreground: true,
      openThreadKey: KEY,
    });

    expect(result.notifications).toEqual([]);
    // Recorded anyway: backgrounding later must not resurrect this completion.
    expect(result.phases.get(KEY)).toBe("completed");
  });

  it("shows the island instead of a notification for another thread in the foreground", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "completed" })], {
      foreground: true,
      openThreadKey: "env-1:thread-other",
    });

    expect(result.notifications).toEqual([]);
    expect(result.islands).toEqual([
      expect.objectContaining({ key: KEY, kind: "finished", deepLink: "/threads/env-1/thread-1" }),
    ]);
  });

  it("shows a failed island even with notifications off", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "failed" })], {
      enabled: false,
      foreground: true,
    });

    expect(result.islands[0]?.kind).toBe("failed");
  });

  it("shows an input island once when a thread starts waiting", () => {
    const first = reconcile(
      new Map([[KEY, "running"]]),
      [thread({ runStatus: "running", hasPendingUserInput: true })],
      { foreground: true },
    );
    const second = reconcile(
      first.phases,
      [thread({ runStatus: "running", hasPendingUserInput: true })],
      { foreground: true },
    );

    expect(first.islands).toEqual([
      expect.objectContaining({ kind: "input", title: "Fix the thread list needs input" }),
    ]);
    expect(second.islands).toEqual([]);
  });

  it("keeps the island away from the thread already open", () => {
    const result = reconcile(
      new Map([[KEY, "running"]]),
      [thread({ runStatus: "running", hasPendingApprovals: true })],
      { foreground: true, openThreadKey: KEY },
    );

    expect(result.islands).toEqual([]);
  });

  it("fires for the open thread once the app is backgrounded", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "completed" })], {
      foreground: false,
      openThreadKey: KEY,
    });

    expect(result.notifications).toHaveLength(1);
  });

  it("records phases but posts nothing while notifications are off", () => {
    const result = reconcile(new Map([[KEY, "running"]]), [thread({ runStatus: "completed" })], {
      enabled: false,
    });

    expect(result.notifications).toEqual([]);
    expect(result.phases.get(KEY)).toBe("completed");
  });

  it("forgets threads that left the list", () => {
    const result = reconcile(new Map([[KEY, "running"]]), []);

    expect(result.phases.size).toBe(0);
  });
});

describe("formatTurnCompletionNotification", () => {
  it("prefixes the body with the project", () => {
    expect(
      formatTurnCompletionNotification({
        key: KEY,
        phase: "completed",
        threadTitle: "Fix the thread list",
        projectTitle: "t3pretzel",
        headline: "Agent finished",
        detail: "Review the completed task.",
        deepLink: "/threads/env-1/thread-1",
      }).body,
    ).toBe("t3pretzel · Review the completed task.");
  });

  it("falls back to the headline without a detail", () => {
    expect(
      formatTurnCompletionNotification({
        key: KEY,
        phase: "failed",
        threadTitle: "Fix the thread list",
        projectTitle: "",
        headline: "Agent failed",
        detail: undefined,
        deepLink: "/threads/env-1/thread-1",
      }).body,
    ).toBe("Agent failed");
  });

  it("truncates a long thread title", () => {
    const notification = formatTurnCompletionNotification({
      key: KEY,
      phase: "completed",
      threadTitle: "t".repeat(200),
      projectTitle: "t3pretzel",
      headline: "Agent finished",
      detail: undefined,
      deepLink: "/threads/env-1/thread-1",
    });

    expect(notification.title).toHaveLength(120 + " finished".length);
    expect(notification.title.endsWith("… finished")).toBe(true);
  });

  it("names the thread when its title is blank", () => {
    expect(
      formatTurnCompletionNotification({
        key: KEY,
        phase: "completed",
        threadTitle: "   ",
        projectTitle: "t3pretzel",
        headline: "Agent finished",
        detail: undefined,
        deepLink: "/threads/env-1/thread-1",
      }).title,
    ).toBe("Thread finished");
  });
});
