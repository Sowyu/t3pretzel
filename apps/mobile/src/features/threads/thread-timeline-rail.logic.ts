/**
 * The timeline rail: one tick per user message down the edge of the thread,
 * ported from the desktop MessagesTimeline minimap. Ticks are evenly spaced,
 * widen around the current turn, and tapping or dragging the rail jumps to
 * a message. Pure helpers here; the view lives in thread-timeline-rail.tsx.
 */

export interface TimelineRailRow {
  readonly type: string;
  readonly message?: { readonly role: string; readonly text: string | null | undefined };
}

export interface TimelineRailItem {
  readonly id: string;
  /** Index of the message row in the list the rail scrolls. */
  readonly rowIndex: number;
  readonly userText: string | null;
  /** The turn's final assistant text, for the drag preview. */
  readonly assistantText: string | null;
}

export const TIMELINE_RAIL_MIN_ITEMS = 2;
export const TIMELINE_RAIL_ITEM_SPACING = 10;

export function deriveTimelineRailItems(
  rows: ReadonlyArray<TimelineRailRow & { readonly id: string }>,
): TimelineRailItem[] {
  const items: TimelineRailItem[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row?.type !== "message" || row.message?.role !== "user") continue;
    items.push({
      id: row.id,
      rowIndex: index,
      userText: compactPreview(row.message.text),
      assistantText: compactPreview(finalAssistantTextForTurn(rows, index)),
    });
  }
  return items;
}

function finalAssistantTextForTurn(
  rows: ReadonlyArray<TimelineRailRow>,
  userRowIndex: number,
): string | null {
  let finalAssistantText: string | null = null;
  for (let index = userRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row?.type !== "message" || !row.message) continue;
    if (row.message.role === "user") break;
    if (row.message.role === "assistant") finalAssistantText = row.message.text ?? null;
  }
  return finalAssistantText;
}

function compactPreview(text: string | null | undefined): string | null {
  const compact = text?.replace(/\s+/g, " ").trim() ?? "";
  return compact.length > 0 ? compact : null;
}

/** Rail height that keeps the ticks at their natural spacing, capped to the viewport. */
export function resolveTimelineRailHeight(itemCount: number, maxHeight: number): number {
  const natural = Math.max(1, (itemCount - 1) * TIMELINE_RAIL_ITEM_SPACING);
  return Math.max(1, Math.min(natural, maxHeight));
}

export function resolveTimelineRailTickOffset(
  index: number,
  itemCount: number,
  railHeight: number,
): number {
  if (itemCount <= 1) return 0;
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * railHeight;
}

export function resolveTimelineRailIndexFromY(input: {
  readonly itemCount: number;
  readonly railHeight: number;
  readonly y: number;
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) return null;
  if (input.itemCount === 1) return 0;
  const progress = Math.max(0, Math.min(1, input.y / input.railHeight));
  return Math.max(0, Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))));
}

/**
 * The turn at the reader's position: the first user message on screen, else
 * the last one scrolled past above it.
 */
export function resolveTimelineRailCurrentIndex(input: {
  readonly items: ReadonlyArray<TimelineRailItem>;
  readonly firstVisibleRow: number;
  readonly lastVisibleRow: number;
}): number | null {
  let precedingIndex: number | null = null;
  for (const [index, item] of input.items.entries()) {
    if (item.rowIndex >= input.firstVisibleRow && item.rowIndex <= input.lastVisibleRow) {
      return index;
    }
    if (item.rowIndex < input.firstVisibleRow) precedingIndex = index;
  }
  return precedingIndex;
}

/** Desktop widths: the current tick is widest and its neighbours taper off. */
export function resolveTimelineRailTickWidth(distance: number | null): number {
  if (distance === null) return 8;
  if (distance === 0) return 24;
  if (distance === 1) return 16;
  if (distance === 2) return 10;
  return 8;
}
