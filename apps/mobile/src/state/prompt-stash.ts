import { useAtomValue } from "@effect/atom-react";
import { ComposerContextRecord, ForwardCompatibleArray } from "@t3tools/contracts";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import * as Schema from "effect/Schema";
import { Atom } from "effect/unstable/reactivity";
import { useEffect } from "react";

import { writeFileAtomically } from "../lib/atomic-file";
import { DraftComposerAttachmentSchema } from "../lib/composer-image-schema";
import type { DraftComposerAttachment } from "../lib/composerImages";
import { SerializedAsyncQueue } from "../lib/serialized-async-queue";
import { uuidv4 } from "../lib/uuid";
import { appAtomRegistry } from "./atom-registry";

const PROMPT_STASH_SCHEMA_VERSION = 1;
const PROMPT_STASH_DIRECTORY = "prompt-stash";
const PROMPT_STASH_FILE = "stash.json";

/** Newest first. Stashing past this evicts the oldest entry. */
export const MAX_PROMPT_STASH_ENTRIES = 20;
const SNIPPET_MAX_CHARS = 90;

// The payloads behind the prompt's context links travel with the entry so a
// restore can resolve every chip. Optional, so entries written by builds
// before this field decode without it.
const PromptStashContextSchema = Schema.Struct({
  version: Schema.Literal(1),
  records: ForwardCompatibleArray(ComposerContextRecord),
});

const PromptStashEntrySchema = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  prompt: Schema.String,
  attachments: Schema.Array(DraftComposerAttachmentSchema),
  context: Schema.optional(PromptStashContextSchema),
});

export type PromptStashEntry = typeof PromptStashEntrySchema.Type;

const PersistedPromptStashSchema = Schema.Struct({
  schemaVersion: Schema.Literal(PROMPT_STASH_SCHEMA_VERSION),
  entries: Schema.Array(PromptStashEntrySchema),
});

const decodePersistedPromptStash = Schema.decodeUnknownSync(PersistedPromptStashSchema);

export const promptStashAtom = Atom.make<ReadonlyArray<PromptStashEntry>>([]).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:prompt-stash"),
);

/** Whether the list above the composer is open. Shared by the tab and the toolbar button. */
export const promptStashListOpenAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:prompt-stash-list-open"),
);

export function setPromptStashListOpen(open: boolean): void {
  appAtomRegistry.set(promptStashListOpenAtom, open);
}

