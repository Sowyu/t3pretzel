import { useSyncExternalStore } from "react";

import {
  getLiquidGlassSystemState,
  subscribeLiquidGlassSystemState,
  type LiquidGlassTier,
} from "../../modules/t3-liquid-glass";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";

/**
 * The glass tier Android surfaces render with: the device tier (API level,
 * live battery saver) unless the user turned Liquid glass off. Always "none"
 * on iOS, which keeps its own native glass.
 */
export function useLiquidGlass(): {
  readonly tier: LiquidGlassTier;
  readonly powerSaveMode: boolean;
} {
  const system = useSyncExternalStore(subscribeLiquidGlassSystemState, getLiquidGlassSystemState);
  const { liquidGlassEnabled } = useAppearancePreferences();
  return {
    tier: liquidGlassEnabled ? system.tier : "none",
    powerSaveMode: system.powerSaveMode,
  };
}
