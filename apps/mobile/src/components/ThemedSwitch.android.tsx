import { useEffect } from "react";
import { Pressable, processColor, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { liquidToggleView } from "../../modules/t3-liquid-glass";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import type { ThemedSwitchProps } from "./ThemedSwitch";
import { useLiquidGlass } from "./useLiquidGlass";

// iOS 26 UISwitch geometry: a 63x28 track with a 37x24 pill thumb.
const TRACK_WIDTH = 63;
const TRACK_HEIGHT = 28;
const THUMB_WIDTH = 37;
const THUMB_HEIGHT = 24;
const INSET = (TRACK_HEIGHT - THUMB_HEIGHT) / 2;
const TRAVEL = TRACK_WIDTH - THUMB_WIDTH - INSET * 2;
// UISwitch's off track is the system fill, a translucent grey that reads on
// any grouped card colour.
const OFF_TRACK_LIGHT = "rgba(120, 120, 128, 0.16)";
const OFF_TRACK_DARK = "rgba(120, 120, 128, 0.32)";
// Pads the 28dp track out to Android's 48dp minimum touch target.
const HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

const LiquidToggle = liquidToggleView();

/** Kyant's LiquidToggle when Liquid glass is on, otherwise the JS switch. */
export function ThemedSwitch(props: ThemedSwitchProps) {
  const liquid = useLiquidGlass().tier !== "none";
  return LiquidToggle && liquid ? <LiquidSwitch {...props} /> : <JsSwitch {...props} />;
}

/**
 * The native glass switch. It owns the gesture (tap toggles, the thumb drags);
 * this wrapper owns accessibility and pads the 63x28dp track to a 48dp target.
 */
function LiquidSwitch(props: ThemedSwitchProps) {
  const { themeVariables: colors, themeAppearance } = useAppearancePreferences();
  const value = Boolean(props.value);
  const disabled = Boolean(props.disabled);
  if (!LiquidToggle) return null;
  return (
    <View
      accessible
      accessibilityRole="switch"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate" && !disabled) {
          props.onValueChange?.(!value);
        }
      }}
      style={[
        {
          width: TRACK_WIDTH + HIT_SLOP.left + HIT_SLOP.right,
          height: TRACK_HEIGHT + HIT_SLOP.top + HIT_SLOP.bottom,
          marginHorizontal: -HIT_SLOP.left,
          marginVertical: -HIT_SLOP.top,
          opacity: disabled ? 0.5 : 1,
        },
        props.style,
      ]}
      testID={props.testID}
    >
      <LiquidToggle
        value={value}
        enabled={!disabled}
        onTrackColor={Number(processColor(colors["--color-switch-active-track"]) ?? 0)}
        offTrackColor={Number(
          processColor(themeAppearance === "dark" ? OFF_TRACK_DARK : OFF_TRACK_LIGHT) ?? 0,
        )}
        dark={themeAppearance === "dark"}
        onValueChange={(event) => props.onValueChange?.(event.nativeEvent.value)}
        style={{ flex: 1 }}
      />
    </View>
  );
}

/**
 * An iOS-style switch drawn in JS. Taps are the only input: one Pressable
 * press reports `!value` once. The fork's old switch also committed from a
 * pan gesture and fired twice per tap, so there is deliberately no drag.
 */
function JsSwitch(props: ThemedSwitchProps) {
  const { themeVariables: colors, themeAppearance } = useAppearancePreferences();
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

  const offTrack = themeAppearance === "dark" ? OFF_TRACK_DARK : OFF_TRACK_LIGHT;
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
              width: THUMB_WIDTH,
              height: THUMB_HEIGHT,
              borderRadius: THUMB_HEIGHT / 2,
              // UISwitch's thumb is white in both appearances.
              backgroundColor: "#FFFFFF",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.16), 0 0 1px rgba(0, 0, 0, 0.12)",
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