async function getPromptStashFile() {
  const { Directory, File, Paths } = await import("expo-file-system");
  const directory = new Directory(Paths.document, PROMPT_STASH_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  return new File(directory, PROMPT_STASH_FILE);
}

async function readPersistedEntries(): Promise<ReadonlyArray<PromptStashEntry>> {
  const file = await getPromptStashFile();
  if (!file.exists) return [];
  const raw = await file.text();
  try {
    return decodePersistedPromptStash(JSON.parse(raw) as unknown).entries;
  } catch (cause) {
    // A payload this build cannot read stays unreadable however often it is
    // retried, and the stash has to keep working. A read that *failed* is a
    // different case: that error propagates so callers know the owners of the
    // stashed attachment files are still unknown.
    console.warn("[prompt-stash] discarding an unreadable stash file", cause);
    return [];
  }
}

const persistenceQueue = new SerializedAsyncQueue();

/**
 * Writes the queue immediately rather than debounced. Stashing is a deliberate,
 * infrequent action, and the caller clears the composer on the strength of this
 * write landing, which a debounce timer cannot honestly report.
 */
async function persistEntries(entries: ReadonlyArray<PromptStashEntry>): Promise<void> {
  await persistenceQueue.run(async () => {
    const file = await getPromptStashFile();
    await writeFileAtomically(
      file,
      JSON.stringify({ schemaVersion: PROMPT_STASH_SCHEMA_VERSION, entries }),
    );
  });
}

let loadPromise: Promise<void> | null = null;

/** Hydrates the persisted stash once, at startup. A failed load is retried. */
export function ensurePromptStashLoaded(): void {
  if (loadPromise !== null) return;
  const loading = readPersistedEntries().then((persisted) => {
    if (persisted.length === 0) return;
    // Anything stashed while the read was in flight is newer than every
    // entry on disk, so it keeps its place at the head of the queue.
    appAtomRegistry.set(
      promptStashAtom,
      [...appAtomRegistry.get(promptStashAtom), ...persisted].slice(0, MAX_PROMPT_STASH_ENTRIES),
    );
  });
  loadPromise = loading;
  void loading.catch((cause) => {
    if (loadPromise === loading) loadPromise = null;
    console.warn("[prompt-stash] failed to hydrate the stash", cause);
  });
}

/** Waits until the persisted stash has been merged into the in-memory queue. */
export async function waitForPromptStashLoaded(): Promise<void> {
  ensurePromptStashLoaded();
  if (loadPromise !== null) await loadPromise;
}

/**
 * Publishes the queue, then persists it. A rejected write puts the visible
 * queue back: callers clear the composer (or forget a restored entry) only
 * once the write lands, so a stash nobody can reload must not look saved.
 */
async function commitEntries(
  next: ReadonlyArray<PromptStashEntry>,
  previous: ReadonlyArray<PromptStashEntry>,
): Promise<void> {
  appAtomRegistry.set(promptStashAtom, next);
  try {
    await persistEntries(next);
  } catch (cause) {
    if (appAtomRegistry.get(promptStashAtom) === next) {
      appAtomRegistry.set(promptStashAtom, previous);
    }
    throw cause;
  }
}

/**
 * Prepends an entry, evicting the oldest past the cap. Rejects when the write
 * fails, leaving the stash exactly as it was.
 */
export async function addPromptStashEntry(input: {
  readonly prompt: string;
  readonly attachments: ReadonlyArray<DraftComposerAttachment>;
  readonly context?: PromptStashEntry["context"];
}): Promise<{
  readonly entry: PromptStashEntry;
  readonly evicted: ReadonlyArray<PromptStashEntry>;
}> {
  await waitForPromptStashLoaded();
  const entry: PromptStashEntry = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    prompt: input.prompt,
    attachments: input.attachments,
    ...(input.context ? { context: input.context } : {}),
  };
  const previous = appAtomRegistry.get(promptStashAtom);
  const combined = [entry, ...previous];
  await commitEntries(combined.slice(0, MAX_PROMPT_STASH_ENTRIES), previous);
  return { entry, evicted: combined.slice(MAX_PROMPT_STASH_ENTRIES) };
}

/** Removes an entry (restore or delete) and returns it, or null when it is gone. */
export async function takePromptStashEntry(entryId: string): Promise<PromptStashEntry | null> {
  await waitForPromptStashLoaded();
  const previous = appAtomRegistry.get(promptStashAtom);
  const entry = previous.find((candidate) => candidate.id === entryId);
  if (!entry) return null;
  await commitEntries(
    previous.filter((candidate) => candidate !== entry),
    previous,
  );
  return entry;
}

/** One-line description of an entry for the stash list. */
export function promptStashEntrySnippet(entry: PromptStashEntry): string {
  const text = replaceComposerContextReferences(entry.prompt, (reference) => reference.label)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 0) {
    return text.length > SNIPPET_MAX_CHARS ? `${text.slice(0, SNIPPET_MAX_CHARS)}…` : text;
  }
  const count = entry.attachments.length;
  if (count === 0) return "(empty)";
  const images = entry.attachments.filter((attachment) => attachment.type === "image").length;
  const label = images === 0 ? "file" : images === count ? "image" : "attachment";
  return `(${count} ${label}${count === 1 ? "" : "s"})`;
}

export function usePromptStashListOpen(): boolean {
  return useAtomValue(promptStashListOpenAtom);
}

export function usePromptStash(): ReadonlyArray<PromptStashEntry> {
  const entries = useAtomValue(promptStashAtom);
  useEffect(() => {
    ensurePromptStashLoaded();
  }, []);
  return entries;
}

/** Resets module-level state between test runs. */
export function resetPromptStashLoadState(): void {
  loadPromise = null;
  appAtomRegistry.set(promptStashAtom, []);
}
