import { getLiquidGlassDeviceTier, type LiquidGlassTier } from "../../modules/t3-liquid-glass";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";

/**
 * The glass tier Android surfaces render with: what the device can draw
 * unless the user turned Liquid glass off. Always "none" on iOS, which keeps
 * its own native glass.
 */
export function useLiquidGlass(): { readonly tier: LiquidGlassTier } {
  const { liquidGlassEnabled } = useAppearancePreferences();
  return { tier: liquidGlassEnabled ? getLiquidGlassDeviceTier() : "none" };
}
