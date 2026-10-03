import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../../components/AppText";

export function SettingsSection(props: {
  readonly title?: string;
  readonly titleIcon?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
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
      {/* Android lists options flat on the screen; iOS keeps the grouped card. */}
      <View className="overflow-hidden rounded-[24px] border-continuous bg-grouped-card android:bg-transparent">
        {props.children}
      </View>
    </View>
  );
}
