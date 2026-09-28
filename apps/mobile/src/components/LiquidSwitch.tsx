import { useEffect } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { selectionHaptic } from "../lib/haptics";
import { useUniwindTheme } from "../lib/useUniwindTheme";
import { GlassSurface, supportsLiquidGlass } from "./GlassSurface";

// Apple's UISwitch geometry.
const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const KNOB = 27;
const INSET = 2;
const TRAVEL = TRACK_WIDTH - KNOB - INSET * 2;
// How far the knob elongates while held, toward the side it can move to.
const STRETCH = 8;
// The knob overshoots its rest and settles, like the iOS 26 toggle.
const SNAP_SPRING = { damping: 12, stiffness: 260, mass: 0.8 };
const STRETCH_SPRING = { damping: 14, stiffness: 320, mass: 0.6 };
// iOS paints the off track in its own neutral gray whatever the theme, and the
// knob is always white with a soft two-layer shadow.
const OFF_TRACK = { light: "#E9E9EA", dark: "#39393D" } as const;
const KNOB_COLOR = "#FFFFFF";
const KNOB_SHADOW = "0px 3px 8px rgba(0, 0, 0, 0.15), 0px 3px 1px rgba(0, 0, 0, 0.06)";

/**
 * The iOS toggle, drawn as liquid glass: a coloured track under a clear glass
 * capsule, and a knob that stretches while held, follows a drag, and springs
 * into place. Below Android 13 the same parts render without the glass. The
 * on track is `--color-switch-active-track`, so the toggle colour preference
 * applies.
 */
export function LiquidSwitch(props: {
  readonly value: boolean;
  readonly onValueChange?: (value: boolean) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const colors = useUniwindTheme();
  const offTrack = OFF_TRACK[useAppearancePreferences().themeAppearance];
  const onTrack = colors["--color-switch-active-track"];
  const { value, onValueChange, disabled } = props;
  const progress = useSharedValue(value ? 1 : 0);
  const stretch = useSharedValue(0);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, SNAP_SPRING);
  }, [progress, value]);

  const commit = (next: boolean) => {
    if (next !== value) void selectionHaptic();
    progress.value = withSpring(next ? 1 : 0, SNAP_SPRING);
    onValueChange?.(next);
  };
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .minDistance(6)
    .onBegin(() => {
      dragStart.value = progress.value;
      stretch.value = withSpring(1, STRETCH_SPRING);
    })
    .onUpdate((event) => {
      progress.value = Math.max(0, Math.min(1, dragStart.value + event.translationX / TRAVEL));
    })
    .onFinalize((_event, success) => {
      stretch.value = withSpring(0, STRETCH_SPRING);
      // A drag lands on the nearer side; a cancelled touch springs back.
      commit(success ? progress.value >= 0.5 : value);
    });

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offTrack, onTrack]),
  }));
  const knobStyle = useAnimatedStyle(() => {
    const extra = stretch.value * STRETCH;
    return {
      width: KNOB + extra,
      transform: [{ translateX: INSET + progress.value * (TRAVEL - extra) }],
    };
  });

  const knob = (
    <Animated.View
      style={[
        {
          backgroundColor: KNOB_COLOR,
          borderRadius: KNOB / 2,
          boxShadow: KNOB_SHADOW,
          height: KNOB,
          position: "absolute",
          top: INSET,
        },
        knobStyle,
      ]}
    />
  );

  return (
    <Pressable
      accessibilityHint={props.accessibilityHint}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => commit(!value)}
      onPressIn={() => {
        stretch.value = withSpring(1, STRETCH_SPRING);
      }}
      onPressOut={() => {
        stretch.value = withSpring(0, STRETCH_SPRING);
      }}
      style={[disabled ? { opacity: 0.4 } : null, props.style]}
      testID={props.testID}
    >
      <GestureDetector gesture={pan}>
        <View style={{ height: TRACK_HEIGHT, width: TRACK_WIDTH }}>
          <Animated.View
            style={[
              {
                borderRadius: TRACK_HEIGHT / 2,
                bottom: 0,
                left: 0,
                opacity: supportsLiquidGlass ? 0.9 : 1,
                position: "absolute",
                right: 0,
                top: 0,
              },
              trackStyle,
            ]}
          />
          {supportsLiquidGlass ? (
            // The knob lives inside the glass so it draws sharp on top; the
            // coloured track underneath is what the capsule refracts.
            <GlassSurface
              chrome="none"
              glassEffectStyle="regular"
              tintColor="transparent"
              style={{
                borderRadius: TRACK_HEIGHT / 2,
                bottom: 0,
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
              }}
            >
              {knob}
            </GlassSurface>
          ) : (
            knob
          )}
        </View>
      </GestureDetector>
    </Pressable>
  );
}
