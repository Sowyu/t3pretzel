import { describe, expect, it } from "@effect/vitest";
import { ComposerContextId } from "@t3tools/contracts";
import { afterEach, vi } from "vite-plus/test";

const stashFileMocks = vi.hoisted(() => {
  let document: string | null = null;
  let writeError: Error | null = null;
  const writes: string[] = [];

  return {
    setDocument(value: unknown) {
      document = value === null ? null : JSON.stringify(value);
    },
    setWriteError(error: Error | null) {
      writeError = error;
    },
    getWrites(): ReadonlyArray<string> {
      return writes;
    },
    reset() {
      document = null;
      writeError = null;
      writes.length = 0;
    },
    Directory: class {
      create() {}
    },
    File: class {
      parentDirectory = null;

      get exists() {
        return document !== null;
      }

      create() {}

      moveSync() {}

      async text() {
        return document ?? "";
      }

      write(value: string) {
        if (writeError) throw writeError;
        document = value;
        writes.push(value);
      }
    },
  };
});

vi.mock("expo-file-system", () => ({
  Directory: stashFileMocks.Directory,
  File: stashFileMocks.File,
  Paths: { document: { uri: "file:///documents" } },
}));

let nextId = 0;
vi.mock("../lib/uuid", () => ({ uuidv4: () => `entry-${++nextId}` }));

import { appAtomRegistry } from "./atom-registry";
import {
  addPromptStashEntry,
  MAX_PROMPT_STASH_ENTRIES,
  promptStashAtom,
  promptStashEntrySnippet,
  resetPromptStashLoadState,
  takePromptStashEntry,
  waitForPromptStashLoaded,
  type PromptStashEntry,
} from "./prompt-stash";

const IMAGE = {
  type: "image" as const,
  id: "image-1",
  previewUri: "file:///documents/composer-attachments/shot.png",
  fileUri: "file:///documents/composer-attachments/shot.png",
  name: "shot.png",
  mimeType: "image/png",
  sizeBytes: 12,
};

const SKILL_RECORD = {
  version: 1 as const,
  contextId: ComposerContextId.make("skill-1"),
  kind: "skill" as const,
  label: "Review",
  name: "review",
};

function entries(): ReadonlyArray<PromptStashEntry> {
  return appAtomRegistry.get(promptStashAtom);
}

function lastWrite(): { schemaVersion: number; entries: ReadonlyArray<PromptStashEntry> } {
  const writes = stashFileMocks.getWrites();
  return JSON.parse(writes[writes.length - 1]!) as {
    schemaVersion: number;
    entries: ReadonlyArray<PromptStashEntry>;
  };
}

afterEach(() => {
  resetPromptStashLoadState();
  stashFileMocks.reset();
  nextId = 0;
});

describe("prompt stash", () => {
  it("stashes newest first and persists on every change", async () => {
    await addPromptStashEntry({ prompt: "first", attachments: [] });
    await addPromptStashEntry({ prompt: "second", attachments: [IMAGE] });

    expect(entries().map((entry) => entry.prompt)).toEqual(["second", "first"]);
    expect(stashFileMocks.getWrites()).toHaveLength(2);
    expect(lastWrite().schemaVersion).toBe(1);
    expect(lastWrite().entries.map((entry) => entry.prompt)).toEqual(["second", "first"]);
    expect(lastWrite().entries[0]?.attachments).toEqual([IMAGE]);
  });

  it("evicts the oldest entry past the cap", async () => {
    for (let index = 0; index < MAX_PROMPT_STASH_ENTRIES; index += 1) {
      await addPromptStashEntry({ prompt: `prompt ${index}`, attachments: [] });
    }
    const { evicted } = await addPromptStashEntry({ prompt: "newest", attachments: [] });

    expect(evicted.map((entry) => entry.prompt)).toEqual(["prompt 0"]);
    expect(entries()).toHaveLength(MAX_PROMPT_STASH_ENTRIES);
    expect(entries()[0]?.prompt).toBe("newest");
    expect(entries()[MAX_PROMPT_STASH_ENTRIES - 1]?.prompt).toBe("prompt 1");
    expect(lastWrite().entries).toHaveLength(MAX_PROMPT_STASH_ENTRIES);
  });

  it("round trips prompts, attachments and context through the stash file", async () => {
    await addPromptStashEntry({
      prompt: `Check [Review](t3-context://v1/skill/${SKILL_RECORD.contextId})`,
      attachments: [IMAGE],
      context: { version: 1, records: [SKILL_RECORD] },
    });
    const written = entries();

    // A fresh app start reads the same file back.
    resetPromptStashLoadState();
    await waitForPromptStashLoaded();

    expect(entries()).toEqual(written);
    expect(entries()[0]?.context?.records).toEqual([SKILL_RECORD]);
    expect(entries()[0]?.attachments).toEqual([IMAGE]);
  });

  it("keeps entries stashed before hydration ahead of the persisted ones", async () => {
    stashFileMocks.setDocument({
      schemaVersion: 1,
      entries: [
        { id: "old", createdAt: "2026-01-01T00:00:00.000Z", prompt: "old", attachments: [] },
      ],
    });

    await addPromptStashEntry({ prompt: "typed now", attachments: [] });

    expect(entries().map((entry) => entry.prompt)).toEqual(["typed now", "old"]);
  });

  it("leaves the queue alone when the write fails", async () => {
    await addPromptStashEntry({ prompt: "kept", attachments: [] });
    const before = entries();
    stashFileMocks.setWriteError(new Error("no space"));

    await expect(addPromptStashEntry({ prompt: "lost", attachments: [] })).rejects.toThrow(
      "no space",
    );
    expect(entries()).toBe(before);
  });

  it("takes an entry out and persists the removal", async () => {
    const first = await addPromptStashEntry({ prompt: "first", attachments: [] });
    await addPromptStashEntry({ prompt: "second", attachments: [] });

    const taken = await takePromptStashEntry(first.entry.id);

    expect(taken?.prompt).toBe("first");
    expect(entries().map((entry) => entry.prompt)).toEqual(["second"]);
    expect(lastWrite().entries.map((entry) => entry.prompt)).toEqual(["second"]);
    expect(await takePromptStashEntry(first.entry.id)).toBeNull();
  });

  it("starts empty when the stash file cannot be decoded", async () => {
    stashFileMocks.setDocument({ schemaVersion: 99, entries: "nope" });

    await waitForPromptStashLoaded();

    expect(entries()).toEqual([]);
  });

  it("describes an entry in one line", () => {
    const entry = (overrides: Partial<PromptStashEntry>): PromptStashEntry => ({
      id: "entry",
      createdAt: "2026-01-01T00:00:00.000Z",
      prompt: "",
      attachments: [],
      ...overrides,
    });

    expect(promptStashEntrySnippet(entry({ prompt: "  fix   the\n\ntests  " }))).toBe(
      "fix the tests",
    );
    expect(
      promptStashEntrySnippet(
        entry({ prompt: `Use [Review](t3-context://v1/skill/${SKILL_RECORD.contextId}) now` }),
      ),
    ).toBe("Use Review now");
    expect(promptStashEntrySnippet(entry({ prompt: "a".repeat(120) }))).toBe(`${"a".repeat(90)}…`);
    expect(promptStashEntrySnippet(entry({ attachments: [IMAGE] }))).toBe("(1 image)");
    expect(
      promptStashEntrySnippet(entry({ attachments: [IMAGE, { ...IMAGE, id: "image-2" }] })),
    ).toBe("(2 images)");
    expect(promptStashEntrySnippet(entry({}))).toBe("(empty)");
  });
});
