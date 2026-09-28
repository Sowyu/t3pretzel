import { describe, expect, it } from "vite-plus/test";

import { EventId, type OrchestrationThreadActivity } from "@t3tools/contracts";

import { foldSubagentActivities } from "@t3tools/client-runtime/state/subagentRuntime";

import { deriveSubagentTabs, subagentToolCalls } from "./subagentTabs";

let seq = 0;
function row(kind: string, payload: Record<string, unknown>, summary = kind) {
  seq += 1;
  return {
    id: EventId.make(`e-${seq}`),
    tone: "info",
    kind,
    summary,
    payload,
    turnId: null,
    createdAt: `2026-09-27T10:00:${String(seq).padStart(2, "0")}.000Z`,
  } as OrchestrationThreadActivity;
}

describe("deriveSubagentTabs", () => {
  it("shows the live wave, keeps finished siblings, drops earlier waves", () => {
    const activities = [
      row("task.started", { taskId: "old", agentKind: "agent", title: "Old" }),
      row("task.completed", { taskId: "old", status: "completed" }),
      row("task.started", { taskId: "a", agentKind: "agent", title: "A" }),
      row("task.started", { taskId: "b", agentKind: "agent", title: "B" }),
      row("task.started", { taskId: "sh", agentKind: "background" }),
      row("task.completed", { taskId: "b", status: "completed" }),
    ];
    expect(
      deriveSubagentTabs(foldSubagentActivities(activities, { sessionLive: true })).map(
        (agent) => agent.id,
      ),
    ).toEqual(["a", "b"]);
    // A dead session interrupts every live agent, so the tabs go away.
    expect(deriveSubagentTabs(foldSubagentActivities(activities, { sessionLive: false }))).toEqual(
      [],
    );
  });
});

describe("subagentToolCalls", () => {
  it("folds a call's updates into its completion and ignores other agents", () => {
    const activities = [
      row(
        "tool.updated",
        { agentId: "a", itemType: "command_execution", data: { toolCallId: "t1" } },
        "Ran command",
      ),
      row("tool.updated", { agentId: "b", itemType: "file_change" }, "Edit"),
      row(
        "tool.completed",
        { agentId: "a", itemType: "command_execution", detail: "ls", data: { toolCallId: "t1" } },
        "Ran command",
      ),
      row(
        "tool.updated",
        { agentId: "a", itemType: "web_search", detail: "effect schema" },
        "Web search",
      ),
    ];
    expect(subagentToolCalls(activities, "a")).toEqual([
      { id: "id:t1", title: "Ran command", detail: "ls", done: true },
      {
        id: "web_search\u001fWeb search\u001feffect schema",
        title: "Web search",
        detail: "effect schema",
        done: false,
      },
    ]);
  });
});
