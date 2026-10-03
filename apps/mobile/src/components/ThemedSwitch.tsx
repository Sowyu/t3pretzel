import { Platform, Switch } from "react-native";

import { LiquidSwitch } from "./LiquidSwitch";
import type { ThemedSwitchProps } from "./MaterialSwitch.types";

export type { ThemedSwitchProps } from "./MaterialSwitch.types";

/** Every toggle in the app goes through here: iOS keeps its own switch, Android draws the iOS one. */
export function ThemedSwitch(props: ThemedSwitchProps) {
  if (Platform.OS === "android") {
    return (
      <LiquidSwitch
        accessibilityHint={props.accessibilityHint}
        accessibilityLabel={props.accessibilityLabel}
        disabled={props.disabled}
        onValueChange={props.onValueChange ?? undefined}
        style={props.style}
        testID={props.testID}
        value={Boolean(props.value)}
      />
    );
  }

  return (
    <Switch
      {...props}
      ios_backgroundColorClassName="accent-switch-inactive-track"
      trackColorOffClassName="accent-switch-inactive-track"
      trackColorOnClassName="accent-switch-active-track"
    />
  );
}
