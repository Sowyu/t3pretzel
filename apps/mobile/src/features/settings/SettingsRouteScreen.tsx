import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useAuth, useUser } from "@clerk/expo";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, Platform, View } from "react-native";
import { deriveProjectGroupLabel } from "@t3tools/client-runtime/state/project-grouping";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { backgroundRefreshRowSubtitle } from "../../connection/background-refresh-plan";
import {
  backgroundRefreshEnabled,
  backgroundRefreshRecordSnapshot,
  backgroundRefreshStatusSnapshot,
  reconcileBackgroundRefreshRegistration,
  refreshBackgroundRefreshStatus,
  subscribeBackgroundRefreshRecord,
  subscribeBackgroundRefreshStatus,
} from "../../connection/background-refresh";
import {
  isBatteryOptimizationRestricted,
  requestUnrestrictedBattery,
  supportsBatteryOptimizationHint,
} from "../../lib/batteryOptimization";
import { relativeTime } from "../../lib/time";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { NativeHeaderToolbar } from "../../native/StackHeader";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";
import { useThinkingTracesEnabled } from "../../state/use-thinking-traces-enabled";

export function SettingsRouteScreen() {
  const navigation = useNavigation();
  const { layout } = useAdaptiveWorkspaceLayout();
  const content = hasCloudPublicConfig() ? (
    <ConfiguredSettingsRouteScreen />
  ) : (
    <LocalSettingsRouteScreen />
  );

  return (
    <>
      {Platform.OS === "ios" && layout.usesSplitView ? (
        <NativeHeaderToolbar placement="left">
          <NativeHeaderToolbar.Button
            accessibilityLabel="Go back"
            icon="chevron.left"
            onPress={() => navigation.goBack()}
          />
        </NativeHeaderToolbar>
      ) : null}
      <SettingsEnvironmentFilterHeader closeSettings />
      {Platform.OS === "android" ? (
        <SettingsScreen title="Settings" trailing={<AndroidSettingsEnvironmentFilter />}>
          {content}
        </SettingsScreen>
      ) : (
        content
      )}
    </>
  );
}

function ConfiguredSettingsRouteScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const accountLabel = !isLoaded
    ? "Checking"
    : !isSignedIn
      ? "Sign in"
      : (user?.primaryEmailAddress?.emailAddress ?? "Signed in");

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title="Connections">
          <SettingsRow
            icon="person.crop.circle"
            label="T3 Account"
            value={accountLabel}
            disabled={!isLoaded}
            onPress={() => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" })}
          />
          <SettingsRow
            icon="desktopcomputer"
            label="Environments"
            value={`${Object.keys(savedConnectionsById).length}`}
            valuePosition="trailing"
            target="SettingsEnvironments"
          />
          <SettingsRow icon="bell.badge" label="Notifications" target="SettingsNotifications" />
        </SettingsSection>

        <SettingsIndexSections />
      </ScrollView>
    </View>
  );
}

function LocalSettingsRouteScreen() {
  const insets = useSafeAreaInsets();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environmentCount = Object.keys(savedConnectionsById).length;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
      >
        <SettingsSection title="Connections">
          <SettingsRow
            icon="desktopcomputer"
            label="Environments"
            value={`${environmentCount}`}
            valuePosition="trailing"
            target="SettingsEnvironments"
          />
        </SettingsSection>

        <SettingsIndexSections />
      </ScrollView>
    </View>
  );
}

