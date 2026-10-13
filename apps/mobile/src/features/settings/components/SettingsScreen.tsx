import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import type { ScreenHeaderProps } from "../../../components/ScreenHeader.types";
import { ScreenHeader } from "../../../components/ScreenHeader";
import { AndroidHeaderIconButton } from "../../../components/AndroidScreenHeader";
import { useInAndroidPageSheet } from "../../../components/AndroidPageSheet";
import { MaterialScreenContent as SettingsScreenContent } from "../../../components/MaterialScreenContent";

export { SettingsScreenContent };

export function SettingsScreen(
  props: Pick<ScreenHeaderProps, "title" | "actions" | "trailing"> & {
    readonly children: ReactNode;
    /** A native form sheet already owns its rounded outer frame. */
    readonly formSheet?: boolean;
    /** The sheet's root screen closes with a trailing X, like iOS, instead of a back chevron. */
    readonly closeSheet?: boolean;
  },
) {
  const navigation = useNavigation();
  const closes = useInAndroidPageSheet() && props.closeSheet === true;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScreenHeader
        title={props.title}
        actions={props.actions}
        trailing={
          Platform.OS !== "android" ? undefined : closes ? (
            <>
              {props.trailing}
              <AndroidHeaderIconButton
                accessibilityLabel={`Close ${props.title.toLowerCase()}`}
                icon="xmark"
                onPress={() => navigation.goBack()}
              />
            </>
          ) : (
            props.trailing
          )
        }
        sidebar={false}
        onBack={closes ? undefined : () => navigation.goBack()}
        hideBottomBorder={!props.formSheet}
      />
      {props.formSheet ? (
        props.children
      ) : (
        <SettingsScreenContent>{props.children}</SettingsScreenContent>
      )}
    </View>
  );
}
