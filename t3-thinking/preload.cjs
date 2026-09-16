"use strict";
// Loaded into the T3 server through NODE_OPTIONS=--require. The patched
// ingestion calls globalThis.__t3Thinking(...) once per provider runtime
// event, after the assistant-text handling; this file holds the logic so the
// binary edit stays a one-line same-length hook and can be iterated without
// re-patching. Harmless in any other process: it only defines a global.

const buffers = new Map();
const debug = process.env.T3_THINKING_DEBUG === "1";
const log = (message) => {
  if (debug) process.stderr.write(`[t3-thinking] ${message}\n`);
};
const FLUSH_CHARS = 400;
const FLUSH_MS = 500;

function* appendActivity(ctx, itemId, buffer, streamKind) {
  const summary = buffer.text.trim();
  if (summary.length === 0) return;
  const { event, thread, now, orchestrationEngine, providerCommandId, EventId } = ctx;
  log(`flush turn=${String(event.turnId)} item=${itemId} seq=${buffer.seq} chars=${buffer.text.length}`);
  yield* orchestrationEngine.dispatch({
    type: "thread.activity.append",
    commandId: yield* providerCommandId(event, "reasoning.text"),
    threadId: thread.id,
    activity: {
      id: EventId.make(`${event.eventId}:reasoning.text:${buffer.seq}`),
      createdAt: now,
      tone: "info",
      kind: "reasoning.text",
      summary,
      payload: { itemId, streamKind, seq: buffer.seq, text: buffer.text },
      ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
    },
    createdAt: now,
  });
  buffer.text = "";
  buffer.seq += 1;
}

globalThis.__t3Thinking = function* (event, thread, now, orchestrationEngine, providerCommandId, EventId, toTurnId) {
  const ctx = { event, thread, now, orchestrationEngine, providerCommandId, EventId, turnId: toTurnId(event.turnId) };
  const payload = event.type === "content.delta" ? event.payload : undefined;
  const isReasoning =
    payload !== undefined &&
    (payload.streamKind === "reasoning_text" || payload.streamKind === "reasoning_summary_text");
  if (isReasoning) {
    // Claude Code's thinking deltas carry no item id; key those per turn.
    const itemId = event.itemId ?? `turn:${String(event.turnId ?? "none")}`;
    const key = `${thread.id}:${itemId}`;
    let buffer = buffers.get(key);
    if (!buffer) {
      buffer = { text: "", streamKind: payload.streamKind, seq: 0, lastFlushAt: Date.now() };
      buffers.set(key, buffer);
      log(`first reasoning delta thread=${thread.id} turn=${String(event.turnId)} item=${itemId}`);
    }
    buffer.streamKind = payload.streamKind;
    buffer.text += String(payload.delta ?? "");
    const at = Date.now();
    if (buffer.text.length >= FLUSH_CHARS || at - buffer.lastFlushAt >= FLUSH_MS) {
      yield* appendActivity(ctx, itemId, buffer, payload.streamKind);
      buffer.lastFlushAt = at;
    }
  }
  const terminal =
    event.type === "item.completed" ||
    event.type === "turn.completed" ||
    event.type === "turn.aborted" ||
    event.type === "turn.failed";
  if (terminal) {
    const completedItemId = event.type === "item.completed" ? event.itemId : undefined;
    for (const [key, buffer] of buffers) {
      if (!key.startsWith(`${thread.id}:`)) continue;
      const itemId = key.slice(thread.id.length + 1);
      if (event.type === "item.completed" && completedItemId !== itemId) continue;
      if (buffer.text.length > 0) yield* appendActivity(ctx, itemId, buffer, buffer.streamKind);
      buffers.delete(key);
    }
  }
};
log("preload loaded");
