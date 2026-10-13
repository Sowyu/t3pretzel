import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { View } from "react-native";

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
      <View className="overflow-hidden rounded-[24px] border-continuous bg-grouped-card">
        {props.children}
      </View>
      {props.footer ? (
        <Text className="px-4 text-sm text-foreground-muted">{props.footer}</Text>
      ) : null}
    </View>
  );
}
