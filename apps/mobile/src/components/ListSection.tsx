import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { AppText as Text } from "./AppText";

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

// Android draws iOS 26 inset-grouped cards: 26dp corners on multi-row cards, a
// rounded rectangle (not a capsule) for a lone row. Rows draw their own top
// hairline (see ListRowLayout); the content shifts up one hairline so the
// card clips the first row's.
const androidCardStyles = StyleSheet.create({
  multi: { borderRadius: 26 },
  single: { borderRadius: 18 },
  content: { marginTop: -StyleSheet.hairlineWidth },
});

export function ListSection(props: {
  readonly title?: string;
  readonly titleIcon?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: string;
}) {
  const isAndroid = Platform.OS === "android";
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
      {isAndroid ? (
        <View
          className="overflow-hidden bg-grouped-card"
          style={
            countSectionRows(props.children) > 1
              ? androidCardStyles.multi
              : androidCardStyles.single
          }
        >
          <View style={androidCardStyles.content}>{props.children}</View>
        </View>
      ) : (
        <View className="overflow-hidden rounded-[24px] border-continuous bg-grouped-card">
          {props.children}
        </View>
      )}
      {props.footer ? (
        <Text className="px-4 text-sm text-foreground-muted">{props.footer}</Text>
      ) : null}
    </View>
  );
}
