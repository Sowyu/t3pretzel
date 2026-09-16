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

// Debug: what each turn actually delivers, so a silent path can be found
// without guessing. Logged once per turn at its terminal event.
const turnStats = new Map();
function note(event, thread) {
  if (!debug) return;
  const key = `${thread.id}:${String(event.turnId)}`;
  let stats = turnStats.get(key);
  if (!stats) {
    stats = { deltas: {}, types: {}, thinkingBlocks: 0, rawMethods: {} };
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
  const content = event.raw?.payload?.message?.content;
  if (Array.isArray(content)) {
    const blocks = content.filter((b) => b && b.type === "thinking").length;
    if (blocks > 0) {
      stats.thinkingBlocks += blocks;
      log(`thinking blocks in raw ${String(method)} (${event.type}): ${blocks}`);
    }
  }
  if (event.type === "turn.completed" || event.type === "turn.aborted" || event.type === "turn.failed") {
    log(`turn ${String(event.turnId)} summary: deltas=${JSON.stringify(stats.deltas)} types=${JSON.stringify(stats.types)} raw=${JSON.stringify(stats.rawMethods)} thinkingBlocks=${stats.thinkingBlocks}`);
    turnStats.delete(key);
  }
}

// Complete thinking blocks ride on the raw assistant message that some
// runtime events carry (Claude Code emits the assistant message once its
// blocks are done, before each tool call and before the final text). Each
// block is appended once, keyed by message id and block index.
const seenBlocks = new Set();
function* appendRawThinkingBlocks(ctx) {
  const { event, thread } = ctx;
  const raw = event.raw;
  const message = raw && raw.payload && raw.payload.type === "assistant" ? raw.payload.message : undefined;
  const content = message && Array.isArray(message.content) ? message.content : undefined;
  if (!content) return;
  const messageId = typeof message.id === "string" ? message.id : event.eventId;
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (!block || block.type !== "thinking" || typeof block.thinking !== "string") continue;
    const key = `${thread.id}:${messageId}:${index}`;
    if (seenBlocks.has(key)) continue;
    seenBlocks.add(key);
    log(`raw thinking block ${key} chars=${block.thinking.length} via ${String(raw.method)} (${event.type})`);
    yield* appendActivity(ctx, `${messageId}:${index}`, { text: block.thinking, seq: 0 }, "reasoning_text");
  }
}

// Streamed thinking deltas only ever covered a turn's last block in practice;
// complete blocks are the reliable source. Flip to true to also buffer deltas.
const USE_DELTAS = true;

globalThis.__t3Thinking = function* (event, thread, now, orchestrationEngine, providerCommandId, EventId, toTurnId) {
  note(event, thread);
  const ctx = { event, thread, now, orchestrationEngine, providerCommandId, EventId, turnId: toTurnId(event.turnId) };
  yield* appendRawThinkingBlocks(ctx);
  const payload = USE_DELTAS && event.type === "content.delta" ? event.payload : undefined;
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
    for (const key of seenBlocks) if (key.startsWith(`${thread.id}:`)) seenBlocks.delete(key);
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
