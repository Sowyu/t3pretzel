import { describe, expect, it } from "vite-plus/test";

import {
  EnvironmentId,
  ProjectId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { makeRawThreadShell } from "../../test-fixtures";
import { detectTurnCompletions } from "./turnCompletionNotifications";

const environmentId = EnvironmentId.make("env-1");
const projects = [{ id: ProjectId.make("project-test"), title: "Website" }];
const NOW = Date.parse("2026-01-01T01:00:00.000Z");
const at = (iso: string) => DateTime.makeUnsafe(iso);

function thread(
  id: string,
  input: Partial<OrchestrationV2ThreadShell> = {},
): OrchestrationV2ThreadShell {
  return makeRawThreadShell({
    id: ThreadId.make(id),
    title: `Thread ${id}`,
    updatedAt: at("2026-01-01T00:55:00.000Z"),
    ...input,
  });
}

const running = (id: string, run: string) =>
  thread(id, { latestRunId: RunId.make(run), activeRunId: RunId.make(run), status: "running" });
const finished = (id: string, run: string, status: "completed" | "failed" = "completed") =>
  thread(id, {
    latestRunId: RunId.make(run),
    status,
    latestRunCompletedAt: at("2026-01-01T00:59:00.000Z"),
  });

function detect(
  previous: ReadonlyArray<OrchestrationV2ThreadShell> | null,
  current: ReadonlyArray<OrchestrationV2ThreadShell>,
  nowMs = NOW,
) {
  return detectTurnCompletions({ environmentId, previous, current, projects, nowMs });
}

describe("detectTurnCompletions", () => {
  it("alerts once a running turn finishes, named after the thread and project", () => {
    expect(detect([running("a", "r1")], [finished("a", "r1")])).toEqual([
      {
        alertId: "turn:env-1:a:r1",
        title: "Thread a finished",
        body: "Website · Review the completed task.",
        path: "/threads/env-1/a",
      },
    ]);
  });

  it("says when the turn failed", () => {
    const [alert] = detect([running("a", "r1")], [finished("a", "r1", "failed")]);
    expect(alert?.title).toBe("Thread a failed");
  });

  it("stays quiet without an earlier view, so a first sync never alerts", () => {
    expect(detect(null, [finished("a", "r1")])).toEqual([]);
  });

  it("does not repeat a run the earlier view already showed finished", () => {
    expect(detect([finished("a", "r1")], [finished("a", "r1")])).toEqual([]);
  });

  it("alerts for a whole turn that started and finished between two refreshes", () => {
    const alerts = detect([finished("a", "r1")], [finished("a", "r2")]);
    expect(alerts.map((alert) => alert.alertId)).toEqual(["turn:env-1:a:r2"]);
  });

  it("alerts for a thread created and finished between two refreshes", () => {
    expect(detect([], [finished("b", "r1")]).map((alert) => alert.alertId)).toEqual([
      "turn:env-1:b:r1",
    ]);
  });

  it("gives every run its own id, so the native history posts each turn once", () => {
    const first = detect([running("a", "r1")], [finished("a", "r1")]);
    // A reconnect that replays an older snapshot sees the same edge again.
    const replay = detect([running("a", "r1")], [finished("a", "r1")]);
    expect(replay.map((alert) => alert.alertId)).toEqual(first.map((alert) => alert.alertId));
  });

  it("skips runs that are still going, waiting on the user, or interrupted", () => {
    const waiting = thread("c", {
      latestRunId: RunId.make("r1"),
      status: "waiting",
    });
    const interrupted = thread("d", { latestRunId: RunId.make("r1"), status: "interrupted" });
    expect(detect([], [running("a", "r1"), waiting, interrupted])).toEqual([]);
  });

  it("skips subagent and archived threads", () => {
    const subagent = finished("s", "r1");
    const child = {
      ...subagent,
      lineage: {
        rootThreadId: ThreadId.make("a"),
        parentThreadId: ThreadId.make("a"),
        relationshipToParent: "subagent" as const,
      },
    };
    const archived = { ...finished("x", "r1"), archivedAt: at("2026-01-01T00:59:30.000Z") };
    expect(detect([], [child, archived])).toEqual([]);
  });

  it("drops turns that finished long ago, so a refresh after days away does not flood", () => {
    const old = thread("a", {
      latestRunId: RunId.make("r1"),
      status: "completed",
      latestRunCompletedAt: at("2025-12-30T00:00:00.000Z"),
    });
    expect(detect([], [old])).toEqual([]);
  });
});
