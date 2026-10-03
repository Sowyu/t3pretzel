import { useCallback, useState, type ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";

import { SymbolView, type AppSymbolName } from "./AppSymbol";
import { AppText as Text } from "./AppText";
import { GlassControl } from "./GlassControl";
import { GlassSurface } from "./GlassSurface";
import { cn } from "../lib/cn";
import { AndroidAnchoredMenu } from "./AndroidAnchoredMenu";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useMaterialToolbarLayout } from "./useMaterialToolbarLayout";

// Bottom corners of the floating glass bar; the composer's card uses the same scale.
const FLOATING_CORNER_RADIUS = 24;

export interface AndroidHeaderAction {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}

export function AndroidHeaderIconButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}) {
  const { scale } = useAndroidControlSizing();
  const size = Math.round(44 * scale);
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(props.disabled), selected: props.selected }}
      disabled={props.disabled}
      hitSlop={8}
      onPress={props.onPress}
      className={props.disabled ? "opacity-55" : undefined}
    >
      {/* Same circle as the home header's controls: liquid glass where the
          platform has it, the flat bg-subtle fill everywhere else. */}
      <GlassControl
        className="items-center justify-center rounded-full"
        radius={size / 2}
        style={{ width: size, height: size }}
      >
        <SymbolView
          name={props.icon}
          size={Math.round(20 * scale)}
          tintColorClassName={
            props.disabled
              ? "accent-icon-subtle"
              : props.selected
                ? "accent-primary"
                : "accent-header-foreground"
          }
          type="monochrome"
        />
      </GlassControl>
    </Pressable>
  );
}

export function AndroidScreenHeader(props: {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly actions?: ReadonlyArray<AndroidHeaderAction>;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** Sits on the header surface under the title row, above the bottom border.
      The Files screen puts its search field here, matching the home header. */
  readonly below?: ReactNode;
  readonly onBack?: () => void;
  readonly embedded?: boolean;
  readonly hideBottomBorder?: boolean;
  /** Floats the bar over the screen as liquid glass instead of sitting in
      flow, so content refracts through it while it scrolls underneath. The
      caller owns the matching top inset for that content and measures this
      bar with `onLayout` (see ThreadRouteScreen). */
  readonly floating?: boolean;
  /** The bar's on-screen height, for the caller's content inset. */
  readonly onHeightChange?: (height: number) => void;
}) {
  const {
    height: toolbarHeight,
    paddingTop,
    paddingBottom,
  } = useMaterialToolbarLayout(props.embedded);
  const { scale } = useAndroidControlSizing();
  const [headerWidth, setHeaderWidth] = useState(0);
  const actions = props.actions ?? [];
  const directCount = actions.length > 2 ? (headerWidth >= 600 ? 3 : 1) : actions.length;
  const visibleActions = actions.slice(0, directCount);
  const overflowActions = actions.slice(directCount);
  const { onHeightChange } = props;
  // The floating bar overshoots the top of the screen by its corner radius,
  // so only its bottom corners round on screen.
  const overshoot = props.floating ? FLOATING_CORNER_RADIUS : 0;
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setHeaderWidth(event.nativeEvent.layout.width);
      onHeightChange?.(event.nativeEvent.layout.height - overshoot);
    },
    [onHeightChange, overshoot],
  );
  const padding = {
    paddingTop: paddingTop + overshoot,
    paddingBottom: props.below ? paddingBottom + 5 : paddingBottom,
  };

  const content = (
    <>
      <View style={{ minHeight: toolbarHeight }} className="flex-row items-center gap-2">
        {props.onBack ? (
          <Pressable
            accessibilityLabel="Navigate up"
            accessibilityRole="button"
            hitSlop={8}
            onPress={props.onBack}
            className="-mr-2 items-center justify-center"
            style={{ width: Math.round(44 * scale), height: Math.round(44 * scale) }}
          >
            <SymbolView
              name="chevron.left"
              size={Math.round(24 * scale)}
              tintColorClassName="accent-header-foreground"
              type="monochrome"
            />
          </Pressable>
        ) : null}

        {props.leading}

        <View className={cn("min-w-0 flex-1", !props.onBack && "pl-1")}>
          <Text numberOfLines={1} className="text-lg font-t3-bold text-header-foreground">
            {props.title}
          </Text>
          {props.subtitle ? (
            <Text
              numberOfLines={1}
              className="mt-px text-[13px] font-t3-medium text-foreground-muted"
            >
              {props.subtitle}
            </Text>
          ) : null}
        </View>

        {visibleActions.map((action) => (
          <AndroidHeaderIconButton
            key={action.accessibilityLabel}
            accessibilityLabel={action.accessibilityLabel}
            disabled={action.disabled}
            selected={action.selected}
            icon={action.icon}
            onPress={action.onPress}
          />
        ))}
        {overflowActions.length > 0 ? (
          <AndroidAnchoredMenu
            actions={overflowActions.map((action, index) => ({
              id: String(index),
              title: action.accessibilityLabel,
              attributes: {
                disabled: Boolean(action.disabled),
                state: action.selected ? "on" : undefined,
              },
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

      {props.below ? <View className="mt-3">{props.below}</View> : null}
    </>
  );

  if (props.floating) {
    // The glass has to CONTAIN what it sits over (see GlassSurface), so the
    // padded row lives inside it and the bar carries no border of its own.
    return (
      <GlassSurface
        chrome="none"
        glassEffectStyle="regular"
        onLayout={handleLayout}
        tintColor="transparent"
        style={{
          position: "absolute",
          top: -overshoot,
          left: 0,
          right: 0,
          borderRadius: FLOATING_CORNER_RADIUS,
          zIndex: 1,
        }}
      >
        <View className="px-3" style={padding}>
          {content}
        </View>
      </GlassSurface>
    );
  }

  return (
    <View
      onLayout={handleLayout}
      className="border-b border-header-border bg-header px-3"
      style={{
        ...padding,
        borderBottomWidth: props.hideBottomBorder ? 0 : undefined,
      }}
    >
      {content}
    </View>
  );
}

export function AndroidSheetHeader(
  props: Omit<Parameters<typeof AndroidScreenHeader>[0], "embedded">,
) {
  return <AndroidScreenHeader {...props} embedded />;
}
