import { memo } from "react";
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { relativeTime } from "../../lib/time";
import { promptStashEntrySnippet, type PromptStashEntry } from "../../state/prompt-stash";

const StashRow = memo(function StashRow(props: {
  readonly entry: PromptStashEntry;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
}) {
  const snippet = promptStashEntrySnippet(props.entry);
  return (
    <View className="flex-row items-center border-b border-border-subtle">
      <Pressable
        accessibilityLabel={`Restore stashed prompt: ${snippet}`}
        accessibilityRole="button"
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3.5 pl-4 active:opacity-60"
        onPress={props.onRestore}
      >
        <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={1}>
          {snippet}
        </Text>
        <Text className="shrink-0 text-xs text-foreground-muted">
          {relativeTime(props.entry.createdAt)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Delete stashed prompt"
        accessibilityRole="button"
        className="px-4 py-4 active:opacity-60"
        hitSlop={6}
        onPress={props.onDelete}
      >
        <SymbolView
          name="trash"
          size={16}
          tintColorClassName="accent-icon-muted"
          type="monochrome"
        />
      </Pressable>
    </View>
  );
});

/** Touch equivalent of the desktop stash menu: tap a row to restore it, trash to forget it. */
export const PromptStashSheet = memo(function PromptStashSheet(props: {
  readonly entries: ReadonlyArray<PromptStashEntry>;
  readonly onRestore: (entry: PromptStashEntry) => void;
  readonly onDelete: (entry: PromptStashEntry) => void;
  readonly onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  return (
    <Modal
      animationType="slide"
      presentationStyle={Platform.OS === "android" ? "overFullScreen" : "pageSheet"}
      transparent={Platform.OS === "android"}
      onRequestClose={props.onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: Platform.OS === "android" ? "#00000066" : undefined,
        }}
      >
        {Platform.OS === "android" ? (
          <Pressable
            accessibilityLabel="Dismiss stash"
            accessibilityRole="button"
            onPress={props.onClose}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : null}
        <View
          className="overflow-hidden rounded-t-3xl bg-sheet-solid"
          style={
            Platform.OS === "android"
              ? { maxHeight: Math.min(windowHeight * 0.6, windowHeight - insets.top - 24) }
              : { flex: 1 }
          }
        >
          <View className="flex-row items-center gap-3 border-b border-border px-4 pb-2 pt-4">
            <SymbolView
              name="bookmark"
              size={18}
              tintColorClassName="accent-icon"
              type="monochrome"
            />
            <Text className="min-w-0 flex-1 text-base font-t3-semibold text-foreground">
              Stash{props.entries.length > 0 ? ` (${props.entries.length})` : ""}
            </Text>
            <Pressable
              accessibilityLabel="Close stash"
              accessibilityRole="button"
              className="p-3 active:opacity-60"
              onPress={props.onClose}
            >
              <Text className="text-foreground">Done</Text>
            </Pressable>
          </View>
          {props.entries.length === 0 ? (
            <View className="px-4 py-6" style={{ paddingBottom: Math.max(24, insets.bottom) }}>
              <Text className="text-sm text-foreground-muted">
                Nothing stashed yet. Write a prompt, then tap the bookmark to set it aside.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom) }}
              keyboardShouldPersistTaps="always"
            >
              {props.entries.map((entry) => (
                <StashRow
                  key={entry.id}
                  entry={entry}
                  onRestore={() => props.onRestore(entry)}
                  onDelete={() => props.onDelete(entry)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
});
