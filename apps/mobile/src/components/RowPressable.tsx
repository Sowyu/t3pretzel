import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";

import { cn } from "../lib/cn";
import { useHoverGesture } from "../lib/useHoverGesture";

/** Pointer feedback layered over selection. Touch-down may be the start of a scroll. */
export function RowPressable({
  children,
  className,
  interactionClassName = "bg-row-hover",
  interactionOpacity = 1,
  pressHighlight = false,
  ...props
}: Omit<ComponentProps<typeof Pressable>, "children"> & {
  readonly children: ReactNode;
  readonly interactionClassName?: string;
  readonly interactionOpacity?: number;
  /** Android only: tint the row while pressed, like a UITableView cell highlight. */
  readonly pressHighlight?: boolean;
}) {
  const { hovered, hoverGesture } = useHoverGesture(props.disabled ?? false);
  const highlightOnPress = pressHighlight && Platform.OS === "android";
  return (
    <GestureDetector gesture={hoverGesture}>
      <Pressable
        // Give the scroll view time to claim drags before the highlight shows.
        unstable_pressDelay={highlightOnPress ? 50 : undefined}
        {...props}
        className={cn("relative overflow-hidden", className)}
      >
        {({ pressed }) => (
          <>
            <View
              pointerEvents="none"
              className={cn("absolute inset-0", interactionClassName)}
              style={{ opacity: props.disabled || !hovered ? 0 : interactionOpacity }}
            />
            {pressHighlight && !props.disabled ? <AndroidPressHighlight pressed={pressed} /> : null}
            {children}
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}

/**
 * The iOS-style row highlight Android shows instead of a ripple. Render it as
 * the first child of a `relative overflow-hidden` Pressable.
 */
export function AndroidPressHighlight(props: { readonly pressed: boolean }) {
  if (Platform.OS !== "android" || !props.pressed) return null;
  return <View pointerEvents="none" className="absolute inset-0 bg-foreground opacity-10" />;
}
