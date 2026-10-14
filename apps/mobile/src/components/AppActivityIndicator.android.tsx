import { useEffect } from "react";
import { View, type ActivityIndicatorProps } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { withUniwind } from "uniwind";

const SPOKES = 8;
/** UIActivityIndicatorView's default tint (systemGray), readable on light and dark. */
const DEFAULT_COLOR = "#8E8E93";

/**
 * The iOS spinner: eight rounded spokes fading behind the brightest one,
 * stepping clockwise once a second. Replaces Android's Material arc. The
 * rotation runs on the UI thread and only while mounted and animating.
 */
function IosActivityIndicator({
  size = "small",
  color,
  animating = true,
  hidesWhenStopped = true,
  style,
  ...rest
}: ActivityIndicatorProps) {
  // RN maps "small" and "large" to 20 and 36 on Android; UIKit uses 20 and 37.
  const dimension = typeof size === "number" ? size : size === "large" ? 37 : 20;
  const turn = useSharedValue(0);

  useEffect(() => {
    if (!animating) return;
    turn.value = 0;
    turn.value = withRepeat(
      withTiming(1, {
        duration: 1000,
        easing: Easing.steps(SPOKES),
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
    );
    return () => cancelAnimation(turn);
  }, [animating, turn]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 360}deg` }],
  }));

  const center = dimension / 2;
  const inner = dimension * 0.23;
  const outer = dimension * 0.45;
  const strokeWidth = Math.max(1.5, dimension * 0.115);
  const tint = typeof color === "string" ? color : DEFAULT_COLOR;

  return (
    <View
      accessibilityRole="progressbar"
      {...rest}
      style={[{ width: dimension, height: dimension }, style]}
    >
      {animating || !hidesWhenStopped ? (
        <Animated.View style={[{ width: dimension, height: dimension }, spin]}>
          <Svg width={dimension} height={dimension}>
            {Array.from({ length: SPOKES }, (_, index) => {
              // Spoke 0 points up and is the brightest; the rest trail counter-clockwise.
              const angle = (-index * 2 * Math.PI) / SPOKES;
              const dx = Math.sin(angle);
              const dy = -Math.cos(angle);
              return (
                <Line
                  key={index}
                  x1={center + dx * inner}
                  y1={center + dy * inner}
                  x2={center + dx * outer}
                  y2={center + dy * outer}
                  stroke={tint}
                  strokeOpacity={Math.max(0.3, 1 - index * 0.1)}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
              );
            })}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

export const AppActivityIndicator = withUniwind(IosActivityIndicator);
