import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import type { ComponentType, ReactNode, Ref } from "react";
import {
  Platform,
  processColor,
  StyleSheet,
  View,
  type ColorValue,
  type ViewInstance,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { withUniwind } from "uniwind";

import { liquidGlassView, type LiquidGlassViewProps } from "../../modules/t3-liquid-glass";
import { cn } from "../lib/cn";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { themeColorWithAlpha, themeColorWithMinimumAlpha } from "../lib/mobileTheme";
import { GlassBackdrop } from "./GlassBackdrop";
import { useLiquidGlass } from "./useLiquidGlass";

// Explicit mappings keep the native glassEffectStyle enum out of style-array conversion.
const ThemedGlassView = withUniwind(GlassView, {
  style: { fromClassName: "className" },
  tintColor: { fromClassName: "tintColorClassName", styleProperty: "accentColor" },
});

type ThemedLiquidGlassProps = LiquidGlassViewProps & {
  readonly className?: string;
  readonly ref?: Ref<ViewInstance>;
};
const NativeLiquidGlass = liquidGlassView();
const ThemedLiquidGlass = NativeLiquidGlass
  ? (withUniwind(NativeLiquidGlass) as unknown as ComponentType<ThemedLiquidGlassProps>)
  : null;

/** The tab-bar preset: a sliding, draggable selection lens over `count` equal tabs. */
interface GlassTabs {
  readonly count: number;
  readonly selected: number;
  /** Padding between the bar edge and the indicator, in dp. */
  readonly inset: number;
  /** A segmented control's raised selection rather than the tab bar's tint. */
  readonly raised?: boolean;
  readonly onSelect: (index: number) => void;
}

function toColorInt(color: ColorValue) {
  return Number(processColor(color) ?? 0);
}

interface GlassSurfaceProps extends ViewProps {
  readonly ref?: Ref<ViewInstance>;
  readonly children: ReactNode;
  readonly glassEffectStyle?: "clear" | "regular" | "none";
  /** iOS glass tint. Android tints regular glass with it too, unless "transparent". */
  readonly tintColor?: ColorValue;
  readonly tintColorClassName?: string;
  readonly chrome?: "default" | "none";
  /** Base color for the frosted tint, or solid fill when blur is unavailable. */
  readonly fallbackColor?: ColorValue;
  /** Uniwind styling used only when native Liquid Glass is unavailable. */
  readonly fallbackClassName?: string;
  /** Android Liquid Glass shape; defaults to a continuous-corner rect from `borderRadius`. */
  readonly shape?: "circle" | "capsule" | "roundedRect";
  /** Android: the glass swells and glows under the finger while pressed (iOS glass buttons). */
  readonly interactive?: boolean;
  /**
   * Android: "menu" is the thicker, more opaque material of context menus.
   * "edge" is iOS's scroll-edge band under a floating header: blurred backdrop
   * under `tintColor` (the screen color), fading out from `edgeFadeStart`.
   * "scrim" is the full-screen blur and dim behind a long-press context menu:
   * the blurred backdrop under `tintColor` as given, with no fade.
   */
  readonly variant?: "regular" | "menu" | "edge" | "scrim";
  /** Fraction of the "edge" band's height where it starts fading out. */
  readonly edgeFadeStart?: number;
  readonly tabs?: GlassTabs;
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
  shape = "roundedRect",
  interactive = false,
  variant = "regular",
  edgeFadeStart = 0.7,
  tabs,
  className,
  style,
  ...props
}: GlassSurfaceProps) {
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const { tier } = useLiquidGlass();
  const isDarkMode = themeAppearance === "dark";
  const isAndroid = Platform.OS === "android";
  const supportsGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable();
  const hasShadow = chrome !== "none";
  const surfaceStyle: ViewStyle = {
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: hasShadow ? "#000000" : "transparent",
    shadowOpacity: hasShadow ? (isDarkMode ? 0.22 : 0.08) : 0,
    shadowRadius: hasShadow ? 28 : 0,
    shadowOffset: { width: 0, height: hasShadow ? 14 : 0 },
    elevation: hasShadow ? 10 : 0,
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

  if (ThemedLiquidGlass && isAndroid && tier !== "none") {
    // Real glass has no Material shadow or border: the native rim replaces both.
    const {
      elevation: _elevation,
      borderWidth: _borderWidth,
      borderColor: _borderColor,
      shadowColor: _shadowColor,
      shadowOpacity: _shadowOpacity,
      shadowRadius: _shadowRadius,
      shadowOffset: _shadowOffset,
      boxShadow: _boxShadow,
      backgroundColor: _backgroundColor,
      ...glassStyle
    } = StyleSheet.flatten(style) ?? {};
    const fill = fallbackColor ?? themeVariables["--color-glass-fallback"];
    const tint =
      variant === "scrim"
        ? String(tintColor ?? "rgba(0, 0, 0, 0.2)")
        : variant === "edge"
          ? themeColorWithAlpha(String(tintColor ?? themeVariables["--color-screen"]), 0.86)
          : tintColor !== undefined && tintColor !== "transparent"
            ? // iOS tinted glass, like a selected filter: the color carries, the backdrop still shows.
              themeColorWithAlpha(String(tintColor), 0.82)
            : themeColorWithAlpha(
                themeVariables["--color-glass-surface"],
                variant === "menu" ? (isDarkMode ? 0.74 : 0.8) : isDarkMode ? 0.4 : 0.46,
              );
    const borderRadius = typeof glassStyle.borderRadius === "number" ? glassStyle.borderRadius : 32;
    return (
      <ThemedLiquidGlass
        {...props}
        ref={ref}
        className={className}
        style={[{ borderRadius }, glassStyle]}
        shape={shape}
        cornerRadius={borderRadius}
        tintColor={toColorInt(tint)}
        fallbackColor={toColorInt(
          typeof fill === "string" ? themeColorWithMinimumAlpha(fill, 1) : fill,
        )}
        dark={isDarkMode}
        blurRadius={variant === "scrim" ? 16 : variant === "menu" ? 12 : variant === "edge" ? 8 : 4}
        // The edge shader's fade is a smoothstep from the start to 1; just
        // under 1 keeps the scrim solid to the bottom.
        edgeFadeStart={variant === "scrim" ? 0.999 : variant === "edge" ? edgeFadeStart : -1}
        interactive={interactive}
        tabCount={tabs?.count ?? 0}
        selectedTab={tabs?.selected ?? 0}
        tabInset={tabs?.inset ?? 0}
        tabRaised={tabs?.raised ?? false}
        onTabSelect={tabs ? (event) => tabs.onSelect(event.nativeEvent.index) : undefined}
      >
        {children}
      </ThemedLiquidGlass>
    );
  }

  if (isAndroid) {
    // No live blur on Android: a near-opaque theme fill carries the elevation
    // shadow, which a thinner fill would show through as a halo.
    const fill = fallbackColor ?? themeVariables["--color-glass-fallback"];
    return (
      <View
        {...props}
        ref={ref}
        className={cn(
          chrome === "none"
            ? "border-0 border-transparent"
            : isDarkMode
              ? "border border-white/10"
              : "border border-border",
          fallbackClassName,
          className,
        )}
        style={[
          surfaceStyle,
          {
            backgroundColor: typeof fill === "string" ? themeColorWithMinimumAlpha(fill, 1) : fill,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      {...props}
      ref={ref}
      className={cn(
        chrome === "none" ? "border-0 border-transparent" : "border border-border",
        fallbackClassName,
        className,
      )}
      style={[surfaceStyle, style]}
    >
      <GlassBackdrop fallbackColor={fallbackColor} />
      {children}
    </View>
  );
}

/**
 * Android Liquid Glass behind a pill or circle control's content. Render it
 * as the control's first child, only while useLiquidGlass().tier is not
 * "none", and drop the control's own background then; the control keeps its
 * layout, so the glass-off look stays exactly as it was.
 */
export function GlassFill(props: {
  readonly shape?: "circle" | "capsule" | "roundedRect";
  /** For "roundedRect". */
  readonly borderRadius?: number;
  /** Tinted glass, like a selected filter. */
  readonly tintColor?: ColorValue;
  /** Swells under the finger; off for disabled controls. */
  readonly interactive?: boolean;
}) {
  return (
    <GlassSurface
      chrome="none"
      shape={props.shape ?? "capsule"}
      interactive={props.interactive ?? true}
      tintColor={props.tintColor}
      style={[StyleSheet.absoluteFill, { borderRadius: props.borderRadius ?? 999 }]}
    >
      {null}
    </GlassSurface>
  );
}
