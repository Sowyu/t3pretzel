import type { RunId } from "@t3tools/contracts";
import type { QueuedThreadRun } from "@t3tools/client-runtime/state/thread-workflows";
import { memo } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";

import type { AndroidMenuAction } from "../../components/AndroidAnchoredMenu";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ControlPillMenu } from "../../components/ControlPill";
import { GlassControl } from "../../components/GlassControl";
import { cn } from "../../lib/cn";
import { resolveThreadQueueRowControls } from "./threadQueueControlPresentation";
import type { QueuedRunAction, useThreadQueuedRuns } from "./use-thread-queued-runs";

const ROW_ENTERING = FadeIn.duration(160).reduceMotion(ReduceMotion.System);
const ROW_EXITING = FadeOut.duration(120).reduceMotion(ReduceMotion.System);
// About three pills; a longer queue scrolls inside the panel.
const PANEL_MAX_HEIGHT = 156;
const PILL_CLASS = "border border-border bg-card shadow-md shadow-black/10";

/**
 * The messages the server holds behind the running turn, as glass pills
 * stacked above the composer. Tap a pill to edit it in the composer; Steer
 * sends it into the running turn now; the menu moves or removes it. Renders
 * nothing while the queue is empty.
 */
export const ThreadQueueControl = memo(function ThreadQueueControl(props: {
  readonly queue: ReturnType<typeof useThreadQueuedRuns>;
  /** The queued run open in the composer, if any. */
  readonly editingRunId: RunId | null;
  readonly contentMaxWidth?: number;
}) {
  const { queue } = props;
  if (queue.queuedRuns.length === 0) return null;

  return (
    <View
      className="w-full self-center gap-1.5 px-4 pb-2"
      style={{ maxWidth: props.contentMaxWidth }}
    >
      {queue.isHeld ? (
        <Animated.View entering={ROW_ENTERING} exiting={ROW_EXITING} className="self-start">
          <GlassControl radius={18} className={PILL_CLASS}>
            <View className="h-9 flex-row items-center gap-2 pl-3.5 pr-1.5">
              <Text className="text-xs text-foreground-muted">Queue held after restart</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Resume queue"
                disabled={queue.busyRunId !== null}
                onPress={queue.onResume}
                className="h-7 justify-center rounded-full bg-primary px-3 active:opacity-70 disabled:opacity-40"
              >
                <Text className="font-t3-medium text-xs text-primary-foreground">Resume</Text>
              </Pressable>
            </View>
          </GlassControl>
        </Animated.View>
      ) : null}
      <ScrollView
        style={{ flexGrow: 0, maxHeight: PANEL_MAX_HEIGHT }}
        contentContainerClassName="gap-1.5"
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {queue.queuedRuns.map((entry, index) => (
          <QueuedRunPill
            key={entry.run.id}
            entry={entry}
            index={index}
            queuedCount={queue.queuedRuns.length}
            busy={queue.busyRunId !== null}
            canSteer={queue.canSteer}
            canReorder={queue.canReorder}
            isEditing={props.editingRunId === entry.run.id}
            onAction={queue.onAction}
          />
        ))}
      </ScrollView>
    </View>
  );
});

const QueuedRunPill = memo(function QueuedRunPill(props: {
  readonly entry: QueuedThreadRun;
  readonly index: number;
  readonly queuedCount: number;
  readonly busy: boolean;
  readonly canSteer: boolean;
  readonly canReorder: boolean;
  readonly isEditing: boolean;
  readonly onAction: (runId: RunId, action: QueuedRunAction) => void;
}) {
  const { entry, onAction } = props;
  const runId = entry.run.id;
  const controls = resolveThreadQueueRowControls({
    busy: props.busy,
    canPromoteToSteer: props.canSteer,
    canReorder: props.canReorder,
    index: props.index,
    isEditing: props.isEditing,
    queuedCount: props.queuedCount,
    text: entry.text,
  });
  const title =
    controls.displayText.replace(/\s+/gu, " ").trim() ||
    (entry.attachments.length > 0 ? "Attachments" : "Queued message");
  const actions: AndroidMenuAction[] = [
    {
      id: "edit",
      title: "Edit",
      attributes: { disabled: !controls.canEdit },
      image: Platform.OS === "ios" ? "pencil" : "edit",
    },
    ...(props.canReorder && props.queuedCount > 1
      ? [
          { id: "up", title: "Move up", attributes: { disabled: !controls.canMoveUp } },
          { id: "down", title: "Move down", attributes: { disabled: !controls.canMoveDown } },
        ]
      : []),
    {
      id: "remove",
      title: "Remove",
      attributes: { disabled: !controls.canDismiss, destructive: true },
    },
  ];

  return (
    <Animated.View entering={ROW_ENTERING} exiting={ROW_EXITING}>
      <GlassControl radius={20} className={PILL_CLASS}>
        <View className="min-h-10 flex-row items-center gap-1 pl-1 pr-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Queued message ${props.index + 1}: ${title}`}
            accessibilityHint="Opens this message in the composer for editing"
            disabled={!controls.canEdit}
            onPress={() => onAction(runId, "edit")}
            className="min-h-10 min-w-0 flex-1 flex-row items-center gap-2 pl-2.5 active:opacity-70"
          >
            <SymbolView
              name={props.isEditing ? "pencil" : "clock"}
              size={13}
              tintColorClassName={props.isEditing ? "accent-primary" : "accent-icon-subtle"}
            />
            {entry.attachments.length > 0 ? (
              <View className="shrink-0 flex-row items-center gap-0.5">
                <SymbolView name="photo" size={12} tintColorClassName="accent-icon-subtle" />
                <Text className="text-2xs tabular-nums text-foreground-muted">
                  {entry.attachments.length}
                </Text>
              </View>
            ) : null}
            <Text
              className={cn(
                "min-w-0 flex-1 text-sm",
                props.isEditing ? "text-foreground-muted" : "text-foreground",
              )}
              numberOfLines={1}
            >
              {title}
            </Text>
            {props.isEditing ? (
              <Text className="shrink-0 text-2xs uppercase tracking-wide text-primary">
                Editing
              </Text>
            ) : null}
          </Pressable>
          {props.canSteer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Steer with message ${props.index + 1} now`}
              disabled={!controls.canSteer}
              onPress={() => onAction(runId, "steer")}
              className="h-8 shrink-0 justify-center rounded-full bg-primary px-3 active:opacity-70 disabled:opacity-40"
            >
              <Text className="font-t3-medium text-xs text-primary-foreground">Steer</Text>
            </Pressable>
          ) : null}
          <ControlPillMenu
            accessibilityLabel={`Actions for queued message ${props.index + 1}`}
            actions={actions}
            onPressAction={({ nativeEvent }) => {
              const action = nativeEvent.event;
              if (
                action === "edit" ||
                action === "up" ||
                action === "down" ||
                action === "remove"
              ) {
                onAction(runId, action);
              }
            }}
          >
            <View className="h-8 w-8 items-center justify-center rounded-full">
              <SymbolView name="ellipsis" size={15} tintColorClassName="accent-icon-muted" />
            </View>
          </ControlPillMenu>
        </View>
      </GlassControl>
    </Animated.View>
  );
});
