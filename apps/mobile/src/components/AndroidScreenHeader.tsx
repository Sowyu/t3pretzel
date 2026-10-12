import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import type { AppSymbolName } from "./AppSymbol";
import { SymbolView } from "./AppSymbol";
import { AppText as Text } from "./AppText";
import { cn } from "../lib/cn";
import { AndroidAnchoredMenu } from "./AndroidAnchoredMenu";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useMaterialToolbarLayout } from "./useMaterialToolbarLayout";

export interface AndroidHeaderAction {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly selected?: boolean;
}

/**
 * The iOS bar button: a 40dp translucent circle with a hairline edge and a
 * 48dp touch target. Press feedback is an opacity dip, like UIKit.
 */
export function AndroidHeaderIconButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}) {
  const { scale } = useAndroidControlSizing();
  const size = Math.round(40 * Math.max(1, scale));
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(props.disabled), selected: props.selected }}
      disabled={props.disabled}
      hitSlop={4}
      onPress={props.onPress}
      className={cn(
        "items-center justify-center rounded-full border-separator active:opacity-50",
        props.selected ? "bg-subtle-strong" : "bg-glass-fallback",
      )}
      style={{ width: size, height: size, borderWidth: StyleSheet.hairlineWidth }}
    >
      <SymbolView
        name={props.icon}
        size={Math.round(20 * scale)}
        tintColorClassName={props.disabled ? "accent-icon-subtle" : "accent-header-foreground"}
        type="monochrome"
      />
    </Pressable>
  );
}

/**
 * In-flow Android version of the iOS navigation bar: transparent over the
 * screen, centered 18dp title, chevron back button and circular bar buttons.
 * Actions past the visible budget collapse into a horizontal ellipsis menu.
 */
export function AndroidScreenHeader(props: {
  readonly title: string;
  /** Replaces the centered title with leading content, like iOS's editor-style bar. */
  readonly titleContent?: ReactNode;
  readonly subtitle?: string | null;
  readonly actions?: ReadonlyArray<AndroidHeaderAction>;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onBack?: () => void;
  readonly embedded?: boolean;
  /** iOS bars have no bottom border; kept so call sites stay unchanged. */
  readonly hideBottomBorder?: boolean;
}) {
  const { scale } = useAndroidControlSizing();
  const { height: toolbarHeight, ...headerPadding } = useMaterialToolbarLayout(props.embedded);
  const [headerWidth, setHeaderWidth] = useState(0);
  const [sideWidths, setSideWidths] = useState({ leading: 0, trailing: 0 });
  const actions = props.actions ?? [];
  const directCount = actions.length > 2 ? (headerWidth >= 600 ? 3 : 1) : actions.length;
  const visibleActions = actions.slice(0, directCount);
  const overflowActions = actions.slice(directCount);
  const titleInset = Math.max(sideWidths.leading, sideWidths.trailing) + 8;

  const centeredTitle =
    props.titleContent === undefined ? (
      <View
        pointerEvents="none"
        className="absolute inset-y-0 items-center justify-center"
        style={{ left: titleInset, right: titleInset }}
      >
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-header-foreground font-t3-extrabold"
          style={{ fontSize: 18 * scale, lineHeight: 23 * scale }}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text
            numberOfLines={1}
            className="font-t3-medium text-foreground-muted"
            style={{ fontSize: 12 * scale, lineHeight: 16 * scale }}
          >
            {props.subtitle}
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View
      onLayout={(event) => setHeaderWidth(event.nativeEvent.layout.width)}
      className="px-3"
      style={headerPadding}
    >
      <View style={{ minHeight: toolbarHeight }} className="flex-row items-center">
        {centeredTitle}
        <View
          className="flex-row items-center gap-2"
          onLayout={(event) => {
            const leading = event.nativeEvent.layout.width;
            setSideWidths((current) =>
              current.leading === leading ? current : { ...current, leading },
            );
          }}
        >
          {props.onBack ? (
            <AndroidHeaderIconButton
              accessibilityLabel="Back"
              icon="chevron.left"
              onPress={props.onBack}
            />
          ) : null}
          {props.leading}
        </View>

        <View className={cn("min-w-0 flex-1", (props.onBack || props.leading) && "pl-2")}>
          {props.titleContent}
        </View>

        <View
          className="flex-row items-center gap-2"
          onLayout={(event) => {
            const trailing = event.nativeEvent.layout.width;
            setSideWidths((current) =>
              current.trailing === trailing ? current : { ...current, trailing },
            );
          }}
        >
          {visibleActions.map((action) =>
            action.loading ? (
              <View
                key={action.accessibilityLabel}
                accessibilityLabel={action.accessibilityLabel}
                className="size-10 items-center justify-center"
              >
                <ActivityIndicator colorClassName="accent-header-foreground" />
              </View>
            ) : (
              <AndroidHeaderIconButton
                key={action.accessibilityLabel}
                accessibilityLabel={action.accessibilityLabel}
                disabled={action.disabled}
                selected={action.selected}
                icon={action.icon}
                onPress={action.onPress}
              />
            ),
          )}
          {overflowActions.length > 0 ? (
            <AndroidAnchoredMenu
              actions={overflowActions.map((action, index) => ({
                id: String(index),
                title: action.accessibilityLabel,
                image: typeof action.icon === "string" ? action.icon : undefined,
                attributes: {
                  disabled: Boolean(action.disabled),
                },
                state: action.selected ? "on" : undefined,
              }))}
              onPressAction={({ nativeEvent }) =>
                overflowActions[Number(nativeEvent.event)]?.onPress()
              }
            >
              {(open) => (
                <AndroidHeaderIconButton
                  accessibilityLabel="More actions"
                  icon="ellipsis"
                  onPress={open}
                />
              )}
            </AndroidAnchoredMenu>
          ) : null}
          {props.trailing}
        </View>
      </View>
    </View>
  );
}

export function AndroidSheetHeader(
  props: Omit<Parameters<typeof AndroidScreenHeader>[0], "embedded">,
) {
  return <AndroidScreenHeader {...props} embedded />;
}
