import type { ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";

import { cn } from "../lib/cn";
import { AppText } from "./AppText";
import { SymbolView, type AppSymbolName } from "./AppSymbol";

export interface ListRowContentProps {
  readonly icon?: AppSymbolName;
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly disabled?: boolean;
}

// Android grouped rows draw an iOS-style top hairline, inset past the icon
// (16 padding + 24 icon + 12 gap) or the padding alone. ListSection clips the
// first row's line.
const androidSeparatorStyles = StyleSheet.create({
  base: { position: "absolute", top: 0, right: 0, height: StyleSheet.hairlineWidth },
  withIcon: { left: 52 },
  withoutIcon: { left: 16 },
});

/** Shared row geometry; controls own their behavior and accessibility. */
export function ListRowLayout({
  icon,
  label,
  description,
  detail,
  disabled,
  accessory,
}: ListRowContentProps & { readonly accessory?: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  // Leave the label room to wrap at accessibility text sizes.
  const stackDetail = fontScale >= 1.5;
  return (
    <View
      className={cn(
        "min-h-14 flex-row items-center gap-3 px-4 py-3",
        description && "min-h-18",
        disabled && "opacity-45",
      )}
    >
      {Platform.OS === "android" ? (
        <View
          pointerEvents="none"
          className="bg-foreground/10"
          style={[
            androidSeparatorStyles.base,
            icon ? androidSeparatorStyles.withIcon : androidSeparatorStyles.withoutIcon,
          ]}
        />
      ) : null}
      {icon ? (
        <View className="size-6 items-center justify-center">
          <SymbolView
            name={icon}
            size={22}
            tintColorClassName="accent-icon"
            type="monochrome"
            weight="regular"
          />
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-1">
        <AppText className="text-base text-foreground">{label}</AppText>
        {description ? (
          <AppText className="text-sm text-foreground-muted">{description}</AppText>
        ) : null}
        {detail && stackDetail ? (
          <AppText className="text-sm text-foreground-muted">{detail}</AppText>
        ) : null}
      </View>
      {detail && !stackDetail ? (
        <AppText
          className="max-w-[40%] shrink text-right text-sm text-foreground-muted"
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {detail}
        </AppText>
      ) : null}
      {accessory}
    </View>
  );
}
