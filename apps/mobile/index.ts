import { registerRootComponent } from "expo";
import "react-native-gesture-handler";
import { LogBox } from "react-native";
import { featureFlags } from "react-native-screens";

import App from "./src/App";
// Importing this defines the periodic refresh task. It has to happen in the
// global scope: a headless launch runs the bundle and immediately asks for it.
import { startBackgroundRefresh } from "./src/connection/background-refresh";

// Required for react-native-screens' iOS FormSheet sizing fix when a nested
// native stack is rendered inside a non-fitToContents formSheet.
featureFlags.experiment.synchronousScreenUpdatesEnabled = true;

if (process.env.EXPO_PUBLIC_SHOWCASE === "1") {
  LogBox.ignoreAllLogs();
}

registerRootComponent(App);

// Matching the OS registration to the saved catalog reads from disk, so it runs
// alongside the first render instead of in front of it.
void startBackgroundRefresh();
