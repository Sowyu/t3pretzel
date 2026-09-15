import { LiquidGlassView } from "@sbaiahmed1/react-native-blur";
import { BlurView } from "expo-blur";
import { useContext, type RefObject } from "react";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { GlassBlurTargetContext } from "../lib/glassBlurTarget";
import { themeColorWithAlpha } from "../lib/mobileTheme";

/** Frosted backdrop for containers that clip their children to their shape. */
// Android 13 can run the AGSL liquid glass shader: refraction, dispersion,
// blur and tint from a live capture of the screen behind the view.
const supportsLiquidGlass = Platform.OS === "android" && Platform.Version >= 33;

export function GlassBackdrop(props: {
  readonly fallbackColor?: ColorValue;
  readonly blurTarget?: RefObject<View | null>;
  /** Corner radius of the clipping surface; the glass lens bevel follows it. */
  readonly borderRadius?: number;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const inheritedBlurTarget = useContext(GlassBlurTargetContext);
  const target = props.blurTarget ?? inheritedBlurTarget;
  const colorStyle =
    props.fallbackColor === undefined
      ? undefined
      : { backgroundColor: themeColorWithAlpha(String(props.fallbackColor), 1) };
  if (supportsLiquidGlass) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LiquidGlassView
          glassType="regular"
          glassTintColor={
            props.fallbackColor === undefined ? undefined : String(props.fallbackColor)
          }
          glassOpacity={themeAppearance === "dark" ? 0.55 : 0.4}
          isInteractive={false}
          style={[StyleSheet.absoluteFill, { borderRadius: props.borderRadius ?? 0 }]}
        />
      </View>
    );
  }
  const supportsBlur =
    Platform.OS === "ios" ||
    (Platform.OS === "android" && Platform.Version >= 31 && target !== undefined);
  return (
    <>
      {/* Android samples a separate target. An opaque backing prevents any
          transparent pixels in that sample from exposing the unblurred feed.
          iOS samples its actual backdrop, so a backing there would hide it. */}
      {Platform.OS === "android" ? (
        <View pointerEvents="none" className="absolute inset-0 bg-card" style={colorStyle} />
      ) : null}
      {supportsBlur ? (
        <BlurView
          pointerEvents="none"
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={80}
          tint={themeAppearance === "dark" ? "dark" : "default"}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        pointerEvents="none"
        className="absolute inset-0 bg-card"
        style={[
          colorStyle,
          { opacity: supportsBlur ? (themeAppearance === "dark" ? 0.25 : 0.55) : 1 },
        ]}
      />
    </>
  );
}
