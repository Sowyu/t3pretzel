import { describe, expect, it } from "vite-plus/test";

import {
  deriveTimelineRailItems,
  resolveTimelineRailCurrentIndex,
  resolveTimelineRailHeight,
  resolveTimelineRailIndexFromY,
  resolveTimelineRailTickOffset,
} from "./thread-timeline-rail.logic";

const rows = [
  { id: "u1", type: "message", message: { role: "user", text: "  First\nquestion " } },
  { id: "a1", type: "message", message: { role: "assistant", text: "Draft" } },
  { id: "w1", type: "activity-group" },
  { id: "a2", type: "message", message: { role: "assistant", text: "Final  answer" } },
  { id: "u2", type: "message", message: { role: "user", text: "" } },
  { id: "u3", type: "message", message: { role: "user", text: "Third" } },
];

describe("deriveTimelineRailItems", () => {
  it("keeps one item per user message with the turn's final answer as preview", () => {
    expect(deriveTimelineRailItems(rows)).toEqual([
      { id: "u1", rowIndex: 0, userText: "First question", assistantText: "Final answer" },
      { id: "u2", rowIndex: 4, userText: null, assistantText: null },
      { id: "u3", rowIndex: 5, userText: "Third", assistantText: null },
    ]);
  });
});

describe("rail geometry", () => {
  it("spaces ticks evenly and caps the rail to the viewport", () => {
    expect(resolveTimelineRailHeight(5, 1000)).toBe(40);
    expect(resolveTimelineRailHeight(200, 300)).toBe(300);
    expect(resolveTimelineRailTickOffset(0, 5, 40)).toBe(0);
    expect(resolveTimelineRailTickOffset(4, 5, 40)).toBe(40);
    expect(resolveTimelineRailTickOffset(2, 5, 40)).toBe(20);
  });

  it("maps a touch to the nearest tick", () => {
    expect(resolveTimelineRailIndexFromY({ itemCount: 5, railHeight: 40, y: -10 })).toBe(0);
    expect(resolveTimelineRailIndexFromY({ itemCount: 5, railHeight: 40, y: 14 })).toBe(1);
    expect(resolveTimelineRailIndexFromY({ itemCount: 5, railHeight: 40, y: 99 })).toBe(4);
    expect(resolveTimelineRailIndexFromY({ itemCount: 1, railHeight: 1, y: 0 })).toBe(0);
    expect(resolveTimelineRailIndexFromY({ itemCount: 0, railHeight: 1, y: 0 })).toBeNull();
  });

  it("picks the first user message on screen, else the last one scrolled past", () => {
    const items = deriveTimelineRailItems(rows);
    expect(resolveTimelineRailCurrentIndex({ items, firstVisibleRow: 0, lastVisibleRow: 2 })).toBe(0);
    expect(resolveTimelineRailCurrentIndex({ items, firstVisibleRow: 1, lastVisibleRow: 3 })).toBe(0);
    expect(resolveTimelineRailCurrentIndex({ items, firstVisibleRow: 4, lastVisibleRow: 5 })).toBe(1);
    expect(resolveTimelineRailCurrentIndex({ items, firstVisibleRow: 6, lastVisibleRow: 9 })).toBe(2);
  });
});
