import { LiquidGlassView } from "@sbaiahmed1/react-native-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import type { ReactNode, Ref, RefObject } from "react";
import {
  Platform,
  StyleSheet,
  useColorScheme,
  View,
  type ColorValue,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { withUniwind } from "uniwind";

import { cn } from "../lib/cn";
import { GlassBackdrop } from "./GlassBackdrop";

// Explicit mappings keep the native glassEffectStyle enum out of style-array conversion.
const ThemedGlassView = withUniwind(GlassView, {
  style: { fromClassName: "className" },
  tintColor: { fromClassName: "tintColorClassName", styleProperty: "accentColor" },
});

interface GlassSurfaceProps extends ViewProps {
  readonly ref?: Ref<View>;
  readonly children: ReactNode;
  readonly glassEffectStyle?: "clear" | "regular" | "none";
  readonly tintColor?: ColorValue;
  readonly tintColorClassName?: string;
  readonly chrome?: "default" | "none";
  /** Base color for the frosted tint, or solid fill when blur is unavailable. */
  readonly fallbackColor?: ColorValue;
  readonly blurTarget?: RefObject<View | null>;
  /** Uniwind styling used only when native Liquid Glass is unavailable. */
  readonly fallbackClassName?: string;
}

export function GlassSurface({
  ref,
  children,
  glassEffectStyle = "regular",
  chrome = "default",
  tintColor,
  tintColorClassName,
  fallbackColor,
  blurTarget,
  fallbackClassName,
  className,
  style,
  ...props
}: GlassSurfaceProps) {
  const isDarkMode = useColorScheme() === "dark";
  const supportsGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable();
  const surfaceStyle: ViewStyle = {
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: chrome === "none" ? "transparent" : "#000000",
    shadowOpacity: chrome === "none" ? 0 : isDarkMode ? 0.22 : 0.08,
    shadowRadius: chrome === "none" ? 0 : 28,
    shadowOffset:
      chrome === "none"
        ? {
            width: 0,
            height: 0,
          }
        : {
            width: 0,
            height: 14,
          },
    elevation: chrome === "none" ? 0 : 12,
  };

  if (supportsGlass) {
    return (
      <ThemedGlassView
        {...props}
        ref={ref}
        className={cn(
          chrome === "none"
            ? "border-0 border-transparent bg-transparent"
            : "border border-border bg-glass-surface",
          className,
        )}
        glassEffectStyle={glassEffectStyle}
        tintColor={tintColor === undefined ? undefined : String(tintColor)}
        tintColorClassName={
          tintColorClassName ?? (tintColor === undefined ? "accent-glass-tint" : undefined)
        }
        colorScheme={isDarkMode ? "dark" : "light"}
        style={[surfaceStyle, style]}
      >
        {children}
      </ThemedGlassView>
    );
  }

  const borderClassName = cn(
    chrome === "none" ? "border-0 border-transparent" : "border border-border",
    fallbackClassName,
    className,
  );
  if (supportsLiquidGlass) {
    // The shader samples the whole screen and skips only glass views and their
    // children, so the content has to live inside the glass view: as a sibling
    // it would be captured and refracted back into its own backdrop.
    const flattened = StyleSheet.flatten([surfaceStyle, style]);
    return (
      <View
        {...props}
        ref={ref}
        className={borderClassName}
        style={[surfaceStyle, layoutOf(flattened)]}
      >
        <LiquidGlassView
          glassType="regular"
          glassTintColor={fallbackColor === undefined ? undefined : String(fallbackColor)}
          glassOpacity={isDarkMode ? 0.55 : 0.4}
          isInteractive={false}
          style={contentOf(flattened)}
        >
          {children}
        </LiquidGlassView>
      </View>
    );
  }
  return (
    <View {...props} ref={ref} className={borderClassName} style={[surfaceStyle, style]}>
      <GlassBackdrop blurTarget={blurTarget} fallbackColor={fallbackColor} />
      {children}
    </View>
  );
}

// Android 13 can run the AGSL liquid glass shader: refraction, dispersion,
// blur and tint from a live capture of the screen behind the view.
export const supportsLiquidGlass = Platform.OS === "android" && Platform.Version >= 33;

/** The corner radii of a style, so the clipping wrapper matches the glass shape. */
const LAYOUT_STYLE_KEYS = [
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginHorizontal",
  "marginVertical",
  "alignSelf",
  "width",
  "minWidth",
  "maxWidth",
  "flex",
  "flexGrow",
  "flexShrink",
] as const;

// The wrapper View is what the parent lays out, so the shape, margins and
// sizing move onto it; the glass node inside only keeps padding and content.
function layoutOf(flattened: ViewStyle | undefined): ViewStyle {
  if (!flattened) return {};
  const layout: Record<string, unknown> = {};
  for (const key of LAYOUT_STYLE_KEYS) {
    const value = flattened[key];
    if (value !== undefined) layout[key] = value;
  }
  return layout as ViewStyle;
}

function contentOf(flattened: ViewStyle | undefined): ViewStyle {
  if (!flattened) return {};
  const content: Record<string, unknown> = { ...flattened };
  for (const key of LAYOUT_STYLE_KEYS) {
    if (key.startsWith("border")) continue;
    delete content[key];
  }
  return content as ViewStyle;
}
