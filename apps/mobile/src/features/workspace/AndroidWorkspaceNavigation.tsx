import type { WorkspaceTab } from "./workspace-tabs-state";

/** Other clients own their workspace navigation chrome. */
export function AndroidWorkspaceNavigation(_props: {
  readonly selectedTab: WorkspaceTab;
  readonly onSelect: (tab: WorkspaceTab) => void;
}) {
  return null;
}

export const ANDROID_WORKSPACE_TAB_BAR_HEIGHT = 62;

export function androidWorkspaceTabBarBottom(insetBottom: number) {
  return Math.max(insetBottom, 12);
}
