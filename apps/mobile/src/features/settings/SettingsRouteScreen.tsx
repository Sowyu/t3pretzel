import { useAuth, useUser } from "@clerk/expo";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { deriveProjectGroupLabel } from "@t3tools/client-runtime/state/project-grouping";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
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
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { WorkspaceSidebarToolbar } from "../layout/workspace-sidebar-toolbar";
import { useThreadListV2Enabled } from "../threads/use-thread-list-v2-enabled";
import {
  nightlyUpdaterAction,
  nightlyUpdaterActionLabel,
  nightlyUpdaterStatusLabel,
  shortCommit,
} from "../updates/nightly-updater";
import { useNightlyUpdater, type NightlyUpdaterBinding } from "../updates/nightly-updater-runtime";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";

export function SettingsRouteScreen() {
  const navigation = useNavigation();

  return (
    <>
      <WorkspaceSidebarToolbar />
      {/* iOS: scope filter plus the close button in the native bar. */}
      <SettingsEnvironmentFilterHeader closeSettings />
      {Platform.OS === "android" ? (
        <>
          {/* Android renders its own in-screen header instead of the native bar. */}
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader
            title="Settings"
            trailing={<AndroidSettingsEnvironmentFilter />}
            onBack={() => navigation.goBack()}
          />
        </>
      ) : null}
      <View collapsable={false} className="flex-1 bg-sheet">
        <SettingsIndexScrollView>
          {hasCloudPublicConfig() ? <ConnectedSettingsSections /> : <LocalSettingsSections />}
          <SettingsIndexSections />
        </SettingsIndexScrollView>
      </View>
    </>
  );
}

function SettingsIndexScrollView(props: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      className="flex-1"
      contentContainerClassName="gap-6 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
    >
      {props.children}
    </ScrollView>
  );
}

function LocalSettingsSections() {
  const { savedConnectionsById } = useSavedRemoteConnections();
  return (
    <SettingsSection title="Connections">
      <SettingsRow
        icon="desktopcomputer"
        label="Environments"
        value={`${Object.keys(savedConnectionsById).length}`}
        target="SettingsEnvironments"
      />
    </SettingsSection>
  );
}

function ConnectedSettingsSections() {
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
    <>
      <View className="gap-3">
        <SettingsSection title="Account">
          <SettingsRow
            icon="person.crop.circle"
            label="T3 Account"
            value={accountLabel}
            disabled={!isLoaded}
            onPress={() => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" })}
          />
        </SettingsSection>
        <Text className="px-2 text-sm text-foreground-muted">
          T3 Code works locally without signing in. Cloud features are optional.
        </Text>
      </View>
      <SettingsSection title="Connections">
        <SettingsRow
          icon="desktopcomputer"
          label="Environments"
          value={`${Object.keys(savedConnectionsById).length}`}
          target="SettingsEnvironments"
        />
        <SettingsRow icon="bell.badge" label="Notifications" target="SettingsNotifications" />
      </SettingsSection>
    </>
  );
}

/**
 * Everything below Connections. Server rows act on the environments and
 * project picked in the header's scope filter, so they disable when the
 * filter leaves no connected environment.
 */
function SettingsIndexSections() {
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
        <SettingsRow icon="folder" label="Organization" target="SettingsProjectGrouping" />
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

      <LegacySettingsSection />

      <ExperimentalSettingsSection />

      <AppSettingsSection />
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
        <Pressable
          accessibilityLabel="Allow unrestricted battery"
          accessibilityRole="button"
          onPress={() => void requestUnrestrictedBattery()}
          className="flex-row items-center gap-4 border-t border-border-subtle p-4 active:opacity-70"
        >
          <SymbolView
            name="bolt"
            size={22}
            tintColorClassName={"accent-icon"}
            type="monochrome"
            weight="regular"
          />
          <View className="min-w-0 flex-1">
            <Text className="text-lg text-foreground">Allow unrestricted battery</Text>
            <Text className="text-sm text-foreground-muted">
              Android is deferring background work for this app.
            </Text>
          </View>
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * Opt-ins that depend on something outside the app. Thinking traces only have
 * anything to render against a server that sends reasoning messages, so the
 * row stays off until someone goes looking for it.
 */
function ExperimentalSettingsSection() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const thinkingTracesEnabled =
    AsyncResult.isSuccess(preferences) && preferences.value.thinkingTracesEnabled === true;

  return (
    <View className="gap-3">
      <SettingsSection title="Experimental">
        <SettingsSwitchRow
          icon="brain"
          label="Thinking traces"
          value={thinkingTracesEnabled}
          onValueChange={(value) => savePreferences({ thinkingTracesEnabled: value })}
        />
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        {
          "Shows the model's reasoning as it streams. Needs a server from 0.0.43 (nightlies from 2026-09-16)."
        }
      </Text>
    </View>
  );
}

