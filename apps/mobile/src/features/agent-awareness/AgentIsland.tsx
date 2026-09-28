import { useAtomValue } from "@effect/atom-react";
import { useLinkTo } from "@react-navigation/native";
import { useCallback, useEffect, useRef } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Directions, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { errorHaptic, lightImpactHaptic, successHaptic } from "../../lib/haptics";
import { appAtomRegistry } from "../../state/atom-registry";
import type { AgentIslandAlert } from "./turnCompletionNotifications";
import { agentIslandAtom } from "./turnCompletionNotifier";

// The resting pill, the size of the iPhone Dynamic Island, centred on the
// status bar where Android phones put the front camera.
const PILL_WIDTH = 126;
const PILL_HEIGHT = 37;
const OPEN_HEIGHT = 68;
const OPEN_MAX_WIDTH = 420;
const OPEN_SPRING = { damping: 17, stiffness: 190, mass: 0.9 };
// Input waits on the user, so it stays up longer than a finished turn.
const VISIBLE_MS = { finished: 4000, failed: 5000, input: 7000 } as const;

const KIND = {
  finished: { icon: "checkmark", color: "#30d158", label: "Finished" },
  failed: { icon: "exclamationmark.triangle", color: "#ff453a", label: "Failed" },
  input: { icon: "text.bubble", color: "#ff9f0a", label: "Needs input" },
} as const satisfies Record<AgentIslandAlert["kind"], object>;

function clear() {
  appAtomRegistry.set(agentIslandAtom, null);
}

/**
 * In-app alerts for other threads, shaped like the iPhone Dynamic Island: a
 * black pill at the camera that springs open with what finished, failed, or
 * needs input. Tap opens the thread, a flick up dismisses it. Fed by the turn
 * completion notifier, which posts system notifications instead while the app
 * is in the background. Mounted once, over every screen, by the root stack.
 */
export function AgentIsland() {
  const current = useAtomValue(agentIslandAtom);
  const linkTo = useLinkTo();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const open = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openWidth = Math.min(OPEN_MAX_WIDTH, screenWidth - 24);
  const top = Math.max(4, (insets.top - PILL_HEIGHT) / 2);

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    open.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) runOnJS(clear)();
    });
  }, [open]);

  useEffect(() => {
    if (current === null) return;
    const kind = current.alert.kind;
    void (kind === "failed"
      ? errorHaptic()
      : kind === "finished"
        ? successHaptic()
        : lightImpactHaptic());
    open.value = 0;
    open.value = withSpring(1, OPEN_SPRING);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(close, VISIBLE_MS[kind]);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, close, open]);

  const pillStyle = useAnimatedStyle(() => ({
    width: interpolate(open.value, [0, 1], [PILL_WIDTH, openWidth]),
    height: interpolate(open.value, [0, 1], [PILL_HEIGHT, OPEN_HEIGHT]),
    borderRadius: interpolate(open.value, [0, 1], [PILL_HEIGHT / 2, 30]),
    opacity: interpolate(open.value, [0, 0.15], [0, 1], "clamp"),
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0.55, 1], [0, 1], "clamp"),
  }));

  const flickUp = Gesture.Fling().direction(Directions.UP).runOnJS(true).onEnd(close);

  if (current === null) return null;
  const { alert } = current;
  const kind = KIND[alert.kind];

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center"
      style={{ top, zIndex: 1000, elevation: 1000 }}
    >
      <GestureDetector gesture={flickUp}>
        <Animated.View
          className="overflow-hidden bg-black"
          style={[
            {
              shadowColor: "#000000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 18,
            },
            pillStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${alert.title}. ${alert.body}`}
            accessibilityHint="Double tap to open the thread."
            onPress={() => {
              close();
              linkTo(alert.deepLink);
            }}
            className="flex-1"
          >
            <Animated.View className="flex-1 flex-row items-center gap-3 px-4" style={contentStyle}>
              <View
                className="size-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${kind.color}29` }}
              >
                <SymbolView name={kind.icon} size={18} tintColor={kind.color} type="monochrome" />
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  className="font-t3-semibold text-sm"
                  style={{ color: "#ffffff" }}
                  numberOfLines={1}
                >
                  {alert.title}
                </Text>
                <Text className="text-xs" style={{ color: "#ffffff99" }} numberOfLines={1}>
                  {alert.body}
                </Text>
              </View>
              <Text className="font-t3-medium text-xs" style={{ color: kind.color }}>
                {kind.label}
              </Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
