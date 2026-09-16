import type { OrchestrationThreadActivity, TurnId } from "@t3tools/contracts";

/**
 * Reasoning chunks a patched server appends while a turn runs (t3-thinking).
 * One activity per flush, several per reasoning block; a block is keyed by
 * `payload.itemId` (the provider's reasoning item, or `turn:<turn>:<segment>`
 * for Claude Code, whose thinking deltas carry no item id and get a new
 * segment after every tool call or message). Stock servers never send these,
 * so every consumer here degrades to an empty result.
 */
export const REASONING_TEXT_ACTIVITY_KIND = "reasoning.text";

export function isReasoningTextActivity(activity: OrchestrationThreadActivity): boolean {
  return activity.kind === REASONING_TEXT_ACTIVITY_KIND;
}

export interface ThreadReasoningItem {
  /** Feed identity of the block. */
  readonly key: string;
  readonly turnId: TurnId | null;
  /** The block's first chunk, which is where it sits in the feed. */
  readonly createdAt: string;
  /** Flushed chunks in `payload.seq` order; each one fades in on its own. */
  readonly chunks: ReadonlyArray<string>;
  readonly text: string;
  /** False once a later block of the same turn exists; earlier blocks collapse. */
  readonly latestInTurn: boolean;
}

// The activities array is immutable, so a weak cache releases a thread's
// reasoning with its source data. The feed builder and every mounted
// reasoning row read through it, so the scan runs once per activity update.
const itemsCache = new WeakMap<
  ReadonlyArray<OrchestrationThreadActivity>,
  ReadonlyMap<string, ThreadReasoningItem>
>();
// A block whose text did not change keeps its object across updates, so a row
// subscribed to it re-renders only when its own text grows.
const lastItemByKey = new Map<string, ThreadReasoningItem>();

export function threadReasoningItems(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyMap<string, ThreadReasoningItem> {
  const cached = itemsCache.get(activities);
  if (cached) return cached;
  const built = buildThreadReasoningItems(activities);
  itemsCache.set(activities, built);
  return built;
}

export function threadReasoningItem(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  key: string,
): ThreadReasoningItem | null {
  return threadReasoningItems(activities).get(key) ?? null;
}

interface ReasoningItemDraft {
  readonly turnId: TurnId | null;
  createdAt: string;
  /** seq -> chunk */
  readonly chunks: Map<number, string>;
}

function buildThreadReasoningItems(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyMap<string, ThreadReasoningItem> {
  const drafts = new Map<string, ReasoningItemDraft>();
  for (const activity of activities) {
    if (!isReasoningTextActivity(activity) || activity.summary.length === 0) continue;
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const key =
      typeof payload?.itemId === "string" && payload.itemId.length > 0
        ? payload.itemId
        : activity.id;
    let draft = drafts.get(key);
    if (!draft) {
      draft = { turnId: activity.turnId, createdAt: activity.createdAt, chunks: new Map() };
      drafts.set(key, draft);
    } else if (activity.createdAt < draft.createdAt) {
      draft.createdAt = activity.createdAt;
    }
    // A chunk without a usable seq lands after the ones already collected; a
    // repeated seq replaces its chunk rather than appending it twice.
    const seq =
      typeof payload?.seq === "number" && Number.isFinite(payload.seq)
        ? payload.seq
        : draft.chunks.size;
    // The wire summary is trimmed to satisfy the contract; the exact chunk,
    // spacing included, rides in payload.text.
    draft.chunks.set(seq, typeof payload?.text === "string" ? payload.text : activity.summary);
  }

  // The last block of each turn, by first-chunk time (insertion order breaks ties).
  const latestKeyByTurn = new Map<string, string>();
  for (const [key, draft] of drafts) {
    const turnKey = draft.turnId ?? "";
    const current = latestKeyByTurn.get(turnKey);
    const currentDraft = current === undefined ? undefined : drafts.get(current);
    if (!currentDraft || draft.createdAt >= currentDraft.createdAt) latestKeyByTurn.set(turnKey, key);
  }

  const items = new Map<string, ThreadReasoningItem>();
  for (const [key, draft] of drafts) {
    const chunks = Array.from(draft.chunks.keys())
      .sort((left, right) => left - right)
      .map((seq) => draft.chunks.get(seq) ?? "");
    // Leading and trailing whitespace belong to no chunk on screen.
    if (chunks.length > 0) {
      chunks[0] = chunks[0]!.trimStart();
      chunks[chunks.length - 1] = chunks[chunks.length - 1]!.trimEnd();
    }
    const text = chunks.join("");
    if (text.length === 0) continue;
    const latestInTurn = latestKeyByTurn.get(draft.turnId ?? "") === key;
    const previous = lastItemByKey.get(key);
    const item =
      previous &&
      previous.text === text &&
      previous.chunks.length === chunks.length &&
      previous.latestInTurn === latestInTurn &&
      previous.createdAt === draft.createdAt
        ? previous
        : { key, turnId: draft.turnId, createdAt: draft.createdAt, chunks, text, latestInTurn };
    lastItemByKey.set(key, item);
    items.set(key, item);
  }
  return items;
}
