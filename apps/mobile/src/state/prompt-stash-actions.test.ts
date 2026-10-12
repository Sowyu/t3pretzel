import { describe, expect, it } from "@effect/vitest";
import { afterEach, vi } from "vite-plus/test";

const fileSystemMocks = vi.hoisted(() => {
  const files = new Map<string, string>();

  class MockFile {
    readonly name: string;
    readonly parentDirectory = null;

    constructor(_parent: unknown, name: string) {
      this.name = name;
    }

    get exists() {
      return files.has(this.name);
    }

    create() {}

    write(value: string) {
      files.set(this.name, value);
    }

    moveSync(destination: MockFile) {
      const value = files.get(this.name) ?? "";
      files.delete(this.name);
      files.set(destination.name, value);
    }

    async text() {
      return files.get(this.name) ?? "";
    }
  }

  return {
    files,
    Directory: class {
      create() {}

      list() {
        return [];
      }
    },
    File: MockFile,
  };
});

const attachmentCleanupMocks = vi.hoisted(() => ({
  remove: vi.fn(async () => undefined),
  releaseUploads: vi.fn(async () => undefined),
}));

vi.mock("expo-file-system", () => ({
  Directory: fileSystemMocks.Directory,
  File: fileSystemMocks.File,
  Paths: { document: { uri: "file:///documents" } },
}));

vi.mock("../lib/composerImages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/composerImages")>()),
  removePersistedComposerAttachmentFile: attachmentCleanupMocks.remove,
}));

vi.mock("../lib/attachmentUpload", () => ({
  releasePendingAttachmentUploads: attachmentCleanupMocks.releaseUploads,
}));

vi.mock("../features/sharing/incoming-share-storage", () => ({
  loadIncomingShareDrafts: async () => [],
}));

let nextId = 0;
vi.mock("../lib/uuid", () => ({ uuidv4: () => `id-${++nextId}`, randomHex: () => "0000" }));
vi.mock("./assets", () => ({ assetEnvironment: {} }));
vi.mock("./attachments", () => ({ attachmentEnvironment: {} }));
vi.mock("./session", () => ({ environmentSession: {} }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  createEnvironmentRpcCommand: () => Symbol("rpc-command"),
  executeAtomQuery: () => {
    throw new Error("Unexpected network query");
  },
  runAtomCommand: () => {
    throw new Error("Unexpected network command");
  },
  squashAtomCommandFailure: (result: { readonly error: unknown }) => result.error,
}));

import { appAtomRegistry } from "./atom-registry";
import { promptStashAtom, resetPromptStashLoadState } from "./prompt-stash";
import {
  deletePromptStashEntry,
  restorePromptStashEntry,
  stashComposerDraft,
} from "./prompt-stash-actions";
import { threadOutboxManager } from "./thread-outbox";
import {
  composerDraftsAtom,
  composerCloudDraftsAtom,
  getComposerDraftSnapshot,
  releaseUnusedComposerAttachmentFiles,
  resetComposerDraftsLoadState,
} from "./use-composer-drafts";

const DRAFT_KEY = "thread";
const IMAGE = {
  type: "image" as const,
  id: "image-1",
  previewUri: "file:///documents/composer-attachments/shot.png",
  fileUri: "file:///documents/composer-attachments/shot.png",
  name: "shot.png",
  mimeType: "image/png",
  sizeBytes: 12,
};

afterEach(() => {
  resetPromptStashLoadState();
  resetComposerDraftsLoadState();
  fileSystemMocks.files.clear();
  appAtomRegistry.set(composerDraftsAtom, {});
  appAtomRegistry.set(composerCloudDraftsAtom, { accountId: null, signedOut: {} });
  appAtomRegistry.set(threadOutboxManager.queuedMessagesByThreadKeyAtom, {});
  attachmentCleanupMocks.remove.mockClear();
  nextId = 0;
});

describe("prompt stash actions", () => {
  it("clears the composer and keeps the stashed attachment file", async () => {
    appAtomRegistry.set(composerDraftsAtom, {
      [DRAFT_KEY]: { text: "  ship it  ", attachments: [IMAGE] },
    });

    await stashComposerDraft(DRAFT_KEY);

    expect(appAtomRegistry.get(promptStashAtom)).toMatchObject([
      { prompt: "ship it", attachments: [IMAGE] },
    ]);
    expect(getComposerDraftSnapshot(DRAFT_KEY)).toMatchObject({ text: "", attachments: [] });

    // The sweep the clear schedules must spare bytes only the stash points at.
    await releaseUnusedComposerAttachmentFiles([IMAGE]);
    expect(attachmentCleanupMocks.remove).not.toHaveBeenCalled();
  });

  it("releases the file once the entry is deleted", async () => {
    appAtomRegistry.set(composerDraftsAtom, {
      [DRAFT_KEY]: { text: "ship it", attachments: [IMAGE] },
    });
    await stashComposerDraft(DRAFT_KEY);

    const [entry] = appAtomRegistry.get(promptStashAtom);
    await deletePromptStashEntry(entry!.id);
    await releaseUnusedComposerAttachmentFiles([IMAGE]);

    expect(appAtomRegistry.get(promptStashAtom)).toEqual([]);
    expect(attachmentCleanupMocks.remove).toHaveBeenCalledWith(IMAGE.fileUri);
  });

  it("appends the stashed prompt below what the composer already holds", async () => {
    appAtomRegistry.set(composerDraftsAtom, {
      [DRAFT_KEY]: { text: "stashed", attachments: [IMAGE] },
    });
    await stashComposerDraft(DRAFT_KEY);
    appAtomRegistry.set(composerDraftsAtom, {
      [DRAFT_KEY]: { text: "typed  \n", attachments: [] },
    });

    const [entry] = appAtomRegistry.get(promptStashAtom);
    const result = await restorePromptStashEntry(DRAFT_KEY, entry!.id);

    expect(result).toEqual({ restored: true, skippedAttachmentCount: 0 });
    expect(getComposerDraftSnapshot(DRAFT_KEY)).toMatchObject({
      text: "typed\n\nstashed",
      attachments: [IMAGE],
    });
    expect(appAtomRegistry.get(promptStashAtom)).toEqual([]);
  });

  it("replaces a composer holding only whitespace", async () => {
    appAtomRegistry.set(composerDraftsAtom, { [DRAFT_KEY]: { text: "stashed", attachments: [] } });
    await stashComposerDraft(DRAFT_KEY);
    appAtomRegistry.set(composerDraftsAtom, { [DRAFT_KEY]: { text: "   ", attachments: [] } });

    const [entry] = appAtomRegistry.get(promptStashAtom);
    await restorePromptStashEntry(DRAFT_KEY, entry!.id);

    expect(getComposerDraftSnapshot(DRAFT_KEY).text).toBe("stashed");
  });

  it("skips an attachment the composer already holds", async () => {
    appAtomRegistry.set(composerDraftsAtom, {
      [DRAFT_KEY]: { text: "stashed", attachments: [IMAGE] },
    });
    await stashComposerDraft(DRAFT_KEY);
    appAtomRegistry.set(composerDraftsAtom, {
      [DRAFT_KEY]: { text: "", attachments: [{ ...IMAGE, id: "image-2" }] },
    });

    const [entry] = appAtomRegistry.get(promptStashAtom);
    await restorePromptStashEntry(DRAFT_KEY, entry!.id);

    // Same file, different id: the draft keeps the one copy it had.
    expect(getComposerDraftSnapshot(DRAFT_KEY).attachments).toEqual([{ ...IMAGE, id: "image-2" }]);
  });
});
