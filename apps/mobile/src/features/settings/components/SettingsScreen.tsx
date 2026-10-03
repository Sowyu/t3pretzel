import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import { AndroidScreenHeader } from "../../../components/AndroidScreenHeader";
import { NativeStackScreenOptions } from "../../../native/StackHeader";

/**
 * Frame for a pushed settings screen. Android draws the fork's glass header in
 * the screen; iOS keeps the native bar and only takes the title from here.
 * `trailing` sits at the end of the Android header (the environment filter).
 */
export function SettingsScreen(props: {
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
}) {
  const navigation = useNavigation();

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader
            title={props.title}
            trailing={props.trailing}
            onBack={() => navigation.goBack()}
          />
        </>
      ) : (
        <NativeStackScreenOptions options={{ title: props.title }} />
      )}
      {props.children}
    </View>
  );
}
