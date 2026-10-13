import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "react-native-screens";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { EmptyState } from "../../components/EmptyState";
import { GlassBackdropSource } from "../../components/GlassBackdropSource";
import { useAndroidControlSizing } from "../../components/useAndroidControlSizing";
import { HomeRouteScreen } from "../home/HomeRouteScreen";
import { PullRequestsScreen } from "../pull-requests/PullRequestsScreen";
import { PullRequestListToolbar } from "../pull-requests/PullRequestListToolbar.android";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import {
  AndroidWorkspaceNavigation,
  ANDROID_WORKSPACE_TAB_BAR_HEIGHT,
  androidWorkspaceTabBarBottom,
} from "./AndroidWorkspaceNavigation";
import { AndroidRetainedTab, useAndroidTabContext } from "./AndroidRetainedTab";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";

// Static elements: React skips them on every root render, so only context changes reach the lists.
const THREADS_TAB = <HomeRouteScreen />;
const PULL_REQUESTS_TAB = (
  <>
    <PullRequestListToolbar />
    <PullRequestsScreen />
  </>
);

export function WorkspaceRootScreen() {
  const { layout } = useAdaptiveWorkspaceLayout();
  const workspace = useWorkspaceTabs()!;
  const insets = useSafeAreaInsets();
  const { scale } = useAndroidControlSizing();
  // Lists scroll under the floating tab bar; the last row clears it by 16dp.
  const bottomClearance =
    androidWorkspaceTabBarBottom(insets.bottom) +
    ANDROID_WORKSPACE_TAB_BAR_HEIGHT * Math.max(1, scale) +
    16;
  const threadsContext = useAndroidTabContext(workspace, "threads", bottomClearance);
  const pullRequestsContext = useAndroidTabContext(workspace, "pullRequests", bottomClearance);
  const { dispatch } = workspace;
  const selectTab = useCallback(
    (tab: WorkspaceTab) => dispatch({ type: "select", tab }),
    [dispatch],
  );
  const listInsets = useMemo(() => ({ ...insets, bottom: 0 }), [insets]);

  // Split lists live in the sidebar beside the navigator; Home is an empty detail pane.
  if (layout.usesSplitView) {
    return workspace.state.selectedTab === "threads" ? (
      <HomeRouteScreen />
    ) : (
      <>
        <NativeStackScreenOptions options={{ headerShown: false }} />
        <AndroidScreenHeader title="Pull requests" />
        <View className="flex-1 items-center justify-center px-10">
          <EmptyState
            title="Select a pull request"
            detail="Choose a pull request from the sidebar to review it."
            variant="plain"
          />
        </View>
      </>
    );
  }

  const selectedTab = workspace.state.selectedTab;
  return (
    <View className="flex-1 bg-screen">
      <NativeStackScreenOptions options={{ headerShown: false }} />
      <SafeAreaInsetsContext value={listInsets}>
        {/* The floating tab bar refracts the lists under it. */}
        <GlassBackdropSource style={{ flex: 1 }}>
          <ScreenContainer enabled hasTwoStates style={{ flex: 1 }}>
            <AndroidRetainedTab active={selectedTab === "threads"} workspace={threadsContext}>
              {THREADS_TAB}
            </AndroidRetainedTab>
            <AndroidRetainedTab
              active={selectedTab === "pullRequests"}
              workspace={pullRequestsContext}
            >
              {PULL_REQUESTS_TAB}
            </AndroidRetainedTab>
          </ScreenContainer>
        </GlassBackdropSource>
      </SafeAreaInsetsContext>
      <AndroidWorkspaceNavigation selectedTab={selectedTab} onSelect={selectTab} />
    </View>
  );
}
