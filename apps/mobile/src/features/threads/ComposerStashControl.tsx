import { useCallback, useRef } from "react";
import { Alert, Image, Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "@t3tools/contracts";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { useComposerImagePreviewUri } from "../../components/ComposerAttachmentStrip";
import { GlassSurface } from "../../components/GlassSurface";
import { selectionHaptic } from "../../lib/haptics";
import { relativeTime } from "../../lib/time";
import type { DraftComposerImageAttachment } from "../../lib/composerImages";
import {
  promptStashEntrySnippet,
  setPromptStashListOpen,
  usePromptStash,
  usePromptStashListOpen,
  type PromptStashEntry,
} from "../../state/prompt-stash";
import {
  deletePromptStashEntry,
  restorePromptStashEntry,
  stashComposerDraft,
} from "../../state/prompt-stash-actions";

const THUMBNAIL_SIZE = 28;
const MAX_THUMBNAILS = 3;

/**
 * Toolbar bookmark: tap stashes the draft. With nothing to stash it opens the
 * list instead. The count sits beside the icon; no pill, no border, like the
 * attachment button next to it.
 */
export function ComposerStashButton(props: {
  readonly draftKey: string;
  readonly hasContent: boolean;
  readonly disabled?: boolean;
}) {
  const { draftKey, hasContent } = props;
  const entries = usePromptStash();
  const listOpen = usePromptStashListOpen();
  const stashInFlightRef = useRef(false);

  const handlePress = useCallback(() => {
    if (!hasContent) {
      setPromptStashListOpen(!listOpen);
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
      },
      () => {
        stashInFlightRef.current = false;
        Alert.alert(
          "Could not stash this prompt",
          "Saving it failed, so the composer was left as it is. Free up storage and try again.",
        );
      },
    );
  }, [draftKey, hasContent, listOpen]);

  return (
    <Pressable
      accessibilityLabel={
        entries.length > 0 ? `Prompt stash, ${entries.length} saved` : "Stash this prompt"
      }
      accessibilityRole="button"
      className="h-[44px] shrink-0 flex-row items-center justify-center gap-1 rounded-full px-2 active:opacity-70 disabled:opacity-50"
      disabled={props.disabled}
      onPress={handlePress}
      onLongPress={() => setPromptStashListOpen(true)}
    >
      <SymbolView
        name={entries.length > 0 ? "bookmark.fill" : "bookmark"}
        size={20}
        tintColorClassName={listOpen ? "accent-icon" : "accent-icon-muted"}
        type="monochrome"
      />
      {entries.length > 0 ? (
        <Text className="text-sm font-t3-medium text-foreground-secondary">{entries.length}</Text>
      ) : null}
    </Pressable>
  );
}

function StashThumbnail(props: { readonly attachment: DraftComposerImageAttachment }) {
  const uri = useComposerImagePreviewUri(props.attachment);
  if (uri === null) return null;
  return (
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri }}
      style={{
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: 6,
        marginLeft: -6,
      }}
      className="border border-border"
    />
  );
}

