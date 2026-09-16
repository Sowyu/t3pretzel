"use strict";
// Loaded into the T3 server through NODE_OPTIONS=--require. The patched
// ingestion calls globalThis.__t3Thinking(...) once per provider runtime
// event, after the assistant-text handling; this file holds the logic so the
// binary edit stays a one-line same-length hook and can be iterated without
// re-patching. Harmless in any other process: it only defines a global.

const buffers = new Map();
const debugLevel = Number(process.env.T3_THINKING_DEBUG ?? "0") || 0;
const debug = debugLevel >= 1;
const trace = debugLevel >= 2;
const log = (message) => {
  if (debug) process.stderr.write(`[t3-thinking] ${message}\n`);
};
const say = (message) => process.stderr.write(`[t3-thinking] ${message}\n`);

// Claude Code returns thinking text only when started with
// `--thinking-display summarized` (the other choice, `omitted`, is what the
// harness gets by default: thinking blocks arrive empty). The server spawns
// Claude Code through child_process, so the flag is appended there for every
// stream-json Claude Code process that does not set it or disable thinking.
const childProcess = require("node:child_process");
const originalSpawn = childProcess.spawn;
function isClaudeCodeSpawn(command, args) {
  if (!Array.isArray(args)) return false;
  const name = String(command);
  const looksLikeClaude = /(^|\/)claude(\.exe)?$/.test(name) || name === "claude";
  return looksLikeClaude && args.includes("--output-format") && args.includes("stream-json");
}
childProcess.spawn = function t3ThinkingSpawn(command, args, options) {
  if (isClaudeCodeSpawn(command, args) && !args.includes("--thinking-display")) {
    const thinkingAt = args.indexOf("--thinking");
    const disabled = thinkingAt >= 0 && args[thinkingAt + 1] === "disabled";
    if (!disabled) {
      args = [...args, "--thinking-display", "summarized"];
      say("spawning Claude Code with --thinking-display summarized");
    }
  }
  return originalSpawn.call(this, command, args, options);
};
require("node:module").syncBuiltinESMExports();

// One activity row per flush. A row costs a DB write, a websocket event and a
// feed rebuild on every connected client, so deltas are coalesced: a flush
// goes out once this much text is waiting or this long has passed since the
// last one. The phone fades each row in, so a flush is also the fade unit.
const FLUSH_CHARS = 48;
const FLUSH_MS = 120;

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
      // timelineBypass is the stock clients' "not for the parent chat" flag
      // (subagent-internal rows carry it): the desktop drops the row from its
      // work log instead of drawing every chunk as a generic line, and the
      // phone reads the row by kind regardless.
      payload: { itemId, streamKind, seq: buffer.seq, text: buffer.text, timelineBypass: true },
      ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
    },
    createdAt: now,
  });
  buffer.text = "";
  buffer.seq += 1;
}

// Claude Code reports the start of an automatic context compaction as a
// status message, which the adapter forwards as a session state change; the
// stock server only records the end (a `context-compaction` row with the
// token counts). This row fills the minutes in between. Same kind, so the
// phone renders it as the compaction row until the real one replaces it.
function* appendCompactingActivity(ctx) {
  const { event, thread, now, orchestrationEngine, providerCommandId, EventId } = ctx;
  log(`compacting turn=${String(event.turnId)}`);
  yield* orchestrationEngine.dispatch({
    type: "thread.activity.append",
    commandId: yield* providerCommandId(event, "context-compaction"),
    threadId: thread.id,
    activity: {
      id: EventId.make(`${event.eventId}:context-compaction:compacting`),
      createdAt: now,
      tone: "info",
      kind: "context-compaction",
      summary: "Compacting context",
      payload: { state: "compacting", detail: event.payload?.detail },
      ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
    },
    createdAt: now,
  });
}

