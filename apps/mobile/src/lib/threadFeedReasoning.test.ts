import { describe, expect, it } from "vite-plus/test";

import {
  MessageId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  buildThreadFeed,
  deriveThreadFeedPresentation,
  isReasoningTraceActivityGroup,
  type ThreadFeedEntry,
  type ThreadFeedLatestRun,
} from "./threadActivity";

const threadId = ThreadId.make("thread-1");
const runId = RunId.make("run-1");
const startedAt = "2026-01-01T00:00:00.000Z";

function base(id: string, at: string, ordinal: number, run: RunId = runId) {
  const timestamp = DateTime.makeUnsafe(at);
  return {
    id: TurnItemId.make(id),
    threadId,
    runId: run,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: "completed" as const,
    title: null,
    startedAt: timestamp,
    completedAt: timestamp,
    updatedAt: timestamp,
  };
}

const prompt: OrchestrationV2TurnItem = {
  ...base("prompt", startedAt, 0),
  type: "user_message",
  messageId: MessageId.make("message-1"),
  createdBy: "user",
  creationSource: "mobile",
  inputIntent: "turn_start",
  text: "Explain the bug",
  attachments: [],
};

function thought(
  id: string,
  at: string,
  options?: { readonly running?: boolean; readonly run?: RunId },
): OrchestrationV2TurnItem {
  const item = base(id, at, 1, options?.run);
  return options?.running
    ? {
        ...item,
        type: "reasoning",
        status: "running",
        completedAt: null,
        streaming: true,
        text: id,
      }
    : { ...item, type: "reasoning", streaming: false, text: id };
}

function tool(id: string, at: string): OrchestrationV2TurnItem {
  return {
    ...base(id, at, 2),
    type: "command_execution",
    input: "ls",
    output: "ok",
    exitCode: 0,
  };
}

function answer(at: string): OrchestrationV2TurnItem {
  return {
    ...base("answer", at, 3),
    type: "assistant_message",
    messageId: MessageId.make("assistant-1"),
    text: "Fixed it",
    streaming: false,
  };
}

function feed(items: ReadonlyArray<OrchestrationV2TurnItem>, thinkingTraces: boolean) {
  const rows: OrchestrationV2ProjectedTurnItem[] = [prompt, ...items].map((item, position) => ({
    position,
    visibility: "local",
    sourceThreadId: threadId,
    sourceItemId: item.id,
    item,
  }));
  return buildThreadFeed(rows, { thinkingTraces });
}

function label(entry: ThreadFeedEntry): string {
  if (entry.type === "message") return entry.message.id;
  if (entry.type === "activity-group" && isReasoningTraceActivityGroup(entry)) {
    return `trace:${entry.activities[0]!.projectedItem.item.id}`;
  }
  return entry.type;
}

const runningRun: ThreadFeedLatestRun = {
  runId,
  status: "running",
  startedAt,
  completedAt: null,
};
const settledRun: ThreadFeedLatestRun = {
  runId,
  status: "completed",
  startedAt,
  completedAt: "2026-01-01T00:00:09.000Z",
};

describe("thinking traces in the feed", () => {
  const items = [
    thought("reasoning-1", "2026-01-01T00:00:01.000Z"),
    tool("tool-1", "2026-01-01T00:00:02.000Z"),
    answer("2026-01-01T00:00:03.000Z"),
  ];

  it("stands each reasoning item alone, in order, only when the setting is on", () => {
    expect(feed(items, false).map(label)).toEqual(["message-1", "activity-group", "assistant-1"]);
    expect(feed(items, true).map(label)).toEqual([
      "message-1",
      "trace:reasoning-1",
      "activity-group",
      "assistant-1",
    ]);
  });

  it("gives the live slot to a running trace instead of the Thinking row", () => {
    const rows = deriveThreadFeedPresentation(
      feed([thought("reasoning-1", "2026-01-01T00:00:01.000Z", { running: true })], true),
      runningRun,
      new Set(),
      new Set(),
      startedAt,
    );
    expect(rows.map(label)).toEqual(["message-1", "trace:reasoning-1"]);
  });

  it("keeps the Thinking row when the running block belongs to an older run", () => {
    const rows = deriveThreadFeedPresentation(
      feed(
        [
          thought("reasoning-1", "2026-01-01T00:00:01.000Z", {
            running: true,
            run: RunId.make("run-0"),
          }),
        ],
        true,
      ),
      runningRun,
      new Set(),
      new Set(),
      startedAt,
    );
    expect(rows.map(label)).toEqual(["message-1", "trace:reasoning-1", "thinking"]);
  });

  it("settles a trace once later work supersedes it", () => {
    const rows = deriveThreadFeedPresentation(
      feed(
        [
          thought("reasoning-1", "2026-01-01T00:00:01.000Z", { running: true }),
          tool("tool-1", "2026-01-01T00:00:02.000Z"),
        ],
        true,
      ),
      runningRun,
      new Set(),
      new Set(),
      startedAt,
    );
    const trace = rows.find(
      (row) => row.type === "activity-group" && isReasoningTraceActivityGroup(row),
    );
    expect(trace).toMatchObject({ activities: [{ lifecycleStatus: "completed" }] });
  });

  it("folds a settled run's thinking with its work", () => {
    const rows = deriveThreadFeedPresentation(feed(items, true), settledRun, new Set());
    expect(rows.map(label)).toEqual(["message-1", "run-fold", "assistant-1"]);
  });

  it("keeps a lone trace visible when the fold would hide nothing else", () => {
    const rows = deriveThreadFeedPresentation(
      feed(
        [thought("reasoning-1", "2026-01-01T00:00:01.000Z"), answer("2026-01-01T00:00:03.000Z")],
        true,
      ),
      settledRun,
      new Set(),
    );
    expect(rows.map(label)).toEqual(["message-1", "trace:reasoning-1", "assistant-1"]);
  });
});