function StashRow(props: {
  readonly entry: PromptStashEntry;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
}) {
  const snippet = promptStashEntrySnippet(props.entry);
  const images = props.entry.attachments.filter(
    (attachment): attachment is DraftComposerImageAttachment => attachment.type === "image",
  );
  const fileCount = props.entry.attachments.length - images.length;
  return (
    <View className="flex-row items-center border-t border-border-subtle">
      <Pressable
        accessibilityLabel={`Restore stashed prompt: ${snippet}`}
        accessibilityRole="button"
        className="min-w-0 flex-1 flex-row items-center gap-2.5 py-2.5 pl-4 active:opacity-60"
        onPress={props.onRestore}
      >
        {images.length > 0 ? (
          <View className="shrink-0 flex-row items-center pl-1.5">
            {images.slice(0, MAX_THUMBNAILS).map((attachment) => (
              <StashThumbnail key={attachment.id} attachment={attachment} />
            ))}
          </View>
        ) : null}
        <Text className="min-w-0 flex-1 text-[15px] text-foreground" numberOfLines={1}>
          {snippet}
        </Text>
        {fileCount > 0 ? (
          <View className="shrink-0 flex-row items-center gap-0.5">
            <SymbolView
              name="doc.text"
              size={12}
              tintColorClassName="accent-icon-muted"
              type="monochrome"
            />
            <Text className="text-xs text-foreground-muted">{fileCount}</Text>
          </View>
        ) : null}
        <Text className="shrink-0 text-xs text-foreground-muted">
          {relativeTime(props.entry.createdAt)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Delete stashed prompt"
        accessibilityRole="button"
        className="px-3.5 py-3 active:opacity-60"
        hitSlop={6}
        onPress={props.onDelete}
      >
        <SymbolView
          name="xmark"
          size={14}
          tintColorClassName="accent-icon-muted"
          type="monochrome"
        />
      </Pressable>
    </View>
  );
}

/**
 * The desktop composer's stash tab, attached to the top of the composer: a
 * "Stash · N" row that opens the list of stashed prompts in place. Tap a row to
 * restore it, the cross to forget it.
 */
export function ComposerStashPanel(props: { readonly draftKey: string }) {
  const { draftKey } = props;
  const entries = usePromptStash();
  const listOpen = usePromptStashListOpen();
  const { height: windowHeight } = useWindowDimensions();

  const restoreEntry = useCallback(
    async (entry: PromptStashEntry) => {
      setPromptStashListOpen(false);
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

  const deleteEntry = useCallback((entry: PromptStashEntry) => {
    void deletePromptStashEntry(entry.id).catch(() => {
      Alert.alert(
        "Could not delete this stashed prompt",
        "Saving the change failed, so it is still in the stash.",
      );
    });
  }, []);

  if (entries.length === 0 && !listOpen) return null;

  return (
    <View className="items-end px-2">
      {/* Same material as the composer and its popover: native glass on iOS 26,
          a backdrop blur on Android 12 and later, a solid card below that. */}
      <GlassSurface
        chrome="none"
        fallbackClassName="border border-b-0 border-border"
        glassEffectStyle="clear"
        tintColorClassName="accent-glass-surface"
        style={{
          borderRadius: 18,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          marginBottom: -8,
          paddingBottom: 8,
          minWidth: listOpen ? "100%" : undefined,
        }}
      >
        <Pressable
          accessibilityLabel={listOpen ? "Close stash" : `Open stash, ${entries.length} saved`}
          accessibilityRole="button"
          accessibilityState={{ expanded: listOpen }}
          className="flex-row items-center gap-2 px-3.5 py-2 active:opacity-70"
          onPress={() => setPromptStashListOpen(!listOpen)}
        >
          <SymbolView
            name="bookmark"
            size={14}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
          <Text className="text-sm text-foreground-secondary">Stash</Text>
          <Text className="text-sm font-t3-medium text-foreground">{entries.length}</Text>
          {listOpen ? <View className="flex-1" /> : null}
          <SymbolView
            name={listOpen ? "chevron.down" : "chevron.up"}
            size={12}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
        </Pressable>
        {listOpen ? (
          entries.length === 0 ? (
            <Text className="border-t border-border-subtle px-4 py-3 text-sm text-foreground-muted">
              Nothing stashed yet. Write a prompt, then tap the bookmark to set it aside.
            </Text>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="always"
              // A ScrollView grows to fill its parent by default; the list should
              // only be as tall as its rows, up to the cap.
              style={{ flexGrow: 0, maxHeight: Math.round(windowHeight * 0.35) }}
            >
              {entries.map((entry) => (
                <StashRow
                  key={entry.id}
                  entry={entry}
                  onRestore={() => void restoreEntry(entry)}
                  onDelete={() => deleteEntry(entry)}
                />
              ))}
            </ScrollView>
          )
        ) : null}
      </GlassSurface>
    </View>
  );
}