// Debug: what each turn actually delivers, so a silent path can be found
// without guessing. Logged once per turn at its terminal event.
const turnStats = new Map();
function note(event, thread) {
  if (!debug) return;
  const key = `${thread.id}:${String(event.turnId)}`;
  let stats = turnStats.get(key);
  if (!stats) {
    stats = { deltas: {}, types: {}, rawMethods: {} };
    turnStats.set(key, stats);
  }
  const method = event.raw?.method;
  // Live lines, so a turn can be read while it runs: each event type and raw
  // method the first time it shows up, and every reasoning delta.
  if (trace && !stats.types[event.type]) log(`turn ${String(event.turnId)} first ${event.type}${typeof method === "string" ? ` via ${method}` : ""} itemId=${String(event.itemId)}`);
  stats.types[event.type] = (stats.types[event.type] ?? 0) + 1;
  if (event.type === "content.delta") {
    const kind = event.payload?.streamKind ?? "?";
    stats.deltas[kind] = (stats.deltas[kind] ?? 0) + 1;
    if (trace && kind !== "assistant_text") log(`turn ${String(event.turnId)} delta ${kind} #${stats.deltas[kind]} itemId=${String(event.itemId)} chars=${String(event.payload?.delta ?? "").length}`);
  }
  if (trace && typeof method === "string" && !stats.rawMethods[method]) log(`turn ${String(event.turnId)} first raw ${method} (${event.type})`);
  if (typeof method === "string") stats.rawMethods[method] = (stats.rawMethods[method] ?? 0) + 1;
  if (event.type === "turn.completed" || event.type === "turn.aborted" || event.type === "turn.failed") {
    log(`turn ${String(event.turnId)} summary: deltas=${JSON.stringify(stats.deltas)} types=${JSON.stringify(stats.types)} raw=${JSON.stringify(stats.rawMethods)}`);
    turnStats.delete(key);
  }
}

// Claude Code's thinking deltas carry no item id, so a turn's thinking is
// keyed per segment: the segment advances whenever something else happens in
// the turn (a tool call, an assistant message, a compaction), which keeps a
// block that came after a tool call ordered after that tool in the feed.
// Codex reasoning items carry their own ids and never touch this.
const segments = new Map();
function turnSegmentKey(thread, event) {
  return `${thread.id}:${String(event.turnId ?? "none")}`;
}
function reasoningItemId(thread, event) {
  if (event.itemId) return event.itemId;
  const segment = segments.get(turnSegmentKey(thread, event)) ?? 0;
  return `turn:${String(event.turnId ?? "none")}:${segment}`;
}
function* flushThread(ctx, filter) {
  const { thread } = ctx;
  for (const [key, buffer] of buffers) {
    if (!key.startsWith(`${thread.id}:`)) continue;
    const itemId = key.slice(thread.id.length + 1);
    if (!filter(itemId)) continue;
    if (buffer.text.length > 0) yield* appendActivity(ctx, itemId, buffer, buffer.streamKind);
    buffers.delete(key);
  }
}
function* advanceSegment(ctx) {
  const { thread, event } = ctx;
  const key = turnSegmentKey(thread, event);
  // Nothing to separate until the turn has produced thinking.
  if (!segments.has(key)) return;
  yield* flushThread(ctx, (itemId) => itemId.startsWith("turn:"));
  segments.set(key, segments.get(key) + 1);
}

function isCompactingStatus(event) {
  return (
    event.type === "session.state.changed" &&
    typeof event.payload?.reason === "string" &&
    event.payload.reason === "status:compacting"
  );
}

globalThis.__t3Thinking = function* (event, thread, now, orchestrationEngine, providerCommandId, EventId, toTurnId) {
  note(event, thread);
  const ctx = { event, thread, now, orchestrationEngine, providerCommandId, EventId, turnId: toTurnId(event.turnId) };
  const payload = event.type === "content.delta" ? event.payload : undefined;
  const isReasoning =
    payload !== undefined &&
    (payload.streamKind === "reasoning_text" || payload.streamKind === "reasoning_summary_text");
  if (isReasoning) {
    if (!event.itemId) {
      const segmentKey = turnSegmentKey(thread, event);
      if (!segments.has(segmentKey)) segments.set(segmentKey, 0);
    }
    const itemId = reasoningItemId(thread, event);
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
    return;
  }
  // Anything else starting inside the turn ends the current thinking block.
  if (event.type === "item.started") {
    yield* advanceSegment(ctx);
  }
  if (isCompactingStatus(event)) {
    yield* advanceSegment(ctx);
    yield* appendCompactingActivity(ctx);
  }
  if (event.type === "thread.state.changed" && event.payload?.state === "compacted") {
    yield* advanceSegment(ctx);
  }
  const terminal =
    event.type === "item.completed" ||
    event.type === "turn.completed" ||
    event.type === "turn.aborted" ||
    event.type === "turn.failed";
  if (terminal) {
    if (event.type === "item.completed") {
      yield* flushThread(ctx, (itemId) => itemId === event.itemId);
    } else {
      yield* flushThread(ctx, () => true);
      segments.delete(turnSegmentKey(thread, event));
    }
  }
};
log("preload loaded");
