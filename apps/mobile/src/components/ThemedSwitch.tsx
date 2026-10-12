import { Switch, type SwitchProps } from "react-native";

export type ThemedSwitchProps = Pick<
  SwitchProps,
  | "accessibilityHint"
  | "accessibilityLabel"
  | "disabled"
  | "onValueChange"
  | "style"
  | "testID"
  | "value"
>;

export function ThemedSwitch(props: ThemedSwitchProps) {
  return (
    <Switch
      {...props}
      ios_backgroundColorClassName="accent-switch-inactive-track"
      trackColorOffClassName="accent-switch-inactive-track"
      trackColorOnClassName="accent-switch-active-track"
    />
  );
}
