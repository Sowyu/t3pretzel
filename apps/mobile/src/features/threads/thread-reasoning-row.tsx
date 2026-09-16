import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, OrchestrationThreadActivity, ThreadId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText as Text } from "../../components/AppText";
import { threadReasoningItem } from "../../lib/threadReasoning";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { environmentThreadDetails } from "../../state/threads";

/** Below this, three lines almost always hold the whole block on a phone. */
const REASONING_COLLAPSE_MIN_LENGTH = 140;
/** Older chunks than this render as one static string; their fade is long done. */
const FADING_CHUNKS = 6;
const CHUNK_FADE_MS = 320;

/**
 * One reasoning block, shown when Settings → Experimental → Thinking traces
 * is on. The row subscribes to the thread's activities and maps them down to
 * its own block, so a chunk that changes another block never reaches React.
 * While the block streams each new chunk fades in where it lands; a finished
 * block collapses to three lines, because the answer below it is the point.
 */
export const ThreadReasoningRow = memo(function ThreadReasoningRow(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly itemKey: string;
  readonly rowId: string;
  readonly live: boolean;
  readonly expanded: boolean;
  readonly onToggle: (rowId: string, anchorKey: string) => void;
}) {
  const selectItem = useCallback(
    (activities: ReadonlyArray<OrchestrationThreadActivity>) =>
      threadReasoningItem(activities, props.itemKey),
    [props.itemKey],
  );
  const item = useAtomValue(
    environmentThreadDetails.activitiesAtom({
      environmentId: props.environmentId,
      threadId: props.threadId,
    }),
    selectItem,
  );
  // Chunks already there when the row mounted never fade: a thread opened
  // mid-turn shows what exists, and only what arrives afterwards animates.
  const [settledAtMount] = useState(() => item?.chunks.length ?? 0);
  if (!item) {
    return null;
  }
  const live = props.live && item.latestInTurn;
  const collapsed = !live && !props.expanded;
  const stableCount = live
    ? Math.max(settledAtMount, item.chunks.length - FADING_CHUNKS)
    : item.chunks.length;
  // Keyed by absolute position: a chunk keeps its span, and its finished
  // fade, until it folds into the static string ahead of it.
  const fading = item.chunks
    .slice(stableCount)
    .map((text, offset) => ({ position: stableCount + offset, text }));
  return (
    <View className="mb-2 px-1">
      <Text
        selectable
        className="text-sm leading-snug text-foreground-muted opacity-90"
        {...(collapsed ? { numberOfLines: 3 } : {})}
      >
        {item.chunks.slice(0, stableCount).join("")}
        {fading.map((chunk) => (
          <FadingChunk key={chunk.position} text={chunk.text} />
        ))}
      </Text>
      {!live && item.text.length >= REASONING_COLLAPSE_MIN_LENGTH ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: props.expanded }}
          hitSlop={8}
          onPress={() => props.onToggle(props.rowId, props.rowId)}
        >
          <Text className="mt-0.5 font-t3-medium text-xs text-foreground-muted">
            {props.expanded ? "Show less" : "Show more"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

function FadingChunk(props: { readonly text: string }) {
  const color = useUniwindTheme()["--color-foreground-muted"];
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: CHUNK_FADE_MS });
  }, [progress]);
  const style = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], ["transparent", color]),
  }));
  return <Animated.Text style={style}>{props.text}</Animated.Text>;
}
