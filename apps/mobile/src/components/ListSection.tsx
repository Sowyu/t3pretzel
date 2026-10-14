import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Platform, View } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
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
  const { themeAppearance } = useAppearancePreferences();
  const depth = Platform.OS === "android" ? themeAppearance : null;
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
      <View
        className="rounded-[24px] border-continuous"
        style={depth ? { boxShadow: CARD_DEPTH[depth] } : undefined}
      >
        <View className="overflow-hidden rounded-[24px] border-continuous bg-grouped-card">
          {props.children}
        </View>
        {depth ? (
          <View
            pointerEvents="none"
            className="absolute inset-0 rounded-[24px] border-continuous"
            style={{ boxShadow: CARD_EDGE[depth] }}
          />
        ) : null}
      </View>
      {props.footer ? (
        <Text className="px-4 text-sm text-foreground-muted">{props.footer}</Text>
      ) : null}
    </View>
  );
}