function SettingsIndexSections() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const thinkingTracesEnabled = useThinkingTracesEnabled();
  const { selectedTargets, projectGroups, selectedProjectKey } = useSettingsEnvironmentFilter();
  const noServerTargets = selectedTargets.length === 0;
  const selectedProject = projectGroups.find((group) => group.key === selectedProjectKey);
  const scopedProjectMembers =
    selectedProject?.members
      .map((member) => member.project)
      .filter((project) =>
        selectedTargets.some((target) => target.environmentId === project.environmentId),
      ) ?? [];
  const projectLabel =
    scopedProjectMembers.length > 0
      ? deriveProjectGroupLabel({
          representative: scopedProjectMembers[0]!,
          members: scopedProjectMembers,
        })
      : (selectedProject?.label ?? "Unavailable project");
  return (
    <>
      <SettingsSection title="Interface">
        <SettingsRow icon="paintbrush" label="Appearance" target="SettingsAppearance" />
        {Platform.OS === "ios" ? (
          <SettingsRow icon="keyboard" label="Keyboard" target="SettingsKeyboard" />
        ) : null}
      </SettingsSection>

      <SettingsSection title="Automations">
        <SettingsRow icon="clock" label="Scheduled tasks" target="SettingsScheduledTasks" />
      </SettingsSection>

      <SettingsSection title="Projects & threads">
        {selectedProjectKey !== null ? (
          <SettingsRow
            icon="folder"
            label="Overview"
            value={projectLabel}
            target="SettingsProjectOverview"
          />
        ) : null}
        <SettingsRow icon="folder" label="Organization" target="SettingsOrganization" />
        <SettingsRow icon="text.bubble" label="Thread behavior" target="SettingsThreads" />
        <SettingsRow icon="arrow.turn.left.up" label="Follow-ups" target="SettingsFollowUp" />
        <SettingsRow icon="archivebox" label="Archived Threads" target="SettingsArchive" />
      </SettingsSection>

      <SettingsSection title="Server settings">
        <SettingsRow
          icon="person.crop.circle"
          label="Provider accounts"
          target="SettingsProviderAccounts"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="text.bubble"
          label="New threads"
          target="SettingsEnvironmentNewThreads"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="arrow.triangle.branch"
          label="Source control"
          target="SettingsEnvironmentSourceControl"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="text.alignleft"
          label="Agent behavior"
          target="SettingsEnvironmentAgentBehavior"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="arrow.clockwise"
          label="Maintenance"
          target="SettingsEnvironmentMaintenance"
          disabled={noServerTargets}
        />
      </SettingsSection>

      <SettingsSection title="App">
        <BackgroundRefreshRow />
        <SettingsSwitchRow
          icon="brain"
          label="Thinking traces"
          subtitle="Show the model's reasoning in place as it streams"
          value={thinkingTracesEnabled}
          onValueChange={(value) => savePreferences({ thinkingTracesEnabled: value })}
        />
        <SettingsRow icon="chart.bar.xaxis" label="Usage" target="SettingsUsage" />
        <SettingsRow icon="info.circle" label="About T3 Code" target="SettingsAbout" />
      </SettingsSection>
    </>
  );
}

/**
 * The periodic headless shell refresh. Android decides when the worker actually
 * runs, so the row reports the last completed run and, when the OS is holding
 * the app back, the one thing the user can do about it.
 */
function BackgroundRefreshRow() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const enabled = AsyncResult.isSuccess(preferences)
    ? backgroundRefreshEnabled(preferences.value)
    : true;
  const record = useSyncExternalStore(
    subscribeBackgroundRefreshRecord,
    backgroundRefreshRecordSnapshot,
    backgroundRefreshRecordSnapshot,
  );
  const status = useSyncExternalStore(
    subscribeBackgroundRefreshStatus,
    backgroundRefreshStatusSnapshot,
    backgroundRefreshStatusSnapshot,
  );
  const [batteryRestricted, setBatteryRestricted] = useState(isBatteryOptimizationRestricted);
  // "12m ago" is computed at render; this tick keeps it true while Settings stays open.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMinuteTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Granting the exemption happens in the system settings app, so the answer
  // only ever changes while this screen is away.
  useEffect(() => {
    if (!supportsBatteryOptimizationHint()) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      setBatteryRestricted(isBatteryOptimizationRestricted());
      void refreshBackgroundRefreshStatus();
    });
    return () => subscription.remove();
  }, []);

  const subtitle = backgroundRefreshRowSubtitle({
    enabled,
    status,
    record,
    relativeLabel: record === null ? "" : relativeTime(new Date(record.finishedAtMs).toISOString()),
  });

  return (
    <>
      <SettingsSwitchRow
        icon="arrow.clockwise"
        label="Background refresh"
        subtitle={subtitle}
        value={enabled}
        onValueChange={(value) => {
          savePreferences({ backgroundRefreshEnabled: value });
          void reconcileBackgroundRefreshRegistration(value);
        }}
      />
      {enabled && batteryRestricted ? (
        <SettingsRow
          icon="bolt.circle"
          label="Allow unrestricted battery"
          value="Android is deferring background work for this app."
          onPress={() => void requestUnrestrictedBattery()}
        />
      ) : null}
    </>
  );
}
