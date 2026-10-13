import { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Keyboard,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  View,
} from "react-native";
import { useMaterialToolbarLayout } from "./useMaterialToolbarLayout";
import { NativeStackScreenOptions } from "../native/StackHeader";
import { AndroidWorkspaceSidebarButton } from "../features/layout/workspace-sidebar-toolbar";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { AndroidHeaderButtonGroup, AndroidScreenHeader } from "./AndroidScreenHeader";
import { ScreenHeaderButton } from "./ScreenHeaderButton.android";
import { SymbolView } from "./AppSymbol";
import { ControlPillMenu } from "./ControlPill";
import { GlassFill } from "./GlassSurface";
import { useLiquidGlass } from "./useLiquidGlass";
import { MaterialSearchField } from "./MaterialSearchField";
import { androidHeaderMenuActions, findHeaderMenuAction } from "./headerMenu.android";
import type { ScreenHeaderProps } from "./ScreenHeader.types";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

export function ScreenHeader(props: ScreenHeaderProps) {
  const { search } = props;
  const { paddingTop, paddingBottom } = useMaterialToolbarLayout();
  const { scale, buttonSize } = useAndroidControlSizing();
  const { themeVariables } = useAppearancePreferences();
  const liquid = useLiquidGlass().tier !== "none";
  const inputRef = useRef<TextInputInstance>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = search !== undefined && (searchOpen || search.value.length > 0);
  const onSearchChange = search?.onChangeText;
  const closeSearch = useCallback(() => {
    onSearchChange?.("");
    setSearchOpen(false);
    Keyboard.dismiss();
  }, [onSearchChange]);
  useEffect(() => {
    if (!searching || search?.mode === "inline") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [closeSearch, searching, search?.mode]);
  const menuView = props.menus?.map((menu) => (
    <ControlPillMenu
      key={menu.title}
      actions={androidHeaderMenuActions(menu.items)}
      isAnchoredToRight
      title={menu.status ?? menu.title}
      onPressAction={({ nativeEvent }) => {
        const action = findHeaderMenuAction(menu.items, nativeEvent.event);
        if (action && !action.disabled) action.onPress();
      }}
    >
      <ScreenHeaderButton accessibilityLabel={menu.title} icon={menu.icon} />
    </ControlPillMenu>
  ));
  // headerTransparent means the same as on iOS: content scrolls under the bar.
  // Android draws the bar itself, so these never reach the native stack.
  const { headerTransparent, headerStyle, ...navigationOptions } = props.options ?? {};
  const overlay = headerTransparent
    ? {
        color: StyleSheet.flatten(headerStyle)?.backgroundColor ?? themeVariables["--color-screen"],
      }
    : undefined;
  const options = (
    <NativeStackScreenOptions
      options={{
        ...navigationOptions,
        ...(props.matchSearchSurface
          ? { contentStyle: { backgroundColor: themeVariables["--color-header"] } }
          : undefined),
        headerShown: false,
        title: props.title,
      }}
      optionsVersion={props.optionsVersion}
    />
  );
  if (search?.mode === "inline") {
    return (
      <>
        {options}
        <View className="px-3" style={{ paddingTop, paddingBottom: 8.75 * scale }}>
          <View className="flex-row items-center gap-2" style={{ minHeight: buttonSize }}>
            {props.onBack ? (
              <ScreenHeaderButton
                accessibilityLabel="Back"
                icon="chevron.left"
                onPress={props.onBack}
              />
            ) : null}
            <View
              className={
                liquid ? "flex-1 flex-row items-center" : "flex-1 flex-row items-center bg-subtle"
              }
              style={{
                minHeight: Math.max(40, 38 * scale),
                gap: 8.75 * scale,
                borderRadius: 10 * scale,
                paddingHorizontal: 12.25 * scale,
              }}
            >
              {liquid ? <GlassFill interactive={false} /> : null}
              <SymbolView
                name="magnifyingglass"
                size={Math.round(17 * scale)}
                tintColorClassName="accent-header-foreground"
                type="monochrome"
              />
              <TextInput
                accessibilityLabel={search.placeholder}
                autoCapitalize="none"
                onChangeText={search.onChangeText}
                value={search.value}
                placeholder={
                  search.compactToolbar
                    ? (search.compactPlaceholder ?? search.placeholder)
                    : search.placeholder
                }
                placeholderTextColorClassName="accent-placeholder"
                className="flex-1 text-base font-sans text-header-foreground"
                style={{ paddingVertical: 7 * scale }}
              />
            </View>
            {menuView?.length ? (
              <AndroidHeaderButtonGroup>{menuView}</AndroidHeaderButtonGroup>
            ) : null}
          </View>
        </View>
      </>
    );
  }
  const header = (
    <AndroidScreenHeader
      title={props.title}
      subtitle={props.subtitle}
      onBack={props.onBack}
      leading={props.sidebar !== false ? <AndroidWorkspaceSidebarButton /> : undefined}
      hideBottomBorder={props.hideBottomBorder}
      overlay={overlay}
      actions={
        search
          ? [
              {
                accessibilityLabel: search.placeholder,
                icon: "magnifyingglass",
                onPress: () => setSearchOpen(true),
              },
              ...(search.refreshInToolbar && search.onRefresh
                ? [
                    {
                      accessibilityLabel: search.refreshAccessibilityLabel ?? "Refresh",
                      icon: "arrow.clockwise" as const,
                      onPress: search.onRefresh,
                    },
                  ]
                : []),
              ...(props.actions ?? []),
            ]
          : props.actions
      }
      trailing={
        menuView?.length || props.trailing ? (
          <>
            {menuView}
            {props.trailing}
          </>
        ) : undefined
      }
    />
  );
  return (
    <>
      {options}
      {search ? (
        <View>
          <View
            pointerEvents={searching ? "none" : "auto"}
            accessibilityElementsHidden={searching}
            importantForAccessibility={searching ? "no-hide-descendants" : "auto"}
            style={{ opacity: searching ? 0 : 1 }}
          >
            {header}
          </View>
          {searching ? (
            <View className="absolute inset-0 px-3" style={{ paddingTop, paddingBottom }}>
              <View className="flex-1 flex-row items-center gap-2">
                <ScreenHeaderButton
                  accessibilityLabel={search.closeAccessibilityLabel ?? "Close search"}
                  icon="chevron.left"
                  onPress={closeSearch}
                />
                <MaterialSearchField
                  inputRef={inputRef}
                  accessibilityLabel={search.placeholder}
                  clearAccessibilityLabel={search.clearAccessibilityLabel ?? "Clear search"}
                  placeholder={search.placeholder}
                  value={search.value}
                  onChangeText={search.onChangeText}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        header
      )}
    </>
  );
}
