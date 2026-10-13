import { useNavigation } from "@react-navigation/native";
import { memo } from "react";
import { Keyboard, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";

import { AppText as Text } from "../../components/AppText";
import { SymbolView, type AppSymbolName } from "../../components/AppSymbol";
import { useAndroidControlSizing } from "../../components/useAndroidControlSizing";
import { cn } from "../../lib/cn";
import { themeColorWithMinimumAlpha } from "../../lib/mobileTheme";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import type { WorkspaceTab } from "./workspace-tabs-state";

/** iOS 26's floating tab bar: capsule height, edge margin, and the gap to the compose circle. */
export const ANDROID_WORKSPACE_TAB_BAR_HEIGHT = 62;
const EDGE = 21;
const GAP = 12;
const PILL_INSET = 4;

/** Distance from the screen's bottom edge to the bar's bottom edge. */
export function androidWorkspaceTabBarBottom(insetBottom: number) {
  return Math.max(insetBottom, 12);
}

const TABS: ReadonlyArray<{
  readonly tab: WorkspaceTab;
  readonly title: string;
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly selectedIcon: AppSymbolName;
}> = [
  {
    tab: "threads",
    title: "Threads",
    accessibilityLabel: "Threads",
    icon: "text.bubble",
    selectedIcon: "text.bubble.fill",
  },
  {
    tab: "pullRequests",
    title: "Pulls",
    accessibilityLabel: "Pull requests",
    icon: "arrow.triangle.pull",
    selectedIcon: "arrow.triangle.pull",
  },
];

/**
 * The header's glass look at tab-bar scale: an opaque glass fill (no live blur
 * on Android, and a translucent fill shows the shadow through as a halo), a
 * hairline edge, and a fixed elevation.
 */
function useTabBarGlass() {
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const fill = themeVariables["--color-glass-fallback"];
  return {
    className: themeAppearance === "dark" ? "border-white/10" : "border-border",
    style: {
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: typeof fill === "string" ? themeColorWithMinimumAlpha(fill, 1) : fill,
      elevation: 6,
    } satisfies ViewStyle,
  };
}

/**
 * The iOS 26 phone tab bar drawn in JS: a floating capsule holding Threads and
 * Pulls, with a pill behind the selected tab, and New chat detached into its
 * own circle like UIKit's search-role tab. It only owns chrome; the root keeps
 * both tab trees mounted, so a press re-renders this bar and nothing else.
 */
export const AndroidWorkspaceNavigation = memo(function AndroidWorkspaceNavigation(props: {
  readonly selectedTab: WorkspaceTab;
  readonly onSelect: (tab: WorkspaceTab) => void;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { scale } = useAndroidControlSizing();
  const glass = useTabBarGlass();
  if (keyboardVisible) return null;
  const height = ANDROID_WORKSPACE_TAB_BAR_HEIGHT * Math.max(1, scale);
  const iconSize = Math.round(24 * scale);

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 flex-row"
      style={{
        bottom: androidWorkspaceTabBarBottom(insets.bottom),
        paddingHorizontal: EDGE,
        gap: GAP,
      }}
    >
      <View
        accessibilityRole="tablist"
        className={cn("flex-1 flex-row rounded-full", glass.className)}
        style={[glass.style, { height, padding: PILL_INSET }]}
      >
        {TABS.map((item) => {
          const selected = props.selectedTab === item.tab;
          return (
            <Pressable
              key={item.tab}
              accessibilityLabel={item.accessibilityLabel}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                Keyboard.dismiss();
                if (!selected) props.onSelect(item.tab);
              }}
              className={cn(
                "flex-1 items-center justify-center rounded-full active:opacity-60",
                selected && "bg-foreground/10",
              )}
              style={{ gap: 1 * scale }}
            >
              <SymbolView
                name={selected ? item.selectedIcon : item.icon}
                size={iconSize}
                tintColorClassName={selected ? "accent-focus" : "accent-foreground"}
                type="monochrome"
              />
              <Text
                numberOfLines={1}
                className={cn("font-t3-semibold", selected ? "text-focus" : "text-foreground")}
                style={{ fontSize: 10 * scale, lineHeight: 12 * scale }}
              >
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityLabel="New chat"
        accessibilityRole="button"
        onPress={() => {
          Keyboard.dismiss();
          navigation.navigate("NewTaskSheet", { screen: "NewTask" });
        }}
        className={cn(
          "items-center justify-center rounded-full active:opacity-60",
          glass.className,
        )}
        style={[glass.style, { width: height, height }]}
      >
        <SymbolView
          name="square.and.pencil"
          size={iconSize}
          tintColorClassName="accent-foreground"
          type="monochrome"
        />
      </Pressable>
    </View>
  );
});
