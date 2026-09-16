import { describe, expect, it } from "vite-plus/test";

import {
  EventId,
  MessageId,
  TurnId,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";

import { buildThreadFeed, deriveThreadFeedPresentation } from "./threadActivity";
import { threadReasoningItem, threadReasoningItems } from "./threadReasoning";

const turnId = TurnId.make("turn-1");

function reasoningActivity(input: {
  readonly id: string;
  readonly itemId: string;
  readonly seq: number;
  readonly summary: string;
  /** The exact chunk; the summary is its trimmed form on the wire. */
  readonly text?: string;
  readonly createdAt: string;
  readonly turnId?: typeof turnId | null;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.id),
    tone: "info",
    kind: "reasoning.text",
    summary: input.summary,
    payload: {
      itemId: input.itemId,
      streamKind: "reasoning_text",
      seq: input.seq,
      ...(input.text === undefined ? {} : { text: input.text }),
    },
    turnId: input.turnId === undefined ? turnId : input.turnId,
    createdAt: input.createdAt,
  };
}

function toolActivity(id: string, createdAt: string): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "tool",
    kind: "tool.completed",
    summary: "Ran a command",
    payload: { toolCallId: id, detail: "ls" },
    turnId,
    createdAt,
  };
}

function compactionActivity(
  id: string,
  state: "compacting" | "compacted",
  createdAt: string,
): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "info",
    kind: "context-compaction",
    summary: state === "compacting" ? "Compacting context" : "Compacted context 998K → 12K tokens",
    payload: { state },
    turnId,
    createdAt,
  };
}

function makeThread(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): Pick<OrchestrationThread, "messages" | "activities"> {
  return {
    messages: [
      {
        id: MessageId.make("message-1"),
        role: "user",
        text: "Explain the bug",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        turnId: null,
        streaming: false,
      },
    ],
    activities,
  };
}

