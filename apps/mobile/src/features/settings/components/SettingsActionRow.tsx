import type { ComponentProps } from "react";
import { Platform, Pressable } from "react-native";

import { AppActivityIndicator } from "../../../components/AppActivityIndicator";
import { SymbolView } from "../../../components/AppSymbol";
import { AppText as Text } from "../../../components/AppText";
import { AndroidPressHighlight } from "../../../components/RowPressable";
import { cn } from "../../../lib/cn";

export function SettingsActionRow(props: {
  readonly icon: ComponentProps<typeof SymbolView>["name"];
  readonly label: string;
  readonly tone?: "default" | "danger";
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onPress: () => void;
}) {
  const danger = props.tone === "danger";
  const textClassName = danger ? "tabular-nums text-danger-foreground" : "text-foreground";
  const iconColorClassName = danger ? "accent-danger-foreground" : "accent-icon";
  const icon = (
    <SymbolView
      name={props.icon}
      size={22}
      tintColorClassName={iconColorClassName}
      type="monochrome"
      weight="regular"
    />
  );
  const spinner = props.loading ? (
    <AppActivityIndicator colorClassName={iconColorClassName} />
  ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
      className="relative flex-row items-center gap-4 overflow-hidden p-4 disabled:opacity-40"
    >
      {({ pressed }) => (
        <>
          <AndroidPressHighlight pressed={pressed} />
          {icon}
          <Text className={cn("flex-1 text-lg", textClassName)}>{props.label}</Text>
          {spinner}
        </>
      )}
    </Pressable>
  );
}
