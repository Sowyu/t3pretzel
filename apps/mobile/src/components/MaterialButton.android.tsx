import { ActivityIndicator, Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { AppText } from "./AppText";
import { GlassControl } from "./GlassControl";
import type { MaterialButtonProps } from "./MaterialButton";

const SOLID_CLASS_NAMES = {
  primary: ["bg-primary", "text-primary-foreground"],
  danger: ["bg-danger", "text-danger-foreground"],
} as const;

/** Fork pill: primary and danger keep solid fills, secondary sits on glass, text is bare. */
export function MaterialButton(props: MaterialButtonProps) {
  const tone = props.tone ?? "secondary";
  const disabled = Boolean(props.disabled || props.loading);
  const solid = tone === "primary" || tone === "danger" ? SOLID_CLASS_NAMES[tone] : null;
  const width = props.fullWidth ? "w-full" : "self-start";
  // Padding lives on the inner row: on liquid glass the control's own padding
  // would inset the material and leave an unglazed ring.
  const content = (
    <View className="min-h-12 flex-row items-center justify-center gap-2 px-6">
      {props.loading ? (
        <ActivityIndicator size="small" colorClassName="accent-foreground-muted" />
      ) : null}
      <AppText
        className={cn(
          "text-center font-t3-medium",
          disabled
            ? "text-foreground-muted"
            : solid
              ? solid[1]
              : tone === "text"
                ? "text-primary-text"
                : "text-foreground",
        )}
      >
        {props.label}
      </AppText>
    </View>
  );
  const pressableProps = {
    accessibilityRole: "button" as const,
    accessibilityLabel: props.label,
    accessibilityState: { disabled, busy: Boolean(props.loading) },
    disabled,
    onPress: props.onPress,
  };
  if (tone === "secondary") {
    return (
      <Pressable {...pressableProps} className={cn("active:opacity-70", width)}>
        <GlassControl className={cn("rounded-full", width)} radius={24}>
          {content}
        </GlassControl>
      </Pressable>
    );
  }
  return (
    <Pressable
      {...pressableProps}
      className={cn(
        "rounded-full active:opacity-70",
        width,
        disabled && solid ? "bg-subtle-strong" : (solid?.[0] ?? "bg-transparent"),
      )}
    >
      {content}
    </Pressable>
  );
}
