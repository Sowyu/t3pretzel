import { AppActivityIndicator } from "./AppActivityIndicator";
import { createContext, use, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ColorValue } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { AppSymbolName } from "./AppSymbol";
import { SymbolView } from "./AppSymbol";
import { AppText as Text } from "./AppText";
import { cn } from "../lib/cn";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { AndroidAnchoredMenu } from "./AndroidAnchoredMenu";
import { useInAndroidPageSheet } from "./AndroidPageSheet";
import { GlassSurface } from "./GlassSurface";
import { useLiquidGlass } from "./useLiquidGlass";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useAndroidHeaderLayout } from "./useAndroidHeaderLayout";

export interface AndroidHeaderAction {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly selected?: boolean;
}

/** How far the scroll-edge band reaches below the bar, matching the static scrim's fade. */
const SCROLL_EDGE_FADE = 24;

/** Buttons inside a shared capsule drop their own surface and become 44dp slots. */
const InHeaderCapsuleContext = createContext(false);

/** iOS 26 bar-button size; doubles as the touch target. */
function useHeaderButtonSize() {
  const { scale } = useAndroidControlSizing();
  return { scale, size: Math.round(44 * Math.max(1, scale)) };
}

/**
 * Header glass: real Liquid Glass when the device and setting allow it,
 * otherwise an opaque theme fill with a hairline edge and a small lift.
 * Shared by the circle and the capsule; both swell under the finger.
 */
function HeaderGlass(props: { readonly size: number; readonly children: ReactNode }) {
  const { themeAppearance } = useAppearancePreferences();
  return (
    <GlassSurface
      chrome="none"
      interactive
      shape="capsule"
      fallbackClassName={themeAppearance === "dark" ? "border-white/10" : "border-border"}
      className="flex-row items-center"
      style={{
        height: props.size,
        minWidth: props.size,
        borderRadius: props.size / 2,
        borderWidth: StyleSheet.hairlineWidth,
        elevation: 2,
        gap: 2,
      }}
    >
      {props.children}
    </GlassSurface>
  );
}

/**
 * The iOS 26 bar button: a 44dp glass circle. Inside an
 * AndroidHeaderButtonGroup it renders as one bare slot of the shared capsule.
 */
export function AndroidHeaderIconButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
}) {
  const inCapsule = use(InHeaderCapsuleContext);
  const { scale, size } = useHeaderButtonSize();
  // Glass buttons answer a press by swelling, not by dimming.
  const glass = useLiquidGlass().tier !== "none";
  const icon = (
    <SymbolView
      name={props.icon}
      size={Math.round(20 * scale)}
      tintColorClassName={props.disabled ? "accent-icon-subtle" : "accent-header-foreground"}
      type="monochrome"
    />
  );
  const button = (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(props.disabled), selected: props.selected }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn("items-center justify-center rounded-full", !glass && "active:opacity-50")}
      style={{ width: size, height: size }}
    >
      {props.selected ? (
        <View
          className="items-center justify-center rounded-full bg-subtle-strong"
          style={{ width: size - 8, height: size - 8 }}
        >
          {icon}
        </View>
      ) : (
        icon
      )}
    </Pressable>
  );
  return inCapsule ? button : <HeaderGlass size={size}>{button}</HeaderGlass>;
}

/** One glass capsule around several bar buttons; a single button reads as a circle. */
export function AndroidHeaderButtonGroup(props: { readonly children: ReactNode }) {
  const { size } = useHeaderButtonSize();
  return (
    <HeaderGlass size={size}>
      <InHeaderCapsuleContext value>{props.children}</InHeaderCapsuleContext>
    </HeaderGlass>
  );
}

function hasContent(node: ReactNode) {
  return node !== null && node !== undefined && node !== false;
}

/**
 * A soft top scrim like iOS's scroll-edge effect: the screen color is nearly
 * solid under the status bar and fades out a little below the bar.
 */
function HeaderScrim(props: {
  readonly color: ColorValue;
  readonly safeTop: number;
  readonly height: number;
}) {
  const fadeHeight = props.height + 24;
  const color = String(props.color);
  return (
    <Svg
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: 0 }}
      width="100%"
      height={fadeHeight}
    >
      <Defs>
        <LinearGradient id="screen-header-scrim" x1="0" x2="0" y1="0" y2="1">
          <Stop offset={0} stopColor={color} stopOpacity={1} />
          <Stop offset={props.safeTop / fadeHeight} stopColor={color} stopOpacity={0.94} />
          <Stop offset={props.height / fadeHeight} stopColor={color} stopOpacity={0.72} />
          <Stop offset={1} stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={fadeHeight} fill="url(#screen-header-scrim)" />
    </Svg>
  );
}

/**
 * In-flow Android version of the iOS 26 navigation bar: a 44dp glass back
 * circle, the title and subtitle left-aligned beside it, and every trailing
 * action in one shared capsule. Embedded (sheet) headers center the title
 * like iOS sheets. `overlay` floats the bar over scrolling content with a
 * scrim in `overlay.color`; the content must pad itself by
 * useAndroidScreenHeaderHeight().
 */
