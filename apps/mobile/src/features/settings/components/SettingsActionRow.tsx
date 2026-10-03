import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable } from "react-native";

import { SymbolView } from "../../../components/AppSymbol";
import { AppText as Text } from "../../../components/AppText";
import { cn } from "../../../lib/cn";

/** A one-shot command row (restart, clear, sign out). No chevron: it acts, it does not navigate. */
export function SettingsActionRow(props: {
  readonly icon: ComponentProps<typeof SymbolView>["name"];
  readonly label: string;
  readonly tone?: "default" | "danger";
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onPress: () => void;
}) {
  const danger = props.tone === "danger";
  const iconColorClassName = danger ? "accent-danger-foreground" : "accent-icon";

  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled, busy: props.loading }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn(
        "flex-row items-center gap-4 p-4 active:opacity-70",
        props.disabled && "opacity-[0.45]",
      )}
    >
      <SymbolView
        name={props.icon}
        size={22}
        tintColorClassName={iconColorClassName}
        type="monochrome"
        weight="regular"
      />
      <Text className={cn("flex-1 text-lg", danger ? "text-danger-foreground" : "text-foreground")}>
        {props.label}
      </Text>
      {props.loading ? <ActivityIndicator colorClassName={iconColorClassName} /> : null}
    </Pressable>
  );
}
