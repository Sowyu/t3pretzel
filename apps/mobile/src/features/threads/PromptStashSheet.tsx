import { useCallback, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import { AppSheet } from "../../components/AppSheet";
import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import type { ComposerStashMenu } from "../../components/ComposerAttachmentButton";
import { ListSection } from "../../components/ListSection";
import { RowPressable } from "../../components/RowPressable";
import { selectionHaptic } from "../../lib/haptics";
import { relativeTime } from "../../lib/time";
import {
  promptStashEntrySnippet,
  usePromptStash,
  type PromptStashEntry,
} from "../../state/prompt-stash";
import {
  deletePromptStashEntry,
  restorePromptStashEntry,
  stashComposerDraft,
} from "../../state/prompt-stash-actions";

/**
 * The prompt stash for one composer: the entries for its "+" menu and the sheet
 * that lists stashed prompts. Render `sheet` next to the composer.
 */
export function usePromptStashMenu(draftKey: string, hasContent: boolean) {
  const entries = usePromptStash();
  const [open, setOpen] = useState(false);
  // The draft is cleared only once the write lands, so a second tap in that
  // window would stash the same prompt twice.
  const stashing = useRef(false);

  const stash = useCallback(() => {
    if (!hasContent || stashing.current) return;
    stashing.current = true;
    void selectionHaptic();
    stashComposerDraft(draftKey).then(
      () => {
        stashing.current = false;
      },
      () => {
        stashing.current = false;
        Alert.alert(
          "Could not stash this prompt",
          "Saving it failed, so the composer was left as it is. Free up storage and try again.",
        );
      },
    );
  }, [draftKey, hasContent]);

  const restore = useCallback(
    async (entry: PromptStashEntry) => {
      setOpen(false);
      try {
        const { skippedAttachmentCount } = await restorePromptStashEntry(draftKey, entry.id);
        if (skippedAttachmentCount > 0) {
          Alert.alert(
            "Some attachments were not restored",
            "This message already holds as many attachments as it can. Remove one and restore again.",
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

  const menu: ComposerStashMenu = {
    canStash: hasContent,
    count: entries.length,
    onStash: stash,
    onOpen: () => setOpen(true),
  };
  const sheet = open ? (
    <PromptStashSheet entries={entries} onClose={() => setOpen(false)} onRestore={restore} />
  ) : null;
  return { menu, sheet };
}

function PromptStashSheet(props: {
  readonly entries: ReadonlyArray<PromptStashEntry>;
  readonly onClose: () => void;
  readonly onRestore: (entry: PromptStashEntry) => void;
}) {
  return (
    <AppSheet title="Stashed prompts" onClose={props.onClose}>
      <ScrollView contentContainerClassName="gap-2 p-4" keyboardShouldPersistTaps="handled">
        {props.entries.length === 0 ? (
          <Text className="py-8 text-center text-base text-foreground-muted">
            Prompts you stash from the + menu wait here until you bring them back.
          </Text>
        ) : (
          <ListSection footer="Tap a prompt to put it back in the composer.">
            {props.entries.map((entry, index) => (
              <View key={entry.id}>
                {index > 0 ? <View className="ml-4 h-px bg-border-subtle" /> : null}
                <PromptStashRow entry={entry} onRestore={() => props.onRestore(entry)} />
              </View>
            ))}
          </ListSection>
        )}
      </ScrollView>
    </AppSheet>
  );
}

function PromptStashRow(props: {
  readonly entry: PromptStashEntry;
  readonly onRestore: () => void;
}) {
  const { entry } = props;
  const snippet = promptStashEntrySnippet(entry);
  const attachments = entry.attachments.length;
  const meta = [
    relativeTime(entry.createdAt),
    attachments > 0 ? `${attachments} attachment${attachments === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const remove = () => {
    deletePromptStashEntry(entry.id).catch(() => {
      Alert.alert(
        "Could not delete this stashed prompt",
        "Saving the change failed, so it is still in the stash.",
      );
    });
  };
  return (
    <RowPressable
      accessibilityRole="button"
      accessibilityLabel={`Restore ${snippet}, ${meta}`}
      accessibilityActions={[{ name: "delete", label: "Delete" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "delete") remove();
      }}
      onPress={props.onRestore}
      pressHighlight
      className="flex-row items-center gap-3 bg-grouped-card py-3 pl-4 pr-2"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base text-foreground" numberOfLines={2}>
          {snippet}
        </Text>
        <Text className="text-sm text-foreground-muted">{meta}</Text>
      </View>
      <Pressable
        accessibilityLabel="Delete stashed prompt"
        accessibilityRole="button"
        hitSlop={8}
        onPress={remove}
        className="size-10 items-center justify-center rounded-full active:opacity-60"
      >
        <SymbolView
          name="trash"
          size={18}
          tintColorClassName="accent-icon"
          type="monochrome"
          weight="regular"
        />
      </Pressable>
    </RowPressable>
  );
}
