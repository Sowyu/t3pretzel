import { useSyncExternalStore } from "react";

import {
  getLiquidGlassSystemState,
  subscribeLiquidGlassSystemState,
} from "../../../../../modules/t3-liquid-glass";
import { SettingsSection } from "../../components/SettingsSection";
import { SettingsSwitchRow } from "../../components/SettingsSwitchRow";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

/** Android only: the Liquid glass switch, and why the device may be overriding it. */
export function GlassAppearanceSection() {
  const { isReady, liquidGlassEnabled, setLiquidGlassEnabled } = useAppearancePreferences();
  const system = useSyncExternalStore(subscribeLiquidGlassSystemState, getLiquidGlassSystemState);
  const subtitle = !liquidGlassEnabled
    ? "Glass controls use a solid fill"
    : system.powerSaveMode
      ? "Off while Battery Saver is on"
      : system.tier === "none"
        ? "Needs Android 12 or later"
        : system.tier === "blur"
          ? "Blur only; the lens needs Android 13"
          : "Headers, tab bar, composer and menus refract what is under them";
  return (
    <SettingsSection title="Materials">
      <SettingsSwitchRow
        disabled={!isReady}
        icon="sparkles"
        label="Liquid glass"
        subtitle={subtitle}
        onValueChange={setLiquidGlassEnabled}
        value={liquidGlassEnabled}
      />
    </SettingsSection>
  );
}
