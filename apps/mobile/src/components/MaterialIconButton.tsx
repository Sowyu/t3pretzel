import { cn } from "../lib/cn";
import { Pressable } from "react-native";

import { SymbolView, type AppSymbolName } from "./AppSymbol";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

const VARIANT_CLASS_NAMES = {
  standard: ["", "accent-foreground"],
  primary: ["rounded-full bg-primary", "accent-primary-foreground"],
  danger: ["rounded-full bg-danger", "accent-danger-foreground"],
  tonal: ["rounded-full bg-secondary", "accent-secondary-foreground"],
} as const;

/** Android icon button with a 48dp target; press feedback is an opacity dip like iOS. */
export function MaterialIconButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly variant?: "standard" | "primary" | "tonal" | "danger";
  readonly tintColorClassName?: string;
}) {
  const { iconSize, buttonSize } = useAndroidControlSizing();
  const variant = props.variant ?? "standard";
  const [containerClassName, iconTintClassName] = VARIANT_CLASS_NAMES[variant];
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(props.disabled), selected: props.selected }}
      className={cn(
        "items-center justify-center active:opacity-50",
        props.disabled && variant !== "standard"
          ? "rounded-full bg-subtle-strong"
          : containerClassName,
      )}
      style={{ width: buttonSize, height: buttonSize }}
    >
      <SymbolView
        name={props.icon}
        size={iconSize}
        tintColorClassName={
          props.disabled
            ? "accent-icon-subtle"
            : variant === "standard"
              ? (props.tintColorClassName ?? iconTintClassName)
              : iconTintClassName
        }
      />
    </Pressable>
  );
}
