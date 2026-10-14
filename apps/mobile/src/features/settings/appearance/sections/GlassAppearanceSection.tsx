import { getLiquidGlassDeviceTier } from "../../../../../modules/t3-liquid-glass";
import { SettingsSection } from "../../components/SettingsSection";
import { SettingsSwitchRow } from "../../components/SettingsSwitchRow";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

/** Android only: the Liquid glass and iOS status bar switches. */
export function GlassAppearanceSection() {
  const {
    isReady,
    liquidGlassEnabled,
    setLiquidGlassEnabled,
    iosStatusBarEnabled,
    setIosStatusBarEnabled,
  } = useAppearancePreferences();
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
      <SettingsSwitchRow
        disabled={!isReady}
        icon="iphone"
        label="iOS status bar"
        subtitle={
          iosStatusBarEnabled
            ? "Swipe down from the top to see the system bar"
            : "The system status bar shows"
        }
        onValueChange={setIosStatusBarEnabled}
        value={iosStatusBarEnabled}
      />
    </SettingsSection>
  );
}
