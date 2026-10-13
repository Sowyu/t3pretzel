import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Screen } from "react-native-screens";

import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";

type WorkspaceContextValue = NonNullable<ReturnType<typeof useWorkspaceTabs>>;

/**
 * The context one tab sees: itself as selected, changing only when search,
 * scroll, or clearance changes. Selecting a tab leaves both tabs' values
 * untouched, so a tab press never re-renders a list.
 */
export function useAndroidTabContext(
  workspace: WorkspaceContextValue,
  tab: WorkspaceTab,
  bottomClearance: number,
): WorkspaceContextValue {
  const { state, dispatch, isTabActive, getScrollOffset, recordScrollOffset } = workspace;
  const { getScrollAnchor, recordScrollAnchor } = workspace;
  const { tabs } = state;
  return useMemo(
    () => ({
      // No list reads the selection revision; pinning it keeps tab presses out of the memo.
      state: { tabs, selectedTab: tab, selectionRevision: 0 },
      dispatch,
      isTabActive,
      bottomClearance,
      getScrollOffset,
      recordScrollOffset,
      getScrollAnchor,
      recordScrollAnchor,
    }),
    [
      tab,
      tabs,
      dispatch,
      isTabActive,
      bottomClearance,
      getScrollOffset,
      recordScrollOffset,
      getScrollAnchor,
      recordScrollAnchor,
    ],
  );
}

/**
 * One tab inside a `ScreenContainer hasTwoStates`. It mounts on first visit
 * and stays mounted. While hidden it keeps the context and children it last
 * rendered, so nothing re-renders it, and react-native-screens detaches its
 * views so it draws nothing while its scroll position survives. Same contract
 * as iOS's RetainedWorkspaceTab.
 */
export function AndroidRetainedTab(props: {
  readonly active: boolean;
  readonly workspace: WorkspaceContextValue;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const [content, setContent] = useState(
    props.active ? { workspace: props.workspace, children: props.children } : null,
  );
  if (
    props.active &&
    (content?.workspace !== props.workspace || content.children !== props.children)
  )
    setContent({ workspace: props.workspace, children: props.children });
  if (!content) return null;
  return (
    <Screen
      activityState={props.active ? 2 : 0}
      enabled
      style={[StyleSheet.absoluteFill, { zIndex: props.active ? 0 : -1 }]}
      accessibilityElementsHidden={!props.active}
      importantForAccessibility={props.active ? "auto" : "no-hide-descendants"}
    >
      <View className={props.className ?? "flex-1 bg-screen"}>
        <WorkspaceTabsContext value={content.workspace}>{content.children}</WorkspaceTabsContext>
      </View>
    </Screen>
  );
}
