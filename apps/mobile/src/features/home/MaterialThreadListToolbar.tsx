import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";
import {
  BackHandler,
  Keyboard,
  type TextInputInstance,
  View,
  type LayoutChangeEvent,
} from "react-native";
import type { MenuAction } from "@react-native-menu/menu";

import {
  AndroidHeaderButtonGroup,
  AndroidHeaderIconButton,
} from "../../components/AndroidScreenHeader";
import { CompactBrandTitle } from "../../components/CompactBrandTitle";
import { AndroidAnchoredMenu } from "../../components/AndroidAnchoredMenu";
import { ControlPillMenu } from "../../components/ControlPill";
import { MaterialSearchField } from "../../components/MaterialSearchField";
import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { WorkspaceConnectionTitle } from "./WorkspaceConnectionTitle";
import { useWorkspaceState } from "../../state/workspace";
import { useMaterialToolbarLayout } from "../../components/useMaterialToolbarLayout";

/** The Home bar for the compact list and the split-view sidebar, including search. */
export function MaterialThreadListToolbar(props: {
  readonly searchQuery: string;
  readonly onSearchQueryChange: (query: string) => void;
  readonly filterActions: MenuAction[];
  readonly filterCustomized: boolean;
  readonly onFilterAction: NonNullable<ComponentProps<typeof ControlPillMenu>["onPressAction"]>;
  readonly onOpenSettings: () => void;
  readonly onOpenEnvironments: () => void;
  readonly sidebar?: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onRequestVisibility?: () => void;
  /** Split layouts have no tab bar, so New task joins the bar buttons. */
  readonly onStartNewTask?: () => void;
}) {
  const navigation = useNavigation();
  const workspace = useWorkspaceTabs();
  const isTabActive = workspace?.isTabActive;
  const homeFocused = useNavigationState((state) => state.routes[state.index]?.name === "Home");
  const listFocused =
    homeFocused && (workspace === null || workspace.state.selectedTab === "threads");
  const { height: toolbarHeight, ...headerPadding } = useMaterialToolbarLayout();
  const { state } = useWorkspaceState();
  const { onRequestVisibility, onSearchQueryChange } = props;
  const searchRef = useRef<TextInputInstance>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || props.searchQuery.length > 0;
  const openSearch = useCallback(() => {
    onRequestVisibility?.();
    setSearchOpen(true);
    searchRef.current?.focus();
    return true;
  }, [onRequestVisibility]);
  useHardwareKeyboardCommand("focusSearch", openSearch);

  const closeSearch = useCallback(() => {
    onSearchQueryChange("");
    setSearchOpen(false);
    Keyboard.dismiss();
  }, [onSearchQueryChange]);

  useEffect(() => {
    if (!searching || !listFocused) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Frozen Home screens can keep effects alive after a detail route opens.
      const state = navigation.getState();
      if (
        !state ||
        state.routes[state.index]?.name !== "Home" ||
        isTabActive?.("threads") === false
      )
        return false;
      if (Keyboard.isVisible()) Keyboard.dismiss();
      else closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [closeSearch, searching, listFocused, navigation, isTabActive]);

  const filterIcon = props.filterCustomized
    ? "line.3.horizontal.decrease.circle.fill"
    : "line.3.horizontal.decrease.circle";
  const searchField = (
    <MaterialSearchField
      inputRef={searchRef}
      accessibilityLabel="Search threads"
      clearAccessibilityLabel="Clear search"
      placeholder="Search"
      value={props.searchQuery}
      onChangeText={onSearchQueryChange}
    />
  );

  return (
    <View
      onLayout={props.onLayout}
      className={props.sidebar ? "absolute inset-x-0 top-0 z-[4] bg-drawer px-3" : "px-3"}
      style={headerPadding}
    >
      <View className="flex-row items-center gap-2" style={{ minHeight: toolbarHeight }}>
        {searching ? (
          <>
            <AndroidHeaderIconButton
              accessibilityLabel="Close search"
              icon="chevron.left"
              onPress={closeSearch}
            />
            {searchField}
          </>
        ) : (
          <>
            {/* iOS's editor-style bar: the brand leads, bar buttons trail. */}
            <View className="min-w-0 flex-1 pl-1">
              <WorkspaceConnectionTitle
                grow
                onPress={props.onOpenEnvironments}
                brand={<CompactBrandTitle allowFontScaling={false} />}
              />
            </View>
            {/* Search and filter share one capsule; settings keeps the iOS "..." circle. */}
            <AndroidHeaderButtonGroup>
              <AndroidHeaderIconButton
                accessibilityLabel="Search threads"
                icon="magnifyingglass"
                onPress={openSearch}
              />
              {state.hasConnections ? (
                <AndroidAnchoredMenu
                  actions={props.filterActions}
                  onPressAction={props.onFilterAction}
                >
                  {(open) => (
                    <AndroidHeaderIconButton
                      accessibilityLabel="Filter threads"
                      icon={filterIcon}
                      selected={props.filterCustomized}
                      onPress={open}
                    />
                  )}
                </AndroidAnchoredMenu>
              ) : null}
              {props.onStartNewTask && state.hasConnections ? (
                <AndroidHeaderIconButton
                  accessibilityLabel="New task"
                  icon="square.and.pencil"
                  onPress={props.onStartNewTask}
                />
              ) : null}
            </AndroidHeaderButtonGroup>
            <AndroidHeaderIconButton
              accessibilityLabel="Open settings"
              icon="ellipsis"
              onPress={props.onOpenSettings}
            />
          </>
        )}
      </View>
    </View>
  );
}
