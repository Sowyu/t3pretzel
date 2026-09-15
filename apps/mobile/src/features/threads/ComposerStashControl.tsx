import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "@t3tools/contracts";

import { ComposerToolbarButton } from "../../components/ComposerToolbar";
import { selectionHaptic } from "../../lib/haptics";
import { usePromptStash, type PromptStashEntry } from "../../state/prompt-stash";
import {
  deletePromptStashEntry,
  restorePromptStashEntry,
  stashComposerDraft,
} from "../../state/prompt-stash-actions";
import { PromptStashSheet } from "./PromptStashSheet";

const STASH_ACKNOWLEDGEMENT_MS = 1400;

/**
 * The bookmark pill and its list, shared by every composer. Tap stashes the
 * draft; with an empty composer it restores the only entry or opens the list.
 * Long-press always opens the list.
 */
export function ComposerStashControl(props: {
  readonly draftKey: string;
  readonly hasContent: boolean;
  readonly disabled?: boolean;
}) {
  const { draftKey, hasContent } = props;
  const stashEntries = usePromptStash();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // One quiet acknowledgement per stash: the pill says "Stashed", then goes
  // back to the count. No repeating animation.
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledgementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stashInFlightRef = useRef(false);
  useEffect(
    () => () => {
      if (acknowledgementTimeoutRef.current !== null) {
        clearTimeout(acknowledgementTimeoutRef.current);
      }
    },
    [],
  );

  const restoreEntry = useCallback(
    async (entry: PromptStashEntry) => {
      setIsSheetOpen(false);
      try {
        const { skippedAttachmentCount } = await restorePromptStashEntry(draftKey, entry.id);
        if (skippedAttachmentCount > 0) {
          Alert.alert(
            "Some attachments were not restored",
            `A message can hold at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} attachments. Remove one and restore again.`,
          );
        }
      } catch {
        Alert.alert(
          "Could not restore this prompt",
          "The stash could not be saved, so the prompt was left where it is. Try again.",
        );
      }
    },
    [draftKey],
  );

  const handlePress = useCallback(() => {
    // An empty composer means the button restores instead: one entry goes
    // straight back, anything else opens the list to choose from.
    if (!hasContent) {
      const onlyEntry = stashEntries.length === 1 ? stashEntries[0] : undefined;
      if (onlyEntry) {
        void restoreEntry(onlyEntry);
        return;
      }
      setIsSheetOpen((open) => !open);
      return;
    }
    // A second tap while the first write is in flight would stash the same
    // draft twice: it is not cleared until the write lands.
    if (stashInFlightRef.current) return;
    stashInFlightRef.current = true;
    void selectionHaptic();
    void stashComposerDraft(draftKey).then(
      () => {
        stashInFlightRef.current = false;
        setAcknowledged(true);
        if (acknowledgementTimeoutRef.current !== null) {
          clearTimeout(acknowledgementTimeoutRef.current);
        }
        acknowledgementTimeoutRef.current = setTimeout(() => {
          acknowledgementTimeoutRef.current = null;
          setAcknowledged(false);
        }, STASH_ACKNOWLEDGEMENT_MS);
      },
      () => {
        stashInFlightRef.current = false;
        Alert.alert(
          "Could not stash this prompt",
          "Saving it failed, so the composer was left as it is. Free up storage and try again.",
        );
      },
    );
  }, [draftKey, hasContent, restoreEntry, stashEntries]);

  const deleteEntry = useCallback(
    (entry: PromptStashEntry) => {
      if (stashEntries.length <= 1) setIsSheetOpen(false);
      void deletePromptStashEntry(entry.id).catch(() => {
        Alert.alert(
          "Could not delete this stashed prompt",
          "Saving the change failed, so it is still in the stash.",
        );
      });
    },
    [stashEntries.length],
  );

  return (
    <>
      <ComposerToolbarButton
        accessibilityLabel={
          stashEntries.length > 0
            ? `Prompt stash, ${stashEntries.length} saved`
            : "Stash this prompt"
        }
        active={isSheetOpen}
        disabled={props.disabled}
        icon={stashEntries.length > 0 ? "bookmark.fill" : "bookmark"}
        label={
          acknowledged
            ? "Stashed"
            : stashEntries.length > 0
              ? String(stashEntries.length)
              : undefined
        }
        onPress={handlePress}
        onLongPress={() => setIsSheetOpen(true)}
        showChevron={false}
      />
      {isSheetOpen ? (
        <PromptStashSheet
          entries={stashEntries}
          onRestore={(entry) => void restoreEntry(entry)}
          onDelete={deleteEntry}
          onClose={() => setIsSheetOpen(false)}
        />
      ) : null}
    </>
  );
}
