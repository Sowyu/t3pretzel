import { useEffect, useState } from "react";
import { I18nManager, Platform, Pressable, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText as Text } from "./AppText";
import { cn } from "../lib/cn";
import { GlassSurface } from "./GlassSurface";
import type { SegmentedControlProps } from "./SegmentedControl.types";
import { useLiquidGlass } from "./useLiquidGlass";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";

export type { SegmentedControlProps } from "./SegmentedControl.types";

export function SegmentedControl<Value extends number | string>(
  props: SegmentedControlProps<Value>,
) {
  const compact = props.size === "compact";
  const liquid = useLiquidGlass().tier !== "none";
  const isDark = useAppearancePreferences().themeAppearance === "dark";
  // UISegmentedControl: a grey system-fill track under a raised selected capsule.
  const android = Platform.OS === "android";
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.selected),
  );
  const position = useSharedValue(index);
  useEffect(() => {
    position.set(
      withTiming(index, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [index, position]);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          ((position.value * width) / props.options.length) * (I18nManager.isRTL ? -1 : 1),
      },
    ],
  }));
  if (liquid) {
    // iOS 26 segmented control: a glass track whose selection is the tab-bar
    // lens, which slides on tap and follows a drag across segments.
    return (
      <GlassSurface
        chrome="none"
        shape="capsule"
        accessible={false}
        // Glass is the track, so a caller's track color only applies without it.
        className={cn(
          "flex-row",
          props.className
            ?.split(" ")
            .filter((name) => !name.startsWith("bg-"))
            .join(" "),
        )}
        tabs={{
          count: props.options.length,
          selected: index,
          inset: 3,
          raised: true,
          onSelect: (next) => {
            const option = props.options[next];
            if (option) props.onSelect(option.value);
          },
        }}
      >
        {props.options.map((option) => {
          const active = option.value === props.selected;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole={props.role ?? "button"}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              accessibilityState={{ selected: active }}
              onPress={() => props.onSelect(option.value)}
              className={cn("flex-1 items-center justify-center", compact ? "h-9" : "h-11")}
            >
              <Text
                className={cn(
                  compact ? "text-xs" : "text-sm",
                  active ? "font-t3-medium text-foreground" : "text-foreground-muted",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    );
  }
  return (
    <View
      accessible={false}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className={cn(
        "flex-row overflow-hidden",
        android ? "rounded-full border-continuous" : "rounded-full border-continuous bg-card",
        props.className,
      )}
      style={
        android
          ? { backgroundColor: isDark ? "rgba(120, 120, 128, 0.24)" : "rgba(120, 120, 128, 0.12)" }
          : undefined
      }
    >
      {android ? (
        <Animated.View
          pointerEvents="none"
          className="absolute inset-y-0"
          style={[
            { width: `${100 / props.options.length}%`, start: 0, padding: 2 },
            indicatorStyle,
          ]}
        >
          <View
            className="flex-1 rounded-full bg-card-alt"
            style={{ boxShadow: "0 1px 4px rgba(0, 0, 0, 0.12)" }}
          />
        </Animated.View>
      ) : (
        <Animated.View
          pointerEvents="none"
          className="absolute inset-y-0 rounded-full bg-secondary"
          style={[{ width: `${100 / props.options.length}%`, start: 0 }, indicatorStyle]}
        />
      )}
      {props.options.map((option) => {
        const active = option.value === props.selected;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole={Platform.OS === "ios" ? "button" : (props.role ?? "button")}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected: active }}
            onPress={() => props.onSelect(option.value)}
            className={cn(
              "flex-1 items-center justify-center rounded-full",
              compact ? "h-9" : "h-11",
            )}
          >
            <Text
              className={cn(
                compact ? "text-xs" : "text-sm",
                active
                  ? android
                    ? "font-t3-medium text-foreground"
                    : "font-t3-medium text-secondary-foreground"
                  : "text-foreground-muted",
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
