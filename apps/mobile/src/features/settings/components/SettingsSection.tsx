import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../../components/AppText";

export function SettingsSection(props: {
  readonly title?: string;
  /** Small glyph before the title, e.g. the environment a group belongs to. */
  readonly titleIcon?: ReactNode;
  /** Sits at the end of the title row, e.g. a scope pill. */
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  /** Force the grouped card background; Android otherwise lists options flat. */
  readonly card?: boolean;
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
      <View
        className={
          props.card
            ? "overflow-hidden rounded-[24px] border-continuous bg-card"
            : "overflow-hidden rounded-[24px] border-continuous bg-card android:bg-transparent"
        }
      >
        {props.children}
      </View>
    </View>
  );
}
