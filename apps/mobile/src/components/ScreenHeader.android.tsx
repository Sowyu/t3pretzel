import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Keyboard, type TextInputInstance, View } from "react-native";
import { useMaterialToolbarLayout } from "./useMaterialToolbarLayout";
import { NativeStackScreenOptions } from "../native/StackHeader";
import { AndroidWorkspaceSidebarButton } from "../features/layout/workspace-sidebar-toolbar";
import { AndroidScreenHeader } from "./AndroidScreenHeader";
import { ScreenHeaderButton } from "./ScreenHeaderButton.android";
import { ControlPillMenu } from "./ControlPill";
import { MaterialSearchField } from "./MaterialSearchField";
import { androidHeaderMenuActions, findHeaderMenuAction } from "./headerMenu.android";
import type { ScreenHeaderProps } from "./ScreenHeader.types";

export function ScreenHeader(props: ScreenHeaderProps) {
  const { search } = props;
  const { height, paddingTop, paddingBottom } = useMaterialToolbarLayout();
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
  const options = (
    <NativeStackScreenOptions
      options={{
        ...props.options,
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
        <View
          className="border-b border-header-border bg-header px-3"
          style={{
            paddingTop,
            paddingBottom,
            borderBottomWidth: props.hideBottomBorder ? 0 : undefined,
          }}
        >
          <View className="flex-row items-center gap-2" style={{ minHeight: height }}>
            {props.onBack ? (
              <ScreenHeaderButton
                accessibilityLabel="Navigate up"
                icon="chevron.left"
                onPress={props.onBack}
              />
            ) : null}
            <MaterialSearchField
              inputRef={inputRef}
              autoFocus={false}
              accessibilityLabel={search.placeholder}
              clearAccessibilityLabel={search.clearAccessibilityLabel ?? "Clear search"}
              placeholder={
                search.compactToolbar
                  ? (search.compactPlaceholder ?? search.placeholder)
                  : search.placeholder
              }
              value={search.value}
              onChangeText={search.onChangeText}
            />
            {menuView}
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
        <>
          {menuView}
          {props.trailing}
        </>
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
            <View className="absolute inset-0 bg-header px-3" style={{ paddingTop, paddingBottom }}>
              <View className="flex-1 flex-row items-center gap-2">
                <ScreenHeaderButton
                  accessibilityLabel={search.closeAccessibilityLabel ?? "Close search"}
                  icon="arrow.left"
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
