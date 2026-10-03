import { LiquidGlassView } from "@sbaiahmed1/react-native-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import type { ReactNode, Ref } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type ColorValue,
  type ViewInstance,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { withUniwind } from "uniwind";

import { cn } from "../lib/cn";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { GlassBackdrop } from "./GlassBackdrop";

// Explicit mappings keep the native glassEffectStyle enum out of style-array conversion.
const ThemedGlassView = withUniwind(GlassView, {
  style: { fromClassName: "className" },
  tintColor: { fromClassName: "tintColorClassName", styleProperty: "accentColor" },
});

interface GlassSurfaceProps extends ViewProps {
  readonly ref?: Ref<ViewInstance>;
  readonly children: ReactNode;
  readonly glassEffectStyle?: "clear" | "regular" | "none";
  readonly tintColor?: ColorValue;
  readonly tintColorClassName?: string;
  readonly chrome?: "default" | "none";
  /** Base color for the frosted tint, or solid fill when blur is unavailable. */
  readonly fallbackColor?: ColorValue;
  /** Uniwind styling used only when native Liquid Glass is unavailable. */
  readonly fallbackClassName?: string;
  /**
   * Android liquid glass only: a cap (a rounded rect in this view's dp
   * coordinates) fused to the body below `bodyTop` as one piece of glass. The
   * shader draws the union, so the edge refraction runs around the outline
   * and the join reads as one meniscus. The view's own border is dropped;
   * the shader draws a rim in its place.
   */
  readonly glassShape?: GlassShape | null;
}

export interface GlassShape {
  readonly bodyTop: number;
  readonly cap: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly radius: number;
  };
}

export function GlassSurface({
  ref,
  children,
  glassEffectStyle = "regular",
  chrome = "default",
  tintColor,
  tintColorClassName,
  fallbackColor,
  fallbackClassName,
  glassShape,
  className,
  style,
  ...props
}: GlassSurfaceProps) {
  const { themeAppearance } = useAppearancePreferences();
  const isDarkMode = themeAppearance === "dark";
  const supportsGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable();
  const hasShadow = chrome !== "none" && Platform.OS !== "android";
  const surfaceStyle: ViewStyle = {
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: hasShadow ? "#000000" : "transparent",
    shadowOpacity: hasShadow ? (isDarkMode ? 0.22 : 0.08) : 0,
    shadowRadius: hasShadow ? 28 : 0,
    shadowOffset: { width: 0, height: hasShadow ? 14 : 0 },
    elevation: hasShadow ? 12 : 0,
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
    const flattened = StyleSheet.flatten([surfaceStyle, style]) ?? {};
    const shapeProps = glassShape
      ? {
          bodyTop: glassShape.bodyTop,
          capX: glassShape.cap.x,
          capY: glassShape.cap.y,
          capWidth: glassShape.cap.width,
          capHeight: glassShape.cap.height,
          capRadius: glassShape.cap.radius,
          joinSmoothing: 14,
          rimAlpha: isDarkMode ? 0.14 : 0.08,
        }
      : { capWidth: 0 };
    return (
      <View
        {...props}
        ref={ref}
        className={glassShape ? cn("border-0 border-transparent", className) : borderClassName}
        style={[surfaceStyle, layoutOf(flattened)]}
      >
        <LiquidGlassView
          glassType="regular"
          glassTintColor={fallbackColor === undefined ? undefined : hexColor(String(fallbackColor))}
          glassOpacity={isDarkMode ? 0.55 : 0.4}
          isInteractive={false}
          // Fills a wrapper that has its own size (a 44pt pill); in a wrapper
          // sized by content it just takes the content's size.
          style={[contentOf(flattened), { alignSelf: "stretch", flexGrow: 1 }]}
          {...shapeProps}
        >
          {children}
        </LiquidGlassView>
      </View>
    );
  }
  return (
    <View {...props} ref={ref} className={borderClassName} style={[surfaceStyle, style]}>
      <GlassBackdrop fallbackColor={fallbackColor} />
      {children}
    </View>
  );
}

// Android 13 can run the AGSL liquid glass shader: refraction, dispersion,
// blur and tint from a live capture of the screen behind the view.
// The native tint parser reads hex only; theme colours arrive as rgba().
function hexColor(color: string): string {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(
    color.trim(),
  );
  if (!match) return color;
  const alpha = Math.round((match[4] === undefined ? 1 : Number(match[4])) * 255);
  const hex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  return `#${hex(alpha)}${hex(Number(match[1]))}${hex(Number(match[2]))}${hex(Number(match[3]))}`;
}

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
  "height",
  "minHeight",
  "maxHeight",
  "flex",
  "flexGrow",
  "flexShrink",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "zIndex",
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
