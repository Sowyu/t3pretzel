import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { SymbolView, type AppSymbolName } from "./AppSymbol";
import { cn } from "../lib/cn";

/** The tablet empty-detail action. */
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      className={cn(
        "min-h-14 min-w-14 flex-row items-center justify-center gap-2 rounded-2xl px-4",
        props.tone === "primary" ? "bg-primary" : "bg-secondary",
        props.className,
      )}
      style={props.style}
    >
      <SymbolView
        name={props.icon}
        size={24}
        tintColorClassName={
          props.tone === "primary" ? "accent-primary-foreground" : "accent-secondary-foreground"
        }
      />
      {props.variant === "extended" && props.expanded !== false ? (
        <AppText
          className={cn(
            "text-sm",
            props.tone === "primary" ? "text-primary-foreground" : "text-secondary-foreground",
          )}
        >
          {props.label}
        </AppText>
      ) : null}
    </Pressable>
  );
}
