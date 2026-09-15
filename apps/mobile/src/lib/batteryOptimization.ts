import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

interface NativeBatteryOptimization {
  isIgnoringBatteryOptimizations?(): boolean;
  requestIgnoreBatteryOptimizations?(): Promise<void>;
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<NativeBatteryOptimization>("T3NativeControls")
    : null;

export function supportsBatteryOptimizationHint(): boolean {
  return typeof native?.isIgnoringBatteryOptimizations === "function";
}

/**
 * Whether Android will let the app do periodic background work. An optimised
 * app is dropped into a standby bucket that defers WorkManager jobs for hours,
 * which is the usual reason the background refresh never runs on a real phone.
 * Anything we cannot read counts as unrestricted, so the hint stays quiet.
 */
export function isBatteryOptimizationRestricted(): boolean {
  return native?.isIgnoringBatteryOptimizations?.() === false;
}

/** Opens the system exemption dialog, or the battery optimisation list. */
export async function requestUnrestrictedBattery(): Promise<void> {
  await native?.requestIgnoreBatteryOptimizations?.();
}
