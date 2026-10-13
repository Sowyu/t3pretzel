import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import type { BackgroundRefreshNativeStatus } from "./background-refresh-plan";

/** modules/t3-background-refresh: the WorkManager schedule and the worker's own record. */
interface NativeBackgroundRefresh {
  setEnabled(enabled: boolean): void;
  getStatus(): Promise<BackgroundRefreshNativeStatus | null>;
  saveRecord(json: string): void;
  runNow(): void;
  requestUnrestrictedBattery(): void;
}

/** Null on iOS and on builds without the module, where background refresh is off. */
export const backgroundRefreshNative =
  Platform.OS === "android"
    ? requireOptionalNativeModule<NativeBackgroundRefresh>("T3BackgroundRefresh")
    : null;
