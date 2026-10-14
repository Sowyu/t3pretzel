import { useMemo } from "react";
import { Platform } from "react-native";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ScreenHeaderButton } from "../../components/ScreenHeaderButton";
import type { ScreenHeaderAction } from "../../components/ScreenHeader.types";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import type { ThreadInspectorMode } from "./thread-inspector-content-stack";
import { useThreadHeaderOptions } from "./useThreadHeaderOptions";
import { useThreadGitMenuDefinition, useThreadTerminalMenuDefinition } from "./ThreadGitControls";
import { useWorkspaceListNavigation } from "../workspace/useAndroidWorkspaceNavigation";

export function ThreadHeader(
  props: Parameters<typeof useThreadHeaderOptions>[0] & {
    readonly hasThreadCwd: boolean;
    readonly hasWorkspaceRoot: boolean;
    readonly fileInspectorSupported: boolean;
    readonly inspectorMode: ThreadInspectorMode | null;
    readonly onToggleInspector: () => void;
    readonly onOpenGitInspector: () => void;
    readonly onOpenFilesInspector: () => void;
  },
) {
  const returnToList = useWorkspaceListNavigation("threads");
  const { layout, panes, toggleAuxiliaryPane } = useAdaptiveWorkspaceLayout();
  const { onMergeBack } = props.gitControls;
  const native = useThreadHeaderOptions(props);
  // iOS builds this menu into its native header items; Android shows the same
  // branch status, quick action and review entry from its header menu.
  const gitMenu = useThreadGitMenuDefinition({
    ...props.gitControls,
    onOpenGitInspector: props.onOpenGitInspector,
  });
  // iOS's terminal button is a menu: project scripts, open sessions, a new shell.
  const terminalMenu = useThreadTerminalMenuDefinition(props.gitControls);
  const showTerminalMenu = props.hasWorkspaceRoot && props.gitControls.canOpenTerminal;
  const androidGitMenus = useMemo(
    () =>
      Platform.OS === "android"
        ? [...(showTerminalMenu ? [terminalMenu] : []), ...(gitMenu ? [gitMenu] : [])]
        : undefined,
    [showTerminalMenu, terminalMenu, gitMenu],
  );
  const hasGitMenu = Platform.OS === "android" && gitMenu !== null;
  const androidHeaderActions = useMemo<ReadonlyArray<ScreenHeaderAction>>(() => {
    const actions: ScreenHeaderAction[] = [];
    if (props.onReturnToThread) {
      actions.push({
        accessibilityLabel: "Return to chat",
        icon: "chevron.left",
        onPress: props.onReturnToThread,
      });
    }
    // Same order as the iOS capsule: terminal (a menu placed first), files, git.
    if (props.hasThreadCwd) {
      const filesVisible = props.inspectorMode === "files" && panes.auxiliaryPaneVisible;
      actions.push({
        accessibilityLabel: filesVisible ? "Close files" : "Open files",
        selected: filesVisible,
        icon: "folder",
        onPress: filesVisible ? toggleAuxiliaryPane : props.onOpenFilesInspector,
      });
    }
    if (!hasGitMenu) {
      actions.push({
        accessibilityLabel: "Open git controls",
        icon: "point.topleft.down.curvedto.point.bottomright.up",
        onPress: props.onOpenGitInspector,
      });
    }
    if (onMergeBack) {
      actions.push({
        accessibilityLabel: "Merge back to source",
        icon: "arrow.triangle.merge",
        onPress: onMergeBack,
      });
    }
    return actions;
  }, [
    props.inspectorMode,
    panes.auxiliaryPaneVisible,
    props.onOpenFilesInspector,
    onMergeBack,
    props.onOpenGitInspector,
    toggleAuxiliaryPane,
    props.onReturnToThread,
    props.hasThreadCwd,
    hasGitMenu,
  ]);

  return (
    <>
      <ScreenHeader
        title={props.title}
        subtitle={props.subtitle}
        sidebar={native.sidebar}
        options={native.options}
        optionsVersion={native.optionsVersion}
        trailing={
          props.fileInspectorSupported && props.hasThreadCwd ? (
            <ScreenHeaderButton
              accessibilityLabel={
                props.inspectorMode !== null && panes.auxiliaryPaneVisible
                  ? "Hide inspector"
                  : "Show inspector"
              }
              icon="sidebar.right"
              selected={props.inspectorMode !== null && panes.auxiliaryPaneVisible}
              onPress={props.onToggleInspector}
            />
          ) : null
        }
        onBack={layout.usesSplitView ? undefined : returnToList}
        actions={androidHeaderActions}
        menus={androidGitMenus?.length ? androidGitMenus : undefined}
        hideBottomBorder
      />
      {native.fallback}
    </>
  );
}
