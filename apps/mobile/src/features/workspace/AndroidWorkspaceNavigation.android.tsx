import { CommonActions, useNavigation } from "@react-navigation/native";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";

import { AppText as Text } from "../../components/AppText";
import { SymbolView, type AppSymbolName } from "../../components/AppSymbol";
import { useAndroidControlSizing } from "../../components/useAndroidControlSizing";
import { androidWorkspaceNavigationState } from "../../lib/android-workspace-navigation";
import { cn } from "../../lib/cn";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";

export const ANDROID_WORKSPACE_RAIL_WIDTH = 80;
/** iOS's 49pt tab bar, before the bottom inset. */
export const ANDROID_WORKSPACE_TAB_BAR_HEIGHT = 49;

const TABS: ReadonlyArray<{
  readonly tab: WorkspaceTab;
  readonly title: string;
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
}> = [
  { tab: "threads", title: "Threads", accessibilityLabel: "Threads", icon: "text.bubble" },
  {
    tab: "pullRequests",
    title: "Pulls",
    accessibilityLabel: "Pull requests",
    icon: "arrow.triangle.pull",
  },
];

function TabItem(props: {
  readonly title: string;
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly selected: boolean;
  readonly rail: boolean;
  readonly role: "tab" | "button";
  readonly onPress: () => void;
}) {
  const { scale } = useAndroidControlSizing();
  const tint = props.selected ? "accent-foreground" : "accent-icon-muted";
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole={props.role}
      accessibilityState={props.role === "tab" ? { selected: props.selected } : undefined}
      onPress={props.onPress}
      className={cn(
        "items-center justify-center active:opacity-50",
        props.rail ? "w-full py-3" : "flex-1",
      )}
      style={{ gap: 2 * scale, minHeight: 48 }}
    >
      <SymbolView
        name={props.icon}
        size={Math.round(24 * scale)}
        tintColorClassName={tint}
        type="monochrome"
      />
      <Text
        numberOfLines={1}
        className={cn(
          "font-t3-medium",
          props.selected ? "text-foreground" : "text-foreground-muted",
        )}
        style={{ fontSize: 10 * scale, lineHeight: 12 * scale }}
      >
        {props.title}
      </Text>
    </Pressable>
  );
}

/**
 * The iOS tab bar drawn in JS: a translucent bar with a top hairline,
 * Threads and Pulls tabs, and a New chat item that opens the composer
 * instead of becoming selected. The rail variant stacks the two tabs for
 * split layouts, where New chat lives in the sidebar header like iPad.
 */
export function AndroidWorkspaceNavigation(props: {
  readonly rail?: boolean;
  readonly onSelect?: () => void;
}) {
  const workspace = useWorkspaceTabs()!;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { scale } = useAndroidControlSizing();
  const rail = Boolean(props.rail);
  if (!rail && keyboardVisible) return null;

  const select = (tab: WorkspaceTab) => {
    Keyboard.dismiss();
    if (tab !== workspace.state.selectedTab) {
      workspace.dispatch({ type: "select", tab });
      navigation.dispatch((state) => CommonActions.reset(androidWorkspaceNavigationState(state)));
    }
    props.onSelect?.();
  };

  const items = TABS.map((item) => (
    <TabItem
      key={item.tab}
      {...item}
      role="tab"
      rail={rail}
      selected={workspace.state.selectedTab === item.tab}
      onPress={() => select(item.tab)}
    />
  ));

  if (rail) {
    return (
      <View
        accessibilityRole="tablist"
        className="flex-1 items-center bg-screen"
        style={{
          width: ANDROID_WORKSPACE_RAIL_WIDTH * Math.max(1, scale),
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom,
        }}
      >
        {items}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      className="absolute inset-x-0 bottom-0 flex-row border-separator bg-header"
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        height: ANDROID_WORKSPACE_TAB_BAR_HEIGHT * Math.max(1, scale) + insets.bottom,
        paddingBottom: insets.bottom,
      }}
    >
      {items}
      <TabItem
        title="New chat"
        accessibilityLabel="New chat"
        icon="square.and.pencil"
        role="button"
        rail={false}
        selected={false}
        onPress={() => {
          Keyboard.dismiss();
          navigation.navigate("NewTaskSheet", { screen: "NewTask" });
        }}
      />
    </View>
  );
}
