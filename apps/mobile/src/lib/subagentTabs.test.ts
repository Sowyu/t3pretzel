import { describe, expect, it } from "vite-plus/test";

import {
  MessageId,
  NodeId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2Subagent,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { deriveThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import * as DateTime from "effect/DateTime";

import {
  deriveSubagentTabs,
  selectSubagents,
  subagentTitle,
  subagentToolCalls,
} from "./subagentTabs";

const threadId = ThreadId.make("thread-parent");
const childThreadId = ThreadId.make("thread-child");
const at = (second: number) =>
  DateTime.makeUnsafe(`2026-09-27T10:00:${String(second).padStart(2, "0")}.000Z`);

function agent(
  id: string,
  run: string,
  second: number,
  status: OrchestrationV2Subagent["status"],
  title: string | null = id,
): OrchestrationV2Subagent {
  return {
    id: NodeId.make(id),
    threadId,
    runId: RunId.make(run),
    parentNodeId: NodeId.make("root"),
    origin: "provider_native",
    createdBy: "agent",
    driver: ProviderDriverKind.make("codex"),
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerThreadId: null,
    childThreadId: null,
    nativeTaskRef: null,
    prompt: `Prompt for ${id}`,
    title,
    model: "gpt-5.4",
    status,
    result: null,
    startedAt: at(second),
    completedAt: null,
    updatedAt: at(second),
  };
}

const base = {
  threadId: childThreadId,
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  startedAt: null,
  completedAt: null,
  updatedAt: at(0),
} as const;

describe("deriveSubagentTabs", () => {
  it("shows the current run's roster while any agent runs, drops earlier runs", () => {
    const subagents = [
      agent("old", "run-1", 1, "completed"),
      agent("b", "run-2", 3, "completed"),
      agent("a", "run-2", 2, "running"),
    ];
    expect(
      deriveSubagentTabs(deriveThreadTurnSubagents({ runs: [], subagents })).map(
        (entry) => entry.id,
      ),
    ).toEqual(["a", "b"]);
    // Once every agent settles the pill goes away.
    const settled = subagents.map((entry) => ({ ...entry, status: "completed" as const }));
    expect(deriveSubagentTabs(deriveThreadTurnSubagents({ runs: [], subagents: settled }))).toEqual(
      [],
    );
    expect(deriveSubagentTabs(null)).toEqual([]);
  });
});

describe("selectSubagents", () => {
  it("keeps the requested agents in spawn order", () => {
    const subagents = [
      agent("c", "run-1", 5, "running"),
      agent("a", "run-1", 1, "completed"),
      agent("b", "run-1", 3, "running"),
    ];
    expect(selectSubagents(subagents, new Set(["c", "a"])).map((entry) => entry.id)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("subagentTitle", () => {
  it("falls back to the prompt and formats Codex task paths", () => {
    expect(subagentTitle({ title: null, prompt: "  Find the bug  " })).toBe("Find the bug");
    expect(subagentTitle({ title: "/root/code_reviewer", prompt: "x" })).toBe("Code Reviewer");
  });
});

describe("subagentToolCalls", () => {
  it("lists tool items by ordinal and skips messages", () => {
    const items: ReadonlyArray<OrchestrationV2TurnItem> = [
      {
        ...base,
        id: TurnItemId.make("i-3"),
        ordinal: 3,
        status: "running",
        title: null,
        type: "web_search",
        patterns: ["effect schema"],
      },
      {
        ...base,
        id: TurnItemId.make("i-1"),
        ordinal: 1,
        status: "completed",
        title: null,
        type: "assistant_message",
        messageId: MessageId.make("m-1"),
        text: "On it",
        streaming: false,
      },
      {
        ...base,
        id: TurnItemId.make("i-2"),
        ordinal: 2,
        status: "completed",
        title: "Ran ls",
        type: "command_execution",
        input: "ls -la",
        output: "secret output",
      },
    ];
    expect(subagentToolCalls(items)).toEqual([
      { id: "i-2", title: "Ran ls", detail: "ls -la", done: true },
      { id: "i-3", title: "Searched the web", detail: "effect schema", done: false },
    ]);
  });
});
