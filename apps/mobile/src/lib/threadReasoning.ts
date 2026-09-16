import type { OrchestrationThreadActivity, TurnId } from "@t3tools/contracts";

/**
 * Reasoning chunks a patched server appends while a turn runs. One activity
 * per flush, several per reasoning item; the text of an item is the `summary`
 * of its activities joined in `payload.seq` order. Stock servers never send
 * these, so every consumer here degrades to an empty result.
 */
export const REASONING_TEXT_ACTIVITY_KIND = "reasoning.text";

export function isReasoningTextActivity(activity: OrchestrationThreadActivity): boolean {
  return activity.kind === REASONING_TEXT_ACTIVITY_KIND;
}

export interface ThreadReasoningTurn {
  readonly turnId: TurnId | null;
  /** The turn's first chunk, which is where the block sits in the feed. */
  readonly createdAt: string;
  /** Items in arrival order, joined by a blank line. */
  readonly text: string;
}

/** Chunks that arrived without a turn share the one empty key. */
export function reasoningTurnKey(turnId: TurnId | null): string {
  return turnId ?? "";
}

// The activities array is immutable, so a weak cache releases a thread's
// reasoning with its source data. The feed builder and every mounted
// reasoning row read through it, so the scan runs once per activity update.
const reasoningCache = new WeakMap<
  ReadonlyArray<OrchestrationThreadActivity>,
  ReadonlyMap<string, ThreadReasoningTurn>
>();

export function threadReasoningByTurn(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyMap<string, ThreadReasoningTurn> {
  const cached = reasoningCache.get(activities);
  if (cached) return cached;
  const built = buildThreadReasoningByTurn(activities);
  reasoningCache.set(activities, built);
  return built;
}

export function threadReasoningText(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null,
): string {
  return threadReasoningByTurn(activities).get(reasoningTurnKey(turnId))?.text ?? "";
}

interface ReasoningTurnDraft {
  readonly turnId: TurnId | null;
  createdAt: string;
  /** itemId -> seq -> chunk. Insertion order is the order items render in. */
  readonly items: Map<string, Map<number, string>>;
}

function buildThreadReasoningByTurn(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyMap<string, ThreadReasoningTurn> {
  const drafts = new Map<string, ReasoningTurnDraft>();
  for (const activity of activities) {
    if (!isReasoningTextActivity(activity) || activity.summary.length === 0) continue;
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const itemId =
      typeof payload?.itemId === "string" && payload.itemId.length > 0
        ? payload.itemId
        : activity.id;
    const key = reasoningTurnKey(activity.turnId);
    let draft = drafts.get(key);
    if (!draft) {
      draft = { turnId: activity.turnId, createdAt: activity.createdAt, items: new Map() };
      drafts.set(key, draft);
    } else if (activity.createdAt < draft.createdAt) {
      draft.createdAt = activity.createdAt;
    }
    let chunks = draft.items.get(itemId);
    if (!chunks) {
      chunks = new Map();
      draft.items.set(itemId, chunks);
    }
    // A chunk without a usable seq lands after the ones already collected; a
    // repeated seq replaces its chunk rather than appending it twice.
    const seq =
      typeof payload?.seq === "number" && Number.isFinite(payload.seq) ? payload.seq : chunks.size;
    // The wire summary is trimmed to satisfy the contract; the exact chunk,
    // spacing included, rides in payload.text.
    chunks.set(seq, typeof payload?.text === "string" ? payload.text : activity.summary);
  }

  const reasoningByTurn = new Map<string, ThreadReasoningTurn>();
  for (const [key, draft] of drafts) {
    const items: string[] = [];
    for (const chunks of draft.items.values()) {
      const text = Array.from(chunks.keys())
        .sort((left, right) => left - right)
        .map((seq) => chunks.get(seq))
        .join("")
        .trim();
      if (text.length > 0) items.push(text);
    }
    if (items.length === 0) continue;
    reasoningByTurn.set(key, {
      turnId: draft.turnId,
      createdAt: draft.createdAt,
      text: items.join("\n\n"),
    });
  }
  return reasoningByTurn;
}
