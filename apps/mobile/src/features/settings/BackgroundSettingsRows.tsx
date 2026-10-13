import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { settleAsyncResult } from "@t3tools/client-runtime/state/runtime";
import * as Notifications from "expo-notifications";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Alert, AppState, Linking } from "react-native";

import { backgroundRefreshNative } from "../../connection/background-refresh-native";
import {
  backgroundRefreshEnabled,
  backgroundRefreshStatusSnapshot,
  reconcileBackgroundRefresh,
  refreshBackgroundRefreshStatus,
  subscribeBackgroundRefreshStatus,
} from "../../connection/background-refresh";
import {
  backgroundRefreshDeferral,
  backgroundRefreshRowSubtitle,
} from "../../connection/background-refresh-plan";
import { runtime } from "../../lib/runtime";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { supportsAndroidAgentNotifications } from "../agent-awareness/androidNotifications";
import { requestAgentNotificationPermission } from "../agent-awareness/notificationPermissions";
import {
  agentAwarenessPushRegistered,
  subscribeAgentAwarenessRegistrationStatus,
} from "../agent-awareness/remoteRegistration";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";

function useOnForeground(callback: () => void) {
  useEffect(() => {
    callback();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") callback();
    });
    return () => subscription.remove();
  }, [callback]);
}

/**
 * Background refresh, the battery exemption when Android is holding it back,
 * and local alerts for finished turns. Android only; renders nothing on builds
 * without the native modules.
 */
export function BackgroundSettingsRows() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = AsyncResult.isSuccess(preferencesResult) ? preferencesResult.value : {};
  const { status, readAtMs: nowMs } = useSyncExternalStore(
    subscribeBackgroundRefreshStatus,
    backgroundRefreshStatusSnapshot,
  );
  useOnForeground(
    useCallback(() => {
      void refreshBackgroundRefreshStatus();
    }, []),
  );

  if (backgroundRefreshNative === null) return null;
  const enabled = backgroundRefreshEnabled(preferences);
  const deferral = status === null ? null : backgroundRefreshDeferral(status, nowMs);

  return (
    <>
      <SettingsSwitchRow
        icon="arrow.clockwise"
        label="Background refresh"
        subtitle={
          nowMs === 0 ? "Checking" : backgroundRefreshRowSubtitle({ enabled, status, nowMs })
        }
        value={enabled}
        onValueChange={(next) => {
          savePreferences({ backgroundRefreshEnabled: next });
          void reconcileBackgroundRefresh(next);
        }}
      />
      {deferral !== null ? (
        <SettingsRow
          icon="bolt.circle"
          label="Allow unrestricted battery"
          value={
            deferral === "restricted"
              ? "Background usage is restricted, so Android never runs the refresh"
              : "Android is holding the refresh back to save battery"
          }
          valuePosition="below"
          onPress={() => backgroundRefreshNative?.requestUnrestrictedBattery()}
        />
      ) : null}
      {supportsAndroidAgentNotifications() ? (
        <TurnAlertsRow
          enabled={preferences.turnNotificationsEnabled !== false}
          onChange={(next) => savePreferences({ turnNotificationsEnabled: next })}
        />
      ) : null}
    </>
  );
}

function TurnAlertsRow(props: {
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
}) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const pushRegistered = useSyncExternalStore(
    subscribeAgentAwarenessRegistrationStatus,
    agentAwarenessPushRegistered,
  );
  useOnForeground(
    useCallback(() => {
      Notifications.getPermissionsAsync().then(
        (permissions) => setGranted(permissions.granted),
        () => setGranted(false),
      );
    }, []),
  );

  const enable = async () => {
    const result = await settleAsyncResult(() =>
      runtime.runPromiseExit(requestAgentNotificationPermission),
    );
    if (result._tag === "Success" && result.value.type === "granted") {
      setGranted(true);
      props.onChange(true);
      return;
    }
    setGranted(false);
    if (result._tag === "Success" && result.value.type === "denied" && !result.value.canAskAgain) {
      Alert.alert(
        "Notifications are off",
        "Turn on notifications for T3 Code in system Settings to get finished-turn alerts.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
      );
    }
  };

  return (
    <SettingsSwitchRow
      icon="bell.badge"
      label="Finished turn alerts"
      subtitle={
        granted === false
          ? "Notifications are off for T3 Code"
          : pushRegistered
            ? "For environments T3 Connect push does not reach"
            : "When a turn finishes while the app is in the background"
      }
      disabled={granted === null}
      value={props.enabled && granted === true}
      onValueChange={(next) => {
        if (next) void enable();
        else props.onChange(false);
      }}
    />
  );
}
