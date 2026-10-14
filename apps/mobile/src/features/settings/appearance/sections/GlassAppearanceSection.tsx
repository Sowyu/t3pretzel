import { getLiquidGlassDeviceTier } from "../../../../../modules/t3-liquid-glass";
import { SettingsSection } from "../../components/SettingsSection";
import { SettingsSwitchRow } from "../../components/SettingsSwitchRow";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

/** Android only: the Liquid glass switch, and what this device draws when it is on. */
export function GlassAppearanceSection() {
  const { isReady, liquidGlassEnabled, setLiquidGlassEnabled } = useAppearancePreferences();
  const tier = getLiquidGlassDeviceTier();
  const subtitle = !liquidGlassEnabled
    ? "Glass controls use a solid fill"
    : tier === "none"
      ? "Needs Android 12 or later"
      : tier === "blur"
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
