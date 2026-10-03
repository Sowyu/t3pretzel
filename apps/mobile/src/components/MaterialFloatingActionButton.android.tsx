import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { cn } from "../lib/cn";
import { AppText } from "./AppText";
import { SymbolView, type AppSymbolName } from "./AppSymbol";
import { GlassControl } from "./GlassControl";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

/**
 * Fork floating actions: an extended action is the solid pill the fork used for
 * "New Task", a round one is a glass circle like the header controls.
 */
export function MaterialFloatingActionButton(props: {
  readonly onPress: () => void;
  readonly label: string;
  readonly icon: AppSymbolName;
  readonly variant?: "extended" | "large";
  readonly expanded?: boolean;
  readonly tone?: "primary" | "secondary";
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { iconSize, smallIconSize, fabSize } = useAndroidControlSizing();
  const primary = props.tone === "primary";
  const extended = props.variant === "extended" && props.expanded !== false;
  const iconTint = primary ? "accent-primary-foreground" : "accent-icon";
  const pressableProps = {
    accessibilityRole: "button" as const,
    accessibilityLabel: props.label,
    onPress: props.onPress,
  };

  if (extended) {
    return (
      <Pressable
        {...pressableProps}
        className={cn(
          "flex-row items-center justify-center gap-2 self-center rounded-full px-5 py-3 active:opacity-70",
          primary ? "bg-primary" : "bg-subtle",
          props.className,
        )}
        style={props.style}
      >
        <SymbolView name={props.icon} size={smallIconSize} tintColorClassName={iconTint} />
        <AppText
          className={cn(
            "text-base font-t3-bold",
            primary ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {props.label}
        </AppText>
      </Pressable>
    );
  }

  const size = { width: fabSize, height: fabSize };
  const icon = <SymbolView name={props.icon} size={iconSize} tintColorClassName={iconTint} />;
  return (
    <Pressable {...pressableProps} className={props.className} style={props.style}>
      {primary ? (
        <View
          className="items-center justify-center rounded-full bg-primary shadow-lg"
          style={size}
        >
          {icon}
        </View>
      ) : (
        <GlassControl className="rounded-full" radius={fabSize / 2} style={size}>
          {icon}
        </GlassControl>
      )}
    </Pressable>
  );
}
