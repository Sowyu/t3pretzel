import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import type { ThemedSwitchProps } from "./ThemedSwitch";

// UISwitch geometry.
const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const THUMB_SIZE = 27;
const INSET = (TRACK_HEIGHT - THUMB_SIZE) / 2;
const TRAVEL = TRACK_WIDTH - THUMB_SIZE - INSET * 2;
// Pads the 31px track out to Android's 48dp minimum touch target.
const HIT_SLOP = { top: 9, bottom: 9, left: 4, right: 4 };

/**
 * An iOS-style switch drawn in JS. Taps are the only input: one Pressable
 * press reports `!value` once. The fork's old switch also committed from a
 * pan gesture and fired twice per tap, so there is deliberately no drag.
 */
export function ThemedSwitch(props: ThemedSwitchProps) {
  const { themeVariables: colors } = useAppearancePreferences();
  const value = Boolean(props.value);
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(
      withTiming(value ? 1 : 0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [progress, value]);

  const offTrack = colors["--color-switch-inactive-track"];
  const onTrack = colors["--color-switch-active-track"];
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offTrack, onTrack]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={{ checked: value, disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      hitSlop={HIT_SLOP}
      onPress={() => props.onValueChange?.(!value)}
      style={[{ opacity: props.disabled ? 0.5 : 1 }, props.style]}
      testID={props.testID}
    >
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            padding: INSET,
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: colors["--color-switch-active-thumb"],
              elevation: 3,
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
