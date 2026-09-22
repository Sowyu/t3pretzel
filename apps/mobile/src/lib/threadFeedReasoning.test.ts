import { describe, expect, it } from "vite-plus/test";

import {
  EventId,
  MessageId,
  TurnId,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";

import { buildThreadFeed, deriveThreadFeedPresentation } from "./threadActivity";

const turnId = TurnId.make("turn-1");
const createdAt = "2026-01-01T00:00:00.000Z";

function message(input: {
  readonly id: string;
  readonly role: OrchestrationThread["messages"][number]["role"];
  readonly text: string;
  readonly createdAt: string;
  readonly streaming?: boolean;
  readonly turnId?: typeof turnId | null;
}): OrchestrationThread["messages"][number] {
  return {
    id: MessageId.make(input.id),
    role: input.role,
    text: input.text,
    turnId: input.turnId === undefined ? turnId : input.turnId,
    streaming: input.streaming === true,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
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

/** The shape an earlier local server patch wrote into threads that still exist. */
function legacyReasoningActivity(id: string, createdAt: string): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "info",
    kind: "reasoning.text",
    summary: "Let me read the failing test",
    payload: { itemId: "item-a", seq: 0, text: "Let me read the failing test" },
    turnId,
    createdAt,
  };
}

const prompt = message({
  id: "message-1",
  role: "user",
  text: "Explain the bug",
  createdAt,
  turnId: null,
});

function thread(input: {
  readonly messages: ReadonlyArray<OrchestrationThread["messages"][number]>;
  readonly activities?: ReadonlyArray<OrchestrationThreadActivity>;
}): Pick<OrchestrationThread, "messages" | "activities"> {
  return { messages: [prompt, ...input.messages], activities: input.activities ?? [] };
}

const runningTurn = {
  turnId,
  state: "running" as const,
  startedAt: createdAt,
  completedAt: null,
};
const settledTurn = {
  turnId,
  state: "completed" as const,
  startedAt: createdAt,
  completedAt: "2026-01-01T00:00:09.000Z",
};

describe("reasoning messages in the feed", () => {
  const messages = [
    message({
      id: "reasoning-1",
      role: "reasoning",
      text: "Reading the failing test",
      createdAt: "2026-01-01T00:00:01.000Z",
    }),
    message({
      id: "assistant-1",
      role: "assistant",
      text: "Fixed it",
      createdAt: "2026-01-01T00:00:03.000Z",
    }),
  ];

  it("adds a row per reasoning message, in order, only when the setting is on", () => {
    const withActivity = thread({
      messages,
      activities: [toolActivity("tool-1", "2026-01-01T00:00:02.000Z")],
    });
    expect(buildThreadFeed(withActivity).map((entry) => entry.type)).toEqual([
      "message",
      "activity-group",
      "message",
    ]);
    const entries = buildThreadFeed(withActivity, { thinkingTraces: true });
    expect(
      entries.map((entry) => (entry.type === "message" ? entry.message.id : entry.type)),
    ).toEqual(["message-1", "reasoning-1", "activity-group", "assistant-1"]);
  });

  it("never renders a legacy reasoning.text activity as a work-log row", () => {
    for (const thinkingTraces of [false, true]) {
      const rows = buildThreadFeed(
        thread({
          messages,
          activities: [
            legacyReasoningActivity("r-1", "2026-01-01T00:00:01.000Z"),
            toolActivity("tool-1", "2026-01-01T00:00:02.000Z"),
          ],
        }),
        { thinkingTraces },
      ).flatMap((entry) => (entry.type === "activity-group" ? entry.activities : []));
      expect(rows.map((activity) => activity.workEntry.sourceActivityKind)).toEqual([
        "tool.completed",
      ]);
    }
  });

  it("gives the live slot to a streaming reasoning message instead of the shimmer", () => {
    const rowTypes = (thinkingTraces: boolean) =>
      deriveThreadFeedPresentation(
        buildThreadFeed(
          thread({
            messages: [
              message({
                id: "reasoning-1",
                role: "reasoning",
                text: "Reading the failing test",
                createdAt: "2026-01-01T00:00:01.000Z",
                streaming: true,
              }),
            ],
          }),
          { thinkingTraces },
        ),
        runningTurn,
        new Set(),
        new Set(),
        runningTurn.startedAt,
      ).map((entry) => (entry.type === "message" ? `message:${entry.message.role}` : entry.type));

    expect(rowTypes(false)).toEqual(["message:user", "thinking"]);
    expect(rowTypes(true)).toEqual(["message:user", "message:reasoning"]);
  });

  it("keeps the shimmer when the streaming block belongs to an older turn", () => {
    const rows = deriveThreadFeedPresentation(
      buildThreadFeed(
        thread({
          messages: [
            message({
              id: "reasoning-1",
              role: "reasoning",
              text: "Stranded by a crash",
              createdAt: "2026-01-01T00:00:01.000Z",
              streaming: true,
              turnId: TurnId.make("turn-0"),
            }),
          ],
        }),
        { thinkingTraces: true },
      ),
      runningTurn,
      new Set(),
      new Set(),
      runningTurn.startedAt,
    );
    expect(rows.map((entry) => entry.type)).toEqual(["message", "message", "thinking"]);
  });

  it("folds a settled turn's thinking with its work, without waiting on its streaming flag", () => {
    const rows = deriveThreadFeedPresentation(
      buildThreadFeed(
        thread({
          messages: [
            message({
              id: "reasoning-1",
              role: "reasoning",
              text: "Stranded by a crash",
              createdAt: "2026-01-01T00:00:01.000Z",
              streaming: true,
            }),
            message({
              id: "assistant-1",
              role: "assistant",
              text: "Fixed it",
              createdAt: "2026-01-01T00:00:03.000Z",
            }),
          ],
          activities: [toolActivity("tool-1", "2026-01-01T00:00:02.000Z")],
        }),
        { thinkingTraces: true },
      ),
      settledTurn,
      new Set(),
      new Set(),
      null,
    );
    expect(
      rows.map((entry) => (entry.type === "message" ? entry.message.id : entry.type)),
    ).toEqual(["message-1", "turn-fold", "assistant-1"]);
  });

  it("keeps a lone thinking row visible when the fold would hide nothing else", () => {
    const rows = deriveThreadFeedPresentation(
      buildThreadFeed(
        thread({
          messages: [
            message({
              id: "reasoning-1",
              role: "reasoning",
              text: "Thought it through",
              createdAt: "2026-01-01T00:00:01.000Z",
            }),
            message({
              id: "assistant-1",
              role: "assistant",
              text: "Fixed it",
              createdAt: "2026-01-01T00:00:03.000Z",
            }),
          ],
        }),
        { thinkingTraces: true },
      ),
      settledTurn,
      new Set(),
      new Set(),
      null,
    );
    expect(
      rows.map((entry) => (entry.type === "message" ? entry.message.id : entry.type)),
    ).toEqual(["message-1", "reasoning-1", "assistant-1"]);
  });
});
