import type { ComponentType } from "react";
import { Platform, type NativeSyntheticEvent, type ViewProps } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";

const MODULE_NAME = "T3LiquidGlass";

/** What the device draws: full glass (API 33+), blur and tint (API 31-32), or the opaque fill. */
export type LiquidGlassTier = "full" | "blur" | "none";

interface LiquidGlassSystemState {
  readonly tier: LiquidGlassTier;
  readonly powerSaveMode: boolean;
}

interface LiquidGlassModule {
  getSystemState(): LiquidGlassSystemState;
  addListener(
    event: "onSystemStateChange",
    listener: (state: LiquidGlassSystemState) => void,
  ): { remove(): void };
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
  /** >= 0 draws the scroll-edge band, fading out from this fraction of the height. */
  readonly edgeFadeStart: number;
  readonly onTabSelect?: (event: NativeSyntheticEvent<{ readonly index: number }>) => void;
}

const UNAVAILABLE: LiquidGlassSystemState = { tier: "none", powerSaveMode: false };

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

let state: LiquidGlassSystemState | null = null;

/** Snapshot for useSyncExternalStore. Battery saver flips it live. */
export function getLiquidGlassSystemState(): LiquidGlassSystemState {
  state ??= nativeModule()?.getSystemState() ?? UNAVAILABLE;
  return state;
}

export function subscribeLiquidGlassSystemState(onChange: () => void) {
  const subscription = nativeModule()?.addListener("onSystemStateChange", (next) => {
    state = next;
    onChange();
  });
  return () => subscription?.remove();
}

let glassView: ComponentType<LiquidGlassViewProps> | null | undefined;
let backdropView: ComponentType<ViewProps> | null | undefined;

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
      ? requireNativeView<ViewProps>(MODULE_NAME, "T3GlassBackdrop")
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