describe("threadReasoningItems", () => {
  it("joins one block's chunks in seq order regardless of arrival order", () => {
    const activities = [
      reasoningActivity({
        id: "r-2",
        itemId: "item-a",
        seq: 1,
        summary: "the failing test",
        text: " the failing test",
        createdAt: "2026-01-01T00:00:02.000Z",
      }),
      reasoningActivity({
        id: "r-1",
        itemId: "item-a",
        seq: 0,
        summary: "Let me read",
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
    ];

    const item = threadReasoningItem(activities, "item-a");
    expect(item?.text).toBe("Let me read the failing test");
    expect(item?.chunks).toEqual(["Let me read", " the failing test"]);
    expect(item?.createdAt).toBe("2026-01-01T00:00:01.000Z");
  });

  it("keeps blocks apart and marks only the turn's last one as latest", () => {
    const otherTurn = TurnId.make("turn-2");
    const activities = [
      reasoningActivity({
        id: "r-1",
        itemId: "item-a",
        seq: 0,
        summary: "First thought",
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
      reasoningActivity({
        id: "r-2",
        itemId: "item-b",
        seq: 0,
        summary: "Second thought",
        createdAt: "2026-01-01T00:00:03.000Z",
      }),
      reasoningActivity({
        id: "r-3",
        itemId: "item-c",
        seq: 0,
        summary: "Other turn",
        createdAt: "2026-01-01T00:00:02.000Z",
        turnId: otherTurn,
      }),
    ];

    const items = threadReasoningItems(activities);
    expect(Array.from(items.keys())).toEqual(["item-a", "item-b", "item-c"]);
    expect(items.get("item-a")?.latestInTurn).toBe(false);
    expect(items.get("item-b")?.latestInTurn).toBe(true);
    expect(items.get("item-c")?.latestInTurn).toBe(true);
    expect(threadReasoningItem(activities, "item-d")).toBeNull();
  });

  it("keeps the spacing between chunks from payload.text and trims the block's edges", () => {
    const activities = [
      reasoningActivity({
        id: "r-1",
        itemId: "turn:turn-1:0",
        seq: 0,
        summary: "Let me look",
        text: "\n\nLet me look ",
        createdAt: "2026-09-16T00:00:01.000Z",
      }),
      reasoningActivity({
        id: "r-2",
        itemId: "turn:turn-1:0",
        seq: 1,
        summary: "at the file.",
        text: "at the file.\n",
        createdAt: "2026-09-16T00:00:02.000Z",
      }),
    ];
    const item = threadReasoningItem(activities, "turn:turn-1:0");
    expect(item?.text).toBe("Let me look at the file.");
    expect(item?.chunks).toEqual(["Let me look ", "at the file."]);
  });

  it("reuses a block's object while its text is unchanged", () => {
    const first = reasoningActivity({
      id: "r-1",
      itemId: "item-a",
      seq: 0,
      summary: "Stable",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const before = threadReasoningItem([first], "item-a");
    const after = threadReasoningItem([first, toolActivity("tool-1", "2026-01-01T00:00:02.000Z")], "item-a");
    expect(after).toBe(before);
    const grown = threadReasoningItem(
      [
        first,
        reasoningActivity({
          id: "r-2",
          itemId: "item-a",
          seq: 1,
          summary: "more",
          text: " more",
          createdAt: "2026-01-01T00:00:03.000Z",
        }),
      ],
      "item-a",
    );
    expect(grown).not.toBe(before);
    expect(grown?.text).toBe("Stable more");
  });
});

describe("thinking traces in the feed", () => {
  const activities = [
    reasoningActivity({
      id: "r-1",
      itemId: "item-a",
      seq: 0,
      summary: "Reading the failing test",
      createdAt: "2026-01-01T00:00:01.000Z",
    }),
    toolActivity("tool-1", "2026-01-01T00:00:02.000Z"),
    reasoningActivity({
      id: "r-2",
      itemId: "item-b",
      seq: 0,
      summary: "Now the fix",
      createdAt: "2026-01-01T00:00:03.000Z",
    }),
  ];

  it("never renders reasoning as a generic work-log row", () => {
    for (const thinkingTraces of [false, true]) {
      const rows = buildThreadFeed(makeThread(activities), { thinkingTraces }).flatMap((entry) =>
        entry.type === "activity-group" ? entry.activities : [],
      );
      expect(rows.map((activity) => activity.workEntry.sourceActivityKind)).toEqual([
        "tool.completed",
      ]);
    }
  });

  it("adds one row per block, in order around the tools, only when the setting is on", () => {
    expect(buildThreadFeed(makeThread(activities)).map((entry) => entry.type)).toEqual([
      "message",
      "activity-group",
    ]);
    const entries = buildThreadFeed(makeThread(activities), { thinkingTraces: true });
    expect(entries.map((entry) => entry.type)).toEqual([
      "message",
      "reasoning",
      "activity-group",
      "reasoning",
    ]);
    expect(entries.flatMap((entry) => (entry.type === "reasoning" ? [entry.itemKey] : []))).toEqual(
      ["item-a", "item-b"],
    );
  });

  it("retires the thinking shimmer once the turn has reasoning text", () => {
    const latestTurn = {
      turnId,
      state: "running" as const,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
    };
    const rowTypes = (thinkingTraces: boolean) =>
      deriveThreadFeedPresentation(
        buildThreadFeed(makeThread([activities[0]!]), { thinkingTraces }),
        latestTurn,
        new Set(),
        new Set(),
        latestTurn.startedAt,
      ).map((entry) => entry.type);

    expect(rowTypes(false)).toEqual(["message", "thinking"]);
    expect(rowTypes(true)).toEqual(["message", "reasoning"]);
  });
});

describe("context compaction rows", () => {
  const summaries = (activities: ReadonlyArray<OrchestrationThreadActivity>) =>
    buildThreadFeed(makeThread(activities)).flatMap((entry) =>
      entry.type === "activity-group"
        ? entry.activities.map((activity) => activity.workEntry.label)
        : [],
    );

  it("shows the start row until the server records the end, then only the end", () => {
    const compacting = compactionActivity("c-1", "compacting", "2026-01-01T00:00:01.000Z");
    expect(summaries([compacting])).toEqual(["Compacting context"]);
    const compacted = compactionActivity("c-2", "compacted", "2026-01-01T00:02:31.000Z");
    expect(summaries([compacting, compacted])).toEqual(["Compacted context 998K → 12K tokens"]);
  });

  it("keeps a start row that follows a finished compaction", () => {
    const activities = [
      compactionActivity("c-1", "compacted", "2026-01-01T00:00:01.000Z"),
      compactionActivity("c-2", "compacting", "2026-01-01T00:05:00.000Z"),
    ];
    expect(summaries(activities)).toEqual([
      "Compacted context 998K → 12K tokens",
      "Compacting context",
    ]);
  });
});
