import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo";

export interface StatusBarState {
  /** 0..1 */
  readonly batteryLevel: number;
  /** Power connected. iOS draws the bolt whether or not the battery is full. */
  readonly charging: boolean;
  readonly wifi: boolean;
  /** 1..3 arcs. */
  readonly wifiBars: number;
  readonly cellular: boolean;
  /** 0..4 bars. */
  readonly cellularBars: number;
  readonly use24Hour: boolean;
  /** Bumps when the system clock or time zone changes. */
  readonly clockRevision: number;
}

export interface StatusBarMetrics {
  /** The status bar height whether or not it is visible, or the cutout if taller. */
  readonly top: number;
  /** The camera cutout's edges, null without one. */
  readonly cutoutLeft: number | null;
  readonly cutoutRight: number | null;
}

interface StatusBarModule {
  getState(): StatusBarState;
  getMetrics(): StatusBarMetrics;
  setHidden(hidden: boolean): void;
  addListener(event: "onChange", listener: (state: StatusBarState) => void): EventSubscription;
}

/** The Android status bar feed, or null where it is not compiled in (iOS, tests). */
export const statusBarModule =
  Platform.OS === "android" ? requireOptionalNativeModule<StatusBarModule>("T3StatusBar") : null;
