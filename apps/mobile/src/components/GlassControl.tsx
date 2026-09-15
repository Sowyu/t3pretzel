import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { cn } from "../lib/cn";
import { useUniwindTheme } from "../lib/useUniwindTheme";
import { GlassSurface, supportsLiquidGlass } from "./GlassSurface";

/**
 * Background for a round or pill-shaped control (header buttons, menu
 * triggers). Liquid glass where the platform has it, the flat subtle fill
 * everywhere else. Wrap the control's content, keep the Pressable outside.
 */
export function GlassControl(props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
  /** Corner radius of the control; half its height for a capsule. */
  readonly radius: number;
}) {
  const colors = useUniwindTheme();
  // Callers style the flat pill with fills and shadows; on glass those would
  // paint over the material, so only the layout classes carry across.
  const layoutClassName = props.className
    ?.split(/\s+/)
    .filter((token) => !/^(bg-|shadow|border)/.test(token))
    .join(" ");
  if (!supportsLiquidGlass) {
    return (
      <View className={cn("bg-subtle", props.className)} style={props.style}>
        {props.children}
      </View>
    );
  }
  return (
    <GlassSurface
      chrome="none"
      fallbackClassName={cn("border border-border-subtle", layoutClassName)}
      fallbackColor={colors["--color-card"]}
      glassEffectStyle="clear"
      style={[
        { borderRadius: props.radius, alignItems: "center", justifyContent: "center" },
        props.style,
      ]}
    >
      {props.children}
    </GlassSurface>
  );
}
