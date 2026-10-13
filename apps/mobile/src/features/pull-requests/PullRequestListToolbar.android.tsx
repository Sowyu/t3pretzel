import { useNavigation, useNavigationState } from "@react-navigation/native";
import { useCallback, useEffect, useRef } from "react";
import { BackHandler, Keyboard, View, type TextInputInstance } from "react-native";
import {
  AndroidHeaderButtonGroup,
  AndroidHeaderIconButton,
} from "../../components/AndroidScreenHeader";
import { CompactBrandTitle } from "../../components/CompactBrandTitle";
import { MaterialSearchField } from "../../components/MaterialSearchField";
import { useMaterialToolbarLayout } from "../../components/useMaterialToolbarLayout";
import { WorkspaceConnectionTitle } from "../home/WorkspaceConnectionTitle";
import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";

/**
 * The iOS WorkspaceToolbar for the pull request tab: the brand leads, Search
 * and Settings share one glass capsule, and search opens a stacked field under
 * the bar with a circular cancel button, leaving the bar in place.
 */
export function PullRequestListToolbar(props: { readonly onRequestVisibility?: () => void }) {
  const navigation = useNavigation();
  const workspace = useWorkspaceTabs()!;
  const { dispatch, getScrollOffset, recordScrollOffset, isTabActive } = workspace;
  const homeFocused = useNavigationState((state) => state.routes[state.index]?.name === "Home");
  const listFocused = homeFocused && workspace.state.selectedTab === "pullRequests";
  const { onRequestVisibility } = props;
  const { height: toolbarHeight, ...headerPadding } = useMaterialToolbarLayout();
  const tab = workspace.state.tabs.pullRequests;
  const input = useRef<TextInputInstance>(null);
  const searching = tab.searchMode !== "resting";
  const openSearch = useCallback(() => {
    // Both tabs stay mounted; the hidden one leaves the shortcut to the visible one.
    if (!isTabActive("pullRequests")) return false;
    onRequestVisibility?.();
    dispatch({ type: "scroll", tab: "pullRequests", offset: getScrollOffset("pullRequests") });
    dispatch({ type: "search", tab: "pullRequests" });
    input.current?.focus();
    return true;
  }, [dispatch, getScrollOffset, isTabActive, onRequestVisibility]);
  useHardwareKeyboardCommand("focusSearch", openSearch);
  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    recordScrollOffset("pullRequests", tab.searchEntryOffset);
    dispatch({ type: "cancel", tab: "pullRequests" });
  }, [dispatch, recordScrollOffset, tab.searchEntryOffset]);
  useEffect(() => {
    if (!searching || !listFocused) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Retained Home screens keep effects alive after a detail route opens.
      const state = navigation.getState();
      if (!state || state.routes[state.index]?.name !== "Home" || !isTabActive("pullRequests"))
        return false;
      if (Keyboard.isVisible()) Keyboard.dismiss();
      else closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [searching, closeSearch, listFocused, navigation, isTabActive]);

  return (
    <View className="px-3" style={headerPadding}>
      <View className="flex-row items-center gap-2" style={{ minHeight: toolbarHeight }}>
        <View className="min-w-0 flex-1 pl-1">
          <WorkspaceConnectionTitle
            grow
            brand={
              <CompactBrandTitle
                allowFontScaling={false}
                accessibilityLabel="T3 Code, Pull requests"
              />
            }
            onPress={() =>
              navigation.navigate("SettingsSheet", {
                screen: "SettingsContent",
                params: { screen: "SettingsEnvironments" },
              })
            }
          />
        </View>
        <AndroidHeaderButtonGroup>
          <AndroidHeaderIconButton
            accessibilityLabel="Search pull requests"
            icon="magnifyingglass"
            onPress={openSearch}
          />
          <AndroidHeaderIconButton
            accessibilityLabel="Settings"
            icon="gearshape"
            onPress={() =>
              navigation.navigate("SettingsSheet", {
                screen: "SettingsContent",
                params: { screen: "Settings" },
              })
            }
          />
        </AndroidHeaderButtonGroup>
      </View>
      {searching ? (
        <View className="flex-row items-center gap-2 pt-2">
          <MaterialSearchField
            inputRef={input}
            autoFocus={tab.searchMode === "active"}
            accessibilityLabel="Search pull requests"
            clearAccessibilityLabel="Clear search"
            placeholder="Search pull requests"
            value={tab.query}
            onChangeText={(query) => dispatch({ type: "query", tab: "pullRequests", query })}
          />
          <AndroidHeaderIconButton
            accessibilityLabel="Cancel search"
            icon="xmark"
            onPress={closeSearch}
          />
        </View>
      ) : null}
    </View>
  );
}
