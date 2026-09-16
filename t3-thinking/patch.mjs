#!/usr/bin/env node
import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

// The revision is part of the marker: a binary carrying an older patch fails
// --check, and the service hook restores the pristine build and re-patches.
const PATCH_REVISION = 2;
const marker = `/* t3-thinking v${PATCH_REVISION} */`;
const anyMarker = /\/\* t3-thinking(?: v\d+)? \*\//g;
const file = process.argv[2];
const checkOnly = process.argv[3] === "--check";

if (!file || (process.argv.length > 4)) {
  console.error("usage: patch.mjs <node_modules/t3/dist/bin.mjs> [--check]");
  process.exit(2);
}

// A compiled t3 (0.0.41+) embeds the same readable bundle inside a native
// executable whose module table stores byte offsets, so every edit must keep
// the byte length: the file is handled as latin1 so one char is one byte,
// the filter swap is same-length, and the reasoning branch takes the space
// freed by stripping indentation from the code that follows it.
const binaryMode = !file.endsWith(".mjs");
const source = await readFile(file, binaryMode ? "latin1" : "utf8");
if (source.includes(marker)) {
  const count = source.split(marker).length - 1;
  const expected = binaryMode ? 1 : 3;
  if (count !== expected) fail(`marker count (expected ${expected}, found ${count})`);
  if (!binaryMode) checkSyntax(file);
  process.exit(0);
}
if (anyMarker.test(source)) fail(`patched with an older t3-thinking revision; restore the pristine build and patch again (exit 3)`, 3);

const event = String.raw`([A-Za-z_$][\w$]*)`;
const filter = new RegExp(
  // Accepts both `) return;` and `) { return; }`: the builds differ.
  String.raw`\b${event}\.type\s*===\s*"content\.delta"\s*&&\s*\1\.payload\.streamKind\s*!==\s*"assistant_text"\s*\)\s*\{?\s*return\s*;?\s*\}?`,
  "g",
);
const filterMatches = [...source.matchAll(filter)];
one("early content filter", filterMatches);
const filterText = filterMatches[0][0];
const filterVar = filterMatches[0][1];
const replacement = filterText.replace(
  /\s*\)\s*\{?\s*return\s*;?\s*\}?$/,
  ` && ${filterVar}.payload.streamKind !== "reasoning_text" && ${filterVar}.payload.streamKind !== "reasoning_summary_text") return;`,
);

const assistantDeclaration = String.raw`\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*${event}\.type\s*===\s*"content\.delta"\s*&&\s*\2\.payload\.streamKind\s*===\s*"assistant_text"\s*\?\s*\2\.payload\.delta\s*:\s*void\s*0\s*;`;
const declarationMatches = [...source.matchAll(new RegExp(assistantDeclaration, "g"))];
one("assistant delta declaration", declarationMatches);
const declaration = declarationMatches[0];
const declarationEnd = declaration.index + declaration[0].length;
const assistantDispatch = String.raw`orchestrationEngine\.dispatch\s*\(\s*\{[\s\S]*?type\s*:\s*"thread\.message\.assistant\.delta"[\s\S]*?\}\s*\)`;
const dispatchMatches = [...source.matchAll(new RegExp(assistantDispatch, "g"))].filter((match) => match.index >= declarationEnd);
one("assistant delta dispatch", dispatchMatches);
const dispatch = dispatchMatches[0];
const dispatchEnd = dispatch.index + dispatch[0].length;
// The reasoning branch goes after the whole `if (assistantDelta && ...) { ... }`
// statement, not after the inner branch that holds the dispatch: inside that
// block it would only run when assistant text arrived, never for reasoning.
const assistantVar = declaration[1];
const blockOpen = new RegExp(String.raw`\bif\s*\(\s*${assistantVar.replace(/\$/g, "\\$")}\s*&&`, "g");
blockOpen.lastIndex = declarationEnd;
const blockMatch = blockOpen.exec(source);
if (!blockMatch || blockMatch.index > dispatch.index) fail("assistant delta block: if statement not found");
const blockStart = blockMatch.index;
const blockEnd = closeStatementBlock(source, blockStart, dispatchEnd);
if (blockEnd < dispatchEnd) fail("assistant delta block: dispatch is outside the block");

