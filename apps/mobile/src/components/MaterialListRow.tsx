import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { AppText } from "./AppText";
import { SymbolView } from "./AppSymbol";
import { AndroidPressHighlight } from "./RowPressable";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

/** Navigation and selection row for Android-only screens. Group rows in one card. */
export function MaterialListRow({
  title,
  titleClassName,
  subtitle,
  subtitleNumberOfLines,
  subtitleEllipsizeMode,
  leading,
  trailing,
  className,
  ...props
}: Omit<ComponentProps<typeof Pressable>, "children"> & {
  readonly title: string;
  readonly titleClassName?: string;
  readonly subtitle?: string | null;
  readonly subtitleNumberOfLines?: ComponentProps<typeof AppText>["numberOfLines"];
  readonly subtitleEllipsizeMode?: ComponentProps<typeof AppText>["ellipsizeMode"];
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}) {
  const { smallIconSize } = useAndroidControlSizing();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join(", ")}
      // Give the scroll view time to claim drags before the highlight shows.
      unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
      {...props}
      className={cn(
        "relative flex-row items-center gap-3 overflow-hidden bg-card px-4 py-3",
        subtitle ? "min-h-18" : "min-h-14",
        props.disabled && "opacity-45",
        className,
      )}
    >
      {({ pressed }) => (
        <>
          <AndroidPressHighlight pressed={pressed && !props.disabled} />
          {leading ? <View className="size-6 items-center justify-center">{leading}</View> : null}
          <View className="min-w-0 flex-1 gap-1">
            <AppText className={cn("text-base text-foreground", titleClassName)} numberOfLines={2}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText
                className="text-sm text-foreground-muted"
                ellipsizeMode={subtitleEllipsizeMode}
                numberOfLines={subtitleNumberOfLines ?? 2}
              >
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {trailing !== undefined ? (
            trailing
          ) : !props.disabled ? (
            <SymbolView
              name="chevron.right"
              size={smallIconSize}
              tintColorClassName="accent-chevron"
              weight="semibold"
            />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
