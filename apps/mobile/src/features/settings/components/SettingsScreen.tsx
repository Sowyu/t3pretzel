import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import type { ScreenHeaderProps } from "../../../components/ScreenHeader.types";
import { ScreenHeader } from "../../../components/ScreenHeader";

export function SettingsScreen(
  props: Pick<ScreenHeaderProps, "title" | "actions" | "trailing"> & {
    readonly children: ReactNode;
  },
) {
  const navigation = useNavigation();

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScreenHeader
        title={props.title}
        actions={props.actions}
        trailing={Platform.OS === "android" ? props.trailing : undefined}
        sidebar={false}
        onBack={() => navigation.goBack()}
      />
      {props.children}
    </View>
  );
}
