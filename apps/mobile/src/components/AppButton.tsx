import { Pressable } from "react-native";
import { AppText } from "./AppText";
import { GlassFill } from "./GlassSurface";
import { useLiquidGlass } from "./useLiquidGlass";
import { cn } from "../lib/cn";

export interface AppButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly tone?: "primary" | "secondary" | "danger" | "text" | "contrast";
  readonly fullWidth?: boolean;
}

const TONE_CLASS_NAMES = {
  contrast: ["bg-foreground", "text-screen"],
  primary: ["bg-primary", "text-primary-foreground"],
  secondary: ["bg-secondary", "text-secondary-foreground"],
  danger: ["bg-danger", "text-danger-foreground"],
  text: ["bg-transparent", "text-primary-text"],
} as const;

export function AppButton(props: AppButtonProps) {
  const [containerClassName, labelClassName] = TONE_CLASS_NAMES[props.tone ?? "secondary"];
  const disabled = Boolean(props.disabled || props.loading);
  // Android: the plain capsule becomes glass; filled tones keep their color.
  const glass = useLiquidGlass().tier !== "none" && (props.tone ?? "secondary") === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={props.onPress}
      className={cn(
        "min-h-12 justify-center rounded-full px-6",
        !glass && "active:opacity-70",
        props.fullWidth ? "w-full" : "self-start",
        glass ? undefined : disabled ? "bg-subtle-strong" : containerClassName,
      )}
    >
      {glass ? <GlassFill interactive={!disabled} /> : null}
      <AppText
        className={cn(
          "text-center font-t3-medium",
          disabled ? "text-foreground-muted" : labelClassName,
        )}
      >
        {props.label}
      </AppText>
    </Pressable>
  );
}