export function AndroidScreenHeader(props: {
  readonly title: string;
  /** Replaces the title with leading content, like iOS's editor-style bar. */
  readonly titleContent?: ReactNode;
  readonly subtitle?: string | null;
  readonly actions?: ReadonlyArray<AndroidHeaderAction>;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onBack?: () => void;
  readonly embedded?: boolean;
  readonly overlay?: { readonly color: ColorValue };
  /** iOS bars have no bottom border; kept so call sites stay unchanged. */
  readonly hideBottomBorder?: boolean;
}) {
  const { scale, size } = useHeaderButtonSize();
  const liquid = useLiquidGlass().tier !== "none";
  // Inside a page sheet every screen gets the iOS sheet bar: centered title, grabber room.
  const inPageSheet = useInAndroidPageSheet();
  const embedded = props.embedded ?? inPageSheet;
  const { height: toolbarHeight, ...headerPadding } = useAndroidHeaderLayout(embedded);
  const [headerWidth, setHeaderWidth] = useState(0);
  const [sideWidths, setSideWidths] = useState({ leading: 0, trailing: 0 });
  const actions = props.actions ?? [];
  // Phones fit three capsule slots beside a readable title; wider bars fit five.
  const budget = headerWidth >= 600 ? 5 : 3;
  const directCount = actions.length > budget ? budget - 1 : actions.length;
  const visibleActions = actions.slice(0, directCount);
  const overflowActions = actions.slice(directCount);
  const centered = embedded && props.titleContent === undefined;
  const titleInset = Math.max(sideWidths.leading, sideWidths.trailing) + 8;
  const hasTrailing = actions.length > 0 || hasContent(props.trailing);

  const titleText = (
    <>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className={cn("text-header-foreground font-t3-extrabold", centered && "text-center")}
        style={{ fontSize: 17 * scale, lineHeight: 22 * scale }}
      >
        {props.title}
      </Text>
      {props.subtitle ? (
        <Text
          numberOfLines={1}
          className={cn("font-sans text-foreground-muted", centered && "text-center")}
          style={{ fontSize: 13 * scale, lineHeight: 17 * scale }}
        >
          {props.subtitle}
        </Text>
      ) : null}
    </>
  );

  const trackSide = (side: "leading" | "trailing") =>
    centered
      ? (event: { nativeEvent: { layout: { width: number } } }) => {
          const width = event.nativeEvent.layout.width;
          setSideWidths((current) =>
            current[side] === width ? current : { ...current, [side]: width },
          );
        }
      : undefined;

  const bar = (
    <View
      onLayout={(event) => setHeaderWidth(event.nativeEvent.layout.width)}
      pointerEvents={props.overlay ? "box-none" : "auto"}
      className="px-3"
      style={headerPadding}
    >
      <View
        pointerEvents="box-none"
        style={{ minHeight: toolbarHeight }}
        className="flex-row items-center"
      >
        {centered ? (
          <View
            pointerEvents="none"
            className="absolute inset-y-0 justify-center"
            style={{ left: titleInset, right: titleInset }}
          >
            {titleText}
          </View>
        ) : null}
        <View className="flex-row items-center gap-2" onLayout={trackSide("leading")}>
          {props.onBack ? (
            <AndroidHeaderIconButton
              accessibilityLabel="Back"
              icon="chevron.left"
              onPress={props.onBack}
            />
          ) : null}
          {props.leading}
        </View>

        <View
          pointerEvents="box-none"
          className={cn(
            "min-w-0 flex-1 justify-center",
            props.onBack || props.leading ? "pl-2" : "pl-1",
          )}
        >
          {props.titleContent ?? (centered ? null : titleText)}
        </View>

        {hasTrailing ? (
          <View className="pl-2" onLayout={trackSide("trailing")}>
            <AndroidHeaderButtonGroup>
              {visibleActions.map((action) =>
                action.loading ? (
                  <View
                    key={action.accessibilityLabel}
                    accessibilityLabel={action.accessibilityLabel}
                    className="items-center justify-center"
                    style={{ width: size, height: size }}
                  >
                    <AppActivityIndicator colorClassName="accent-header-foreground" />
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
            </AndroidHeaderButtonGroup>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!props.overlay) return bar;
  const barHeight = headerPadding.paddingTop + toolbarHeight + headerPadding.paddingBottom;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0" style={{ zIndex: 10 }}>
      <HeaderScrim
        color={props.overlay.color}
        safeTop={headerPadding.paddingTop}
        height={barHeight}
      />
      {liquid ? (
        // iOS 26's scroll-edge effect: content under the bar is blurred and
        // fades into the screen color, so the title stays legible. It covers
        // the static scrim when a backdrop is under it.
        <GlassSurface
          chrome="none"
          variant="edge"
          pointerEvents="none"
          tintColor={props.overlay.color}
          edgeFadeStart={barHeight / (barHeight + SCROLL_EDGE_FADE)}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: barHeight + SCROLL_EDGE_FADE,
            borderRadius: 0,
          }}
        >
          {null}
        </GlassSurface>
      ) : null}
      {bar}
    </View>
  );
}

export function AndroidSheetHeader(
  props: Omit<Parameters<typeof AndroidScreenHeader>[0], "embedded" | "overlay">,
) {
  return <AndroidScreenHeader {...props} embedded />;
}
