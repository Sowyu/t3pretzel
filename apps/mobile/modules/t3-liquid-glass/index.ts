import type { ComponentType } from "react";
import { Platform, type NativeSyntheticEvent, type ViewProps } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";

const MODULE_NAME = "T3LiquidGlass";

/** What the device draws: full glass (API 33+), blur and tint (API 31-32), or the opaque fill. */
export type LiquidGlassTier = "full" | "blur" | "none";

interface LiquidGlassModule {
  getTier(): LiquidGlassTier;
}

export interface LiquidGlassViewProps extends ViewProps {
  readonly shape: "circle" | "capsule" | "roundedRect";
  readonly cornerRadius: number;
  /** processColor() ints. */
  readonly tintColor: number;
  readonly fallbackColor: number;
  readonly dark: boolean;
  readonly blurRadius: number;
  readonly interactive: boolean;
  readonly tabCount: number;
  readonly selectedTab: number;
  readonly tabInset: number;
  /** The segmented-control selection: a raised capsule instead of the tab bar's tint. */
  readonly tabRaised?: boolean;
  /** >= 0 draws the scroll-edge band, fading out from this fraction of the height. */
  readonly edgeFadeStart: number;
  readonly onTabSelect?: (event: NativeSyntheticEvent<{ readonly index: number }>) => void;
}

let module: LiquidGlassModule | null | undefined;
function nativeModule() {
  if (module === undefined) {
    module =
      Platform.OS === "android"
        ? requireOptionalNativeModule<LiquidGlassModule>(MODULE_NAME)
        : null;
  }
  return module;
}

let tier: LiquidGlassTier | undefined;

/** The tier this device can draw (API level only), before the user setting. */
export function getLiquidGlassDeviceTier(): LiquidGlassTier {
  tier ??= nativeModule()?.getTier() ?? "none";
  return tier;
}

let glassView: ComponentType<LiquidGlassViewProps> | null | undefined;
interface GlassBackdropViewProps extends ViewProps {
  /** A screen's plain background: draws nothing, glass on it shows what is behind through its tint. */
  readonly flat?: boolean;
}

let backdropView: ComponentType<GlassBackdropViewProps> | null | undefined;

/** The glass surface, or null where the module is not compiled in (iOS, tests). */
export function liquidGlassView() {
  if (glassView === undefined) {
    glassView = nativeModule()
      ? requireNativeView<LiquidGlassViewProps>(MODULE_NAME, "T3LiquidGlassView")
      : null;
  }
  return glassView;
}

/** The backdrop source glass samples, or null where the module is missing. */
export function glassBackdropView() {
  if (backdropView === undefined) {
    backdropView = nativeModule()
      ? requireNativeView<GlassBackdropViewProps>(MODULE_NAME, "T3GlassBackdrop")
      : null;
  }
  return backdropView;
}

interface LiquidToggleViewProps extends ViewProps {
  readonly value: boolean;
  readonly enabled: boolean;
  /** processColor() ints. */
  readonly onTrackColor: number;
  readonly offTrackColor: number;
  readonly dark: boolean;
  readonly onValueChange?: (event: NativeSyntheticEvent<{ readonly value: boolean }>) => void;
}

let toggleView: ComponentType<LiquidToggleViewProps> | null | undefined;

/** Kyant's LiquidToggle as a native switch, or null where the module is missing. */
export function liquidToggleView() {
  if (toggleView === undefined) {
    toggleView = nativeModule()
      ? requireNativeView<LiquidToggleViewProps>(MODULE_NAME, "T3LiquidToggle")
      : null;
  }
  return toggleView;
}

interface ViewMirrorViewProps extends ViewProps {
  /** findNodeHandle() of the on-screen view to draw. */
  readonly sourceTag: number;
}

let mirrorView: ComponentType<ViewMirrorViewProps> | null | undefined;

/** Draws another on-screen view in place (a context menu's lifted row), or null where the module is missing. */
export function viewMirrorView() {
  if (mirrorView === undefined) {
    mirrorView = nativeModule()
      ? requireNativeView<ViewMirrorViewProps>(MODULE_NAME, "T3ViewMirror")
      : null;
  }
  return mirrorView;
}