const activityAnchor = [...source.matchAll(/orchestrationEngine\.dispatch\s*\(\s*\{\s*type\s*:\s*"thread\.activity\.append"/g)];
if (activityAnchor.length === 0) fail("thread activity append: no dispatch found");

// The assistant block derives its turn id with a helper; the same helper
// turns event.turnId into the branded id the activity needs.
const turnIdHelper = /\bconst\s+turnId\s*=\s*([A-Za-z_$][\w$]*)\(\s*event\.turnId\s*\)/.exec(
  source.slice(blockStart, blockEnd),
);
if (!turnIdHelper) fail("assistant delta block: turn id helper not found");
const toTurnIdName = turnIdHelper[1];

const injectedState = `${marker}\nconst t3ThinkingBuffersModule = new Map();\n`;
const injectedBranch = `${marker}
const t3ThinkingBuffers = ${binaryMode ? "(globalThis.__t3ThinkingBuffers ??= new Map())" : "t3ThinkingBuffersModule"};
const t3ThinkingPayload = event.type === "content.delta" ? event.payload : void 0;
const t3ThinkingIsReasoning = t3ThinkingPayload && (t3ThinkingPayload.streamKind === "reasoning_text" || t3ThinkingPayload.streamKind === "reasoning_summary_text");
const t3ThinkingTurnId = ${toTurnIdName}(event.turnId);
const t3ThinkingItemId = event.itemId ?? ("turn:" + String(event.turnId ?? "none"));
const t3ThinkingKey = t3ThinkingIsReasoning ? thread.id + ":" + t3ThinkingItemId : void 0;
if (t3ThinkingKey !== void 0) {
  let t3ThinkingBuffer = t3ThinkingBuffers.get(t3ThinkingKey);
  if (!t3ThinkingBuffer) {
    t3ThinkingBuffer = { text: "", streamKind: t3ThinkingPayload.streamKind, seq: 0, lastFlushAt: Date.now() };
    t3ThinkingBuffers.set(t3ThinkingKey, t3ThinkingBuffer);
  }
  t3ThinkingBuffer.streamKind = t3ThinkingPayload.streamKind;
  t3ThinkingBuffer.text += String(t3ThinkingPayload.delta ?? "");
  const t3ThinkingNow = Date.now();
  if (t3ThinkingBuffer.text.length >= 400 || t3ThinkingNow - t3ThinkingBuffer.lastFlushAt >= 500) {
    yield* orchestrationEngine.dispatch({ type: "thread.activity.append", commandId: yield* providerCommandId(event, "reasoning.text"), threadId: thread.id, activity: { id: EventId.make(event.eventId + ":reasoning.text:" + t3ThinkingBuffer.seq), createdAt: now, tone: "info", kind: "reasoning.text", summary: t3ThinkingBuffer.text, payload: { itemId: t3ThinkingItemId, streamKind: t3ThinkingPayload.streamKind, seq: t3ThinkingBuffer.seq }, ...(t3ThinkingTurnId ? { turnId: t3ThinkingTurnId } : {}) }, createdAt: now });
    t3ThinkingBuffer.text = "";
    t3ThinkingBuffer.seq += 1;
    t3ThinkingBuffer.lastFlushAt = t3ThinkingNow;
  }
}
if (event.type === "item.completed" || event.type === "turn.completed" || event.type === "turn.aborted" || event.type === "turn.failed") {
  const t3ThinkingCompletedItemId = event.type === "item.completed" ? event.itemId : void 0;
  for (const [t3ThinkingKey, t3ThinkingBuffer] of t3ThinkingBuffers) {
    if (!t3ThinkingKey.startsWith(thread.id + ":") || t3ThinkingBuffer.text.length === 0) continue;
    const t3ThinkingItemId = t3ThinkingKey.slice(thread.id.length + 1);
    if (event.type === "item.completed" && t3ThinkingCompletedItemId !== t3ThinkingItemId) continue;
    yield* orchestrationEngine.dispatch({ type: "thread.activity.append", commandId: yield* providerCommandId(event, "reasoning.text"), threadId: thread.id, activity: { id: EventId.make(event.eventId + ":reasoning.text:" + t3ThinkingBuffer.seq), createdAt: now, tone: "info", kind: "reasoning.text", summary: t3ThinkingBuffer.text, payload: { itemId: t3ThinkingItemId, streamKind: t3ThinkingBuffer.streamKind, seq: t3ThinkingBuffer.seq }, ...(t3ThinkingTurnId ? { turnId: t3ThinkingTurnId } : {}) }, createdAt: now });
    t3ThinkingBuffers.delete(t3ThinkingKey);
  }
}
`;

let patched;
if (binaryMode) {
  patched = patchInPlace(source);
} else {
  patched = source.slice(0, blockEnd) + "\n" + injectedBranch + source.slice(blockEnd);
  patched = patched.replace(filter, `${marker} ${replacement}`);
  patched = patched.slice(0, patched.indexOf("\n")) + "\n" + injectedState + patched.slice(patched.indexOf("\n") + 1);
}
const expectedMarkers = binaryMode ? 1 : 3;
if ((patched.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length !== expectedMarkers) fail("internal marker count");
if (checkOnly) process.exit(0);

const temp = join(dirname(file), `.${file.split("/").pop()}.${randomUUID()}${binaryMode ? "" : ".mjs"}`);
await writeFile(temp, patched, binaryMode ? "latin1" : "utf8");
if (binaryMode) {
  if (patched.length !== source.length) { await rm(temp, { force: true }); fail("binary patch changed the byte length"); }
  await chmod(temp, (await stat(file)).mode);
} else {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  if (syntax.status !== 0) {
    await rm(temp, { force: true });
    console.error(syntax.stderr || syntax.stdout || "node --check failed");
    process.exit(1);
  }
}
await rename(temp, file);
const written = await readFile(file, binaryMode ? "latin1" : "utf8");
const writtenMarkers = written.split(marker).length - 1;
if (writtenMarkers !== expectedMarkers) fail(`marker count after write (expected ${expectedMarkers}, found ${writtenMarkers})`);
console.error(`patched ${file} (markers: ${writtenMarkers}${binaryMode ? ", in place" : ""})`);

/**
 * Same-length rewrite for a compiled build. The filter swap keeps its width
 * (`!== "assistant_text"` becomes `=== "command_output"`, so only command
 * output still returns early and every text kind flows on; nothing downstream
 * acts on a non-assistant delta except the branch added here). The branch is
 * then written over the window that follows the assistant block, whose
 * indentation is stripped to make room, and the remainder is padded with
 * spaces to the original length.
 */
function patchInPlace(text) {
  const swapped = filterText.replace(/!==(\s*)"assistant_text"/, '===$1"command_output"');
  if (swapped.length !== filterText.length) fail("binary filter swap changed length");
  let out = text.slice(0, filterMatches[0].index) + swapped + text.slice(filterMatches[0].index + filterText.length);

  // Window: from the end of the assistant block to the end of a later line,
  // as far as needed for its indentation to absorb the branch. Indentation is
  // stripped only outside template literals, the one place a newline's
  // leading whitespace is content.
  const branch = `\n${marker}${injectedBranch.slice(marker.length)}`.replace(/\n\s+/g, "\n");
  let windowEnd = blockEnd;
  let stripped = "";
  for (let step = 0; step < 20000; step += 1) {
    const nextNewline = out.indexOf("\n", windowEnd + 1);
    if (nextNewline < 0) break;
    windowEnd = nextNewline;
    stripped = stripIndentation(out.slice(blockEnd, windowEnd));
    if (windowEnd - blockEnd - stripped.length >= branch.length) break;
  }
  const window = out.slice(blockEnd, windowEnd);
  if (window.length - stripped.length < branch.length) {
    fail(`binary patch: freed ${window.length - stripped.length} bytes after the assistant block, branch needs ${branch.length}`);
  }
  const filled = branch + stripped + " ".repeat(window.length - branch.length - stripped.length);
  if (filled.length !== window.length) fail("binary patch: window length mismatch");
  out = out.slice(0, blockEnd) + filled + out.slice(windowEnd);
  if (out.length !== text.length) fail("binary patch: total length mismatch");
  return out;
}

function stripIndentation(text) {
  let out = "";
  let inTemplate = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && inTemplate) { out += text.slice(i, i + 2); i += 2; continue; }
    if (ch === "`") inTemplate = !inTemplate;
    out += ch;
    i += 1;
    if (ch === "\n" && !inTemplate) {
      while (i < text.length && (text[i] === "\t" || text[i] === " ")) i += 1;
    }
  }
  return out;
}

function one(name, matches) {
  if (matches.length !== 1) fail(`${name}: expected exactly one match, found ${matches.length}`);
}

function fail(message, code = 1) {
  console.error(`t3-thinking: ${message}`);
  process.exit(code);
}

function checkSyntax(path) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr || result.stdout || "node --check failed");
}

function closeStatementBlock(text, start, minimumEnd) {
  const open = text.indexOf("{", start);
  if (open < 0) fail("assistant delta block: opening brace not found");
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}" && --depth === 0) return i + 1;
  }
  fail(`assistant delta block: unmatched brace after ${minimumEnd}`);
}