/**
 * Device-local legacy toggles. Mobile has no client-settings sync, so this is
 * the counterpart of web's Settings → General → Legacy features backed by
 * mobile preferences.
 */
function LegacySettingsSection() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const threadListV2Enabled = useThreadListV2Enabled();
  const planModeEnabled =
    AsyncResult.isSuccess(preferences) && preferences.value.planModeEnabled === true;

  return (
    <View className="gap-3">
      <SettingsSection title="Legacy">
        <SettingsSwitchRow
          icon="sidebar.left"
          label="Legacy Thread List"
          value={!threadListV2Enabled}
          onValueChange={(value) => savePreferences({ legacyThreadListEnabled: value })}
        />
        <SettingsSwitchRow
          icon="hammer"
          label="Plan Mode"
          value={planModeEnabled}
          onValueChange={(value) => savePreferences({ planModeEnabled: value })}
        />
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        Opt into retired interfaces kept for compatibility. Plan Mode restores the Build/Plan
        control; otherwise every task runs in Build mode.
      </Text>
    </View>
  );
}

function AppSettingsSection() {
  // Nightly builds sideload a whole APK from GitHub; their row lives here so
  // the update action is one tap from the settings index. Other variants show
  // their version under About.
  const nightly = useNightlyUpdater();

  return (
    <SettingsSection title="App">
      <BackgroundRefreshRow />
      <SettingsRow icon="chart.bar.xaxis" label="Usage" target="SettingsUsage" />
      <SettingsRow icon="info.circle" label="About T3 Code" target="SettingsAbout" />
      {nightly.applies ? <NightlyUpdatesRow nightly={nightly} /> : null}
    </SettingsSection>
  );
}

/**
 * The nightly channel's version row: which commit is running, what the updater
 * is doing, and the one thing the user can do about it.
 */
function NightlyUpdatesRow(props: { readonly nightly: NightlyUpdaterBinding }) {
  const { state } = props.nightly;
  const statusLabel = nightlyUpdaterStatusLabel(state);
  const action = nightlyUpdaterAction(state);
  const label = `Nightly ${shortCommit(props.nightly.commit)}`;

  const runAction = () => {
    switch (action) {
      case "check":
        props.nightly.check();
        return;
      // "update" starts the download; "retry" resumes whichever step failed and
      // falls back to a fresh check when the failure left no update behind.
      case "update":
      case "retry":
        props.nightly.update();
        return;
      case "allowInstalls":
        props.nightly.allowInstalls();
        return;
      default:
        return;
    }
  };

  return (
    <View className="flex-row items-center gap-4 p-4">
      <SymbolView
        name="arrow.down.circle"
        size={22}
        tintColorClassName={"accent-icon"}
        type="monochrome"
        weight="regular"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-lg text-foreground">{label}</Text>
        {statusLabel ? (
          <Text className="text-xs text-foreground-muted/70" numberOfLines={2}>
            {statusLabel}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityLabel={nightlyUpdaterActionLabel(action)}
          accessibilityRole="button"
          className="rounded-full bg-subtle px-3.5 py-2"
          onPress={runAction}
        >
          <Text className="text-sm font-t3-medium text-foreground">
            {nightlyUpdaterActionLabel(action)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
