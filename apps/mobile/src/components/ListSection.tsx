import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { cn } from "../lib/cn";
import { AppText as Text } from "./AppText";

// Android grouped cards float a little: a soft drop shadow, a tight contact
// shadow, and a lit top edge. Drawn once per card, nothing animates.
const CARD_DEPTH = {
  dark: "0 10px 28px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.45)",
  light: "0 8px 24px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.08)",
};
const CARD_EDGE = {
  dark: "inset 0 1px 0 rgba(255, 255, 255, 0.09), inset 0 0 0 0.5px rgba(255, 255, 255, 0.05)",
  light: "inset 0 0 0 0.5px rgba(0, 0, 0, 0.04)",
};

/** Rows in a section, looking through fragments. A custom row component counts as one. */
export function countSectionRows(children: ReactNode): number {
  return Children.toArray(children).reduce<number>(
    (count, child) =>
      count +
      (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
        ? countSectionRows(child.props.children)
        : 1),
    0,
  );
}

export function ListSection(props: {
  readonly title?: string;
  readonly titleIcon?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: string;
}) {
  return (
    <View className="gap-2">
      {props.title ? (
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-2 px-2">
            {props.titleIcon}
            <Text className="shrink text-sm font-t3-medium text-foreground-muted">
              {props.title}
            </Text>
          </View>
          {props.trailing}
        </View>
      ) : null}
      <GroupedCard>{props.children}</GroupedCard>
      {props.footer ? (
        <Text className="px-4 text-sm text-foreground-muted">{props.footer}</Text>
      ) : null}
    </View>
  );
}

/**
 * The inset-grouped card surface. Every grouped card uses it, so on Android
 * all of them float the same way; iOS stays flat. `className` styles the
 * card's content (padding, gap, alignment); `outerClassName` places the card
 * (margins, flex sizing).
 */
export function GroupedCard(props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly outerClassName?: string;
  readonly style?: StyleProp<ViewStyle>;
  /** Corner radius in dp; iOS inset-grouped cards use 24. */
  readonly radius?: number;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const depth = Platform.OS === "android" ? themeAppearance : null;
  const borderRadius = props.radius ?? 24;
  return (
    <View
      collapsable={false}
      className={cn("border-continuous", props.outerClassName)}
      style={[{ borderRadius }, depth ? { boxShadow: CARD_DEPTH[depth] } : undefined]}
    >
      <View
        collapsable={false}
        className={cn("overflow-hidden border-continuous bg-grouped-card", props.className)}
        style={[{ borderRadius }, props.style]}
      >
        {props.children}
      </View>
      {depth ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 border-continuous"
          style={{ borderRadius, boxShadow: CARD_EDGE[depth] }}
        />
      ) : null}
    </View>
  );
}
