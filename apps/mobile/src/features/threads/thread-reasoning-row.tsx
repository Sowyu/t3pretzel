import { memo, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText as Text } from "../../components/AppText";
import { useUniwindTheme } from "../../lib/useUniwindTheme";

/** Below this, three lines almost always hold the whole block on a phone. */
const REASONING_COLLAPSE_MIN_LENGTH = 140;
/** Short text still overflows three lines once it has this many line breaks. */
const REASONING_COLLAPSE_MIN_BREAKS = 3;

function reasoningOverflowsCollapsed(text: string): boolean {
  return (
    text.length >= REASONING_COLLAPSE_MIN_LENGTH ||
    text.split("\n").length > REASONING_COLLAPSE_MIN_BREAKS
  );
}
/** Older chunks than this fold into the static prefix; their fade is long done. */
const FADING_CHUNKS = 6;
const CHUNK_FADE_MS = 320;

interface FadeState {
  /** The text this state was built for. */
  readonly shown: string;
  /** Text whose fade is over, rendered as one static string. */
  readonly prefix: string;
  /** Recent arrivals, oldest first; each one fades in where it landed. */
  readonly chunks: ReadonlyArray<{ readonly position: number; readonly text: string }>;
  /** Positions only grow, so a chunk keeps its span, and its finished fade. */
  readonly next: number;
}

/**
 * Splits the text a streaming reasoning message has grown to into the spans
 * that still owe a fade. Deltas only ever append, so the new suffix is the new
 * chunk; text that is not an extension of what was shown (a resumed thread, a
 * provider replacing its block) snaps instead of animating a diff.
 */
function advanceFade(fade: FadeState, text: string): FadeState {
  if (!text.startsWith(fade.shown)) {
    return { shown: text, prefix: text, chunks: [], next: fade.next };
  }
  const chunks = [...fade.chunks, { position: fade.next, text: text.slice(fade.shown.length) }];
  const folded = chunks.slice(0, Math.max(0, chunks.length - FADING_CHUNKS));
  return {
    shown: text,
    prefix: fade.prefix + folded.map((chunk) => chunk.text).join(""),
    chunks: chunks.slice(folded.length),
    next: fade.next + 1,
  };
}

/**
 * One thinking trace: a `role: "reasoning"` message, shown when Settings →
 * Experimental → Thinking traces is on. While it streams each new delta fades
 * in where it lands; a finished block collapses to three lines, because the
 * answer below it is the point. Text already there when the row mounted never
 * fades, so a thread opened mid-turn shows what exists without a light show.
 * `expanded` lives on the feed so it survives row recycling.
 */
export const ThreadReasoningRow = memo(function ThreadReasoningRow(props: {
  readonly rowId: string;
  readonly text: string;
  readonly live: boolean;
  readonly expanded: boolean;
  readonly onToggle: (rowId: string, anchorKey: string) => void;
}) {
  const [fade, setFade] = useState<FadeState>(() => ({
    shown: props.text,
    prefix: props.text,
    chunks: [],
    next: 0,
  }));
  // Growth is only visible by comparing against the last render, and React
  // renders again with the new state before this one paints.
  if (fade.shown !== props.text) {
    setFade(
      props.live
        ? advanceFade(fade, props.text)
        : { shown: props.text, prefix: props.text, chunks: [], next: fade.next },
    );
  }
  const collapsed = !props.live && !props.expanded;
  return (
    <View className="mb-2 px-1">
      <Text
        selectable
        className="text-sm leading-snug text-foreground-muted opacity-90"
        {...(collapsed ? { numberOfLines: 3 } : {})}
      >
        {fade.prefix}
        {fade.chunks.map((chunk) => (
          <FadingChunk key={chunk.position} text={chunk.text} />
        ))}
      </Text>
      {!props.live && reasoningOverflowsCollapsed(props.text) ? (
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
