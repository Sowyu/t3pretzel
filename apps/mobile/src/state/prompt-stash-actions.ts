import { appAtomRegistry } from "./atom-registry";
import {
  addPromptStashEntry,
  promptStashAtom,
  takePromptStashEntry,
  waitForPromptStashLoaded,
} from "./prompt-stash";
import {
  clearComposerDraftContent,
  getComposerDraftSnapshot,
  mergeComposerDraftContent,
  registerComposerAttachmentOwnerSource,
  scheduleUnusedComposerAttachmentCleanup,
  setComposerDraftText,
} from "./use-composer-drafts";

// A stashed attachment still owns its file. Without this the sweep that runs
// when the composer is cleared would delete bytes only the stash points at.
registerComposerAttachmentOwnerSource({
  hydrate: waitForPromptStashLoaded,
  owners: () => appAtomRegistry.get(promptStashAtom),
});

/**
 * Moves the draft's content into the stash. The composer is cleared only once
 * the entry is on disk, so a failed write leaves the prompt where the user can
 * still see it. Returns how many entries fell off the end of the queue.
 */
export async function stashComposerDraft(draftKey: string): Promise<{ readonly evicted: number }> {
  const draft = getComposerDraftSnapshot(draftKey);
  const prompt = draft.text.trim();
  if (prompt.length === 0 && draft.attachments.length === 0) {
    return { evicted: 0 };
  }
  const { evicted } = await addPromptStashEntry({
    prompt,
    attachments: draft.attachments,
    ...(draft.context ? { context: draft.context } : {}),
  });
  clearComposerDraftContent(draftKey);
  // An evicted entry was the last owner of its files.
  scheduleUnusedComposerAttachmentCleanup(evicted.flatMap((entry) => [...entry.attachments]));
  return { evicted: evicted.length };
}

/**
 * Appends a stashed prompt to the draft and drops the entry. An empty composer
 * takes the prompt whole; anything else keeps its own text and gets the stashed
 * prompt two lines below, matching the desktop composer.
 */
export async function restorePromptStashEntry(
  draftKey: string,
  entryId: string,
): Promise<{ readonly restored: boolean; readonly skippedAttachmentCount: number }> {
  const entry = appAtomRegistry.get(promptStashAtom).find((candidate) => candidate.id === entryId);
  if (!entry) return { restored: false, skippedAttachmentCount: 0 };
  const draft = getComposerDraftSnapshot(draftKey);
  const held = new Set(
    draft.attachments.flatMap((attachment) => [
      attachment.id,
      ...(attachment.fileUri === undefined ? [] : [attachment.fileUri]),
    ]),
  );
  const attachments = entry.attachments.filter(
    (attachment) =>
      !held.has(attachment.id) &&
      (attachment.fileUri === undefined || !held.has(attachment.fileUri)),
  );
  // The merge joins with a blank line between the two texts, so the draft's own
  // trailing whitespace goes first. Whitespace alone counts as empty.
  if (entry.prompt.length > 0) {
    const trimmed = draft.text.trim().length === 0 ? "" : draft.text.trimEnd();
    if (trimmed !== draft.text) setComposerDraftText(draftKey, trimmed);
  }
  const { skippedAttachmentCount } = await mergeComposerDraftContent(draftKey, {
    text: entry.prompt,
    attachments,
    ...(entry.context ? { context: entry.context } : {}),
  });
  // Dropped only once the draft holds the content: a failed merge leaves the
  // entry where the user can try again. Attachments the merge skipped (already
  // held, or over the send cap) have no owner left, so the sweep decides.
  await takePromptStashEntry(entry.id);
  scheduleUnusedComposerAttachmentCleanup([...entry.attachments]);
  return { restored: true, skippedAttachmentCount };
}

/** Forgets an entry and releases the files it was the last owner of. */
export async function deletePromptStashEntry(entryId: string): Promise<void> {
  const entry = await takePromptStashEntry(entryId);
  if (entry) scheduleUnusedComposerAttachmentCleanup([...entry.attachments]);
}
