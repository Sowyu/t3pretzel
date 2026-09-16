import { describe, expect, it } from "vite-plus/test";

import {
  EventId,
  MessageId,
  TurnId,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";

import { buildThreadFeed, deriveThreadFeedPresentation } from "./threadActivity";
import { threadReasoningByTurn, threadReasoningText } from "./threadReasoning";

const turnId = TurnId.make("turn-1");

function reasoningActivity(input: {
  readonly id: string;
  readonly itemId: string;
  readonly seq: number;
  readonly summary: string;
  readonly createdAt: string;
  readonly turnId?: typeof turnId | null;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.id),
    tone: "info",
    kind: "reasoning.text",
    summary: input.summary,
    payload: { itemId: input.itemId, streamKind: "reasoning_text", seq: input.seq },
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

describe("threadReasoningByTurn", () => {
  it("joins one item's chunks in seq order regardless of arrival order", () => {
    const activities = [
      reasoningActivity({
        id: "r-2",
        itemId: "item-a",
        seq: 1,
        summary: " the failing test",
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

    expect(threadReasoningText(activities, turnId)).toBe("Let me read the failing test");
    expect(threadReasoningByTurn(activities).get(turnId)?.createdAt).toBe(
      "2026-01-01T00:00:01.000Z",
    );
  });

  it("separates several reasoning items with a blank line", () => {
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
        itemId: "item-b",
        seq: 1,
        summary: ", continued",
        createdAt: "2026-01-01T00:00:04.000Z",
      }),
    ];

    expect(threadReasoningText(activities, turnId)).toBe(
      "First thought\n\nSecond thought, continued",
    );
  });

  it("keeps turns apart and reports nothing for a turn that never reasoned", () => {
    const otherTurn = TurnId.make("turn-2");
    const activities = [
      reasoningActivity({
        id: "r-1",
        itemId: "item-a",
        seq: 0,
        summary: "Turn one",
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
      reasoningActivity({
        id: "r-2",
        itemId: "item-b",
        seq: 0,
        summary: "Turn two",
        createdAt: "2026-01-01T00:00:02.000Z",
        turnId: otherTurn,
      }),
    ];

    expect(threadReasoningText(activities, turnId)).toBe("Turn one");
    expect(threadReasoningText(activities, otherTurn)).toBe("Turn two");
    expect(threadReasoningText(activities, TurnId.make("turn-3"))).toBe("");
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

  it("adds one reasoning row per turn only when the setting is on", () => {
    expect(buildThreadFeed(makeThread(activities)).map((entry) => entry.type)).toEqual([
      "message",
      "activity-group",
    ]);
    expect(
      buildThreadFeed(makeThread(activities), { thinkingTraces: true }).map((entry) => entry.type),
    ).toEqual(["message", "reasoning", "activity-group"]);
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
