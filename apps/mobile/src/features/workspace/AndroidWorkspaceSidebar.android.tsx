import { CommonActions, useNavigation } from "@react-navigation/native";
import { useMemo, type ReactNode } from "react";
import { Keyboard, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "react-native-screens";
import { SegmentedControl } from "../../components/SegmentedControl";
import { androidWorkspaceNavigationState } from "../../lib/android-workspace-navigation";
import { PullRequestsScreen } from "../pull-requests/PullRequestsScreen";
import { PullRequestListToolbar } from "../pull-requests/PullRequestListToolbar.android";
import { AndroidRetainedTab, useAndroidTabContext } from "./AndroidRetainedTab";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";

const TAB_OPTIONS = [
  { value: "threads", label: "Threads" },
  { value: "pullRequests", label: "Pull requests" },
] as const;

/**
 * The split-view sidebar, like the iPad sidebar: a Threads / Pull requests
 * segmented picker above whichever list is selected. Both lists stay mounted.
 */
export function AndroidWorkspaceSidebar(props: {
  readonly children: ReactNode;
  readonly onRequestVisibility: () => void;
  readonly selectedPullRequestKey: string | null;
}) {
  const workspace = useWorkspaceTabs()!;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const threadsContext = useAndroidTabContext(workspace, "threads", 16);
  const pullRequestsContext = useAndroidTabContext(workspace, "pullRequests", 16);
  // The picker already clears the status bar; the lists must not inset it again.
  const listInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);
  const selectedTab = workspace.state.selectedTab;
  const select = (tab: WorkspaceTab) => {
    if (tab === selectedTab) return;
    Keyboard.dismiss();
    workspace.dispatch({ type: "select", tab });
    // Like iPad's popToTop: the detail pane returns to its empty state.
    navigation.dispatch((state) => CommonActions.reset(androidWorkspaceNavigationState(state)));
  };
  return (
    <View className="flex-1 bg-drawer" style={{ paddingTop: insets.top }}>
      <View className="px-4 pb-3 pt-2">
        <SegmentedControl
          role="tab"
          size="compact"
          options={TAB_OPTIONS}
          selected={selectedTab}
          onSelect={select}
        />
      </View>
      <SafeAreaInsetsContext value={listInsets}>
        <ScreenContainer enabled hasTwoStates style={{ flex: 1 }}>
          <AndroidRetainedTab
            active={selectedTab === "threads"}
            workspace={threadsContext}
            className="flex-1 bg-drawer"
          >
            {props.children}
          </AndroidRetainedTab>
          <AndroidRetainedTab
            active={selectedTab === "pullRequests"}
            workspace={pullRequestsContext}
            className="flex-1 bg-drawer"
          >
            <PullRequestListToolbar onRequestVisibility={props.onRequestVisibility} />
            <PullRequestsScreen sidebar selectedPullRequestKey={props.selectedPullRequestKey} />
          </AndroidRetainedTab>
        </ScreenContainer>
      </SafeAreaInsetsContext>
    </View>
  );
}
