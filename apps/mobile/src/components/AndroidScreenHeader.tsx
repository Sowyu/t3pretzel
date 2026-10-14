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
import { GlassFill, GlassSurface } from "./GlassSurface";
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
  /** iOS's `.prominent` bar button (a sheet's Done): its own tinted glass circle. */
  readonly prominent?: boolean;
  /** A prominent action with a label renders as a text capsule ("Done") instead of the icon. */
  readonly label?: string;
}

/** How far the scroll-edge band reaches below the bar, matching the static scrim's fade. */
const SCROLL_EDGE_FADE = 24;

/** The in-flow bar's fade below its bottom edge; short enough to clear content at rest. */
const IN_FLOW_EDGE = 16;

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

/**
 * iOS's text bar button ("Cancel", "Done"): a glass capsule with a 17sp label.
 * `prominent` tints it with the action color, like a sheet's confirm button.
 */
export function AndroidHeaderTextButton(props: {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
  readonly prominent?: boolean;
}) {
  const { scale, size } = useHeaderButtonSize();
  const { themeVariables } = useAppearancePreferences();
  const liquid = useLiquidGlass().tier !== "none";
  const prominent = props.prominent && !props.disabled;
  const label = (
    <Pressable
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={cn("h-full justify-center", !liquid && "active:opacity-50")}
      style={{ paddingHorizontal: 16 * scale }}
    >
      <Text
        numberOfLines={1}
        className={cn(
          "font-t3-semibold",
          props.disabled
            ? "text-foreground-tertiary"
            : prominent
              ? "text-prominent-action-foreground"
              : "text-header-foreground",
        )}
        style={{ fontSize: 17 * scale, lineHeight: 22 * scale }}
      >
        {props.label}
      </Text>
    </Pressable>
  );
  if (!prominent) return <HeaderGlass size={size}>{label}</HeaderGlass>;
  return (
    <TintedHeaderGlass size={size} color={themeVariables["--color-prominent-action"]}>
      {label}
    </TintedHeaderGlass>
  );
}

/** A prominent bar button's surface: glass tinted with the action color, or a solid fill. */
function TintedHeaderGlass(props: {
  readonly size: number;
  readonly color: ColorValue;
  readonly children: ReactNode;
}) {
  const liquid = useLiquidGlass().tier !== "none";
  return (
    <View
      className="flex-row items-center overflow-hidden"
      style={{
        height: props.size,
        minWidth: props.size,
        borderRadius: props.size / 2,
        backgroundColor: liquid ? undefined : props.color,
        elevation: liquid ? 0 : 2,
      }}
    >
      {liquid ? <GlassFill tintColor={props.color} /> : null}
      {props.children}
    </View>
  );
}

/** iOS's `.prominent` icon bar button, like the checkmark that confirms a sheet. */
function AndroidHeaderProminentButton(props: AndroidHeaderAction) {
  const { scale, size } = useHeaderButtonSize();
  const { themeVariables } = useAppearancePreferences();
  return (
    <TintedHeaderGlass size={size} color={themeVariables["--color-prominent-action"]}>
      <Pressable
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        disabled={props.disabled}
        onPress={props.onPress}
        className="items-center justify-center rounded-full"
        style={{ width: size, height: size }}
      >
        {props.loading ? (
          <AppActivityIndicator colorClassName="accent-prominent-action-foreground" />
        ) : (
          <SymbolView
            name={props.icon}
            size={Math.round(20 * scale)}
            tintColorClassName="accent-prominent-action-foreground"
            type="monochrome"
          />
        )}
      </Pressable>
    </TintedHeaderGlass>
  );
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

/** Hangs below an in-flow bar: the screen color fading out over the content's top edge. */
function InFlowScrollEdge(props: { readonly color: ColorValue }) {
  const color = String(props.color);
  return (
    <Svg
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: "100%" }}
      width="100%"
      height={IN_FLOW_EDGE}
    >
      <Defs>
        <LinearGradient id="screen-header-edge" x1="0" x2="0" y1="0" y2="1">
          <Stop offset={0} stopColor={color} stopOpacity={1} />
          <Stop offset={0.35} stopColor={color} stopOpacity={0.55} />
          <Stop offset={1} stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={IN_FLOW_EDGE} fill="url(#screen-header-edge)" />
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
  /** Capsule slots before `actions` (Android header menus that iOS orders first). */
  readonly capsuleLeading?: ReactNode;
  readonly onBack?: () => void;
  readonly embedded?: boolean;
  readonly overlay?: { readonly color: ColorValue };
  /** iOS bars have no bottom border; kept so call sites stay unchanged. */
  readonly hideBottomBorder?: boolean;
  /** The surface under an in-flow bar, for its fade into the content. */
  readonly edgeColor?: ColorValue;
}) {
  const { scale, size } = useHeaderButtonSize();
  const { themeVariables } = useAppearancePreferences();
  const liquid = useLiquidGlass().tier !== "none";
  // Inside a page sheet every screen gets the iOS sheet bar: centered title, grabber room.
  const inPageSheet = useInAndroidPageSheet();
  const embedded = props.embedded ?? inPageSheet;
  const { height: toolbarHeight, ...headerPadding } = useAndroidHeaderLayout(embedded);
  const [headerWidth, setHeaderWidth] = useState(0);
  const [sideWidths, setSideWidths] = useState({ leading: 0, trailing: 0 });
  const allActions = props.actions ?? [];
  // Prominent actions stand apart from the capsule, as iOS separates `.prominent` items.
  const actions = allActions.filter((action) => !action.prominent);
  const prominentActions = allActions.filter((action) => action.prominent);
  // Phones fit three capsule slots beside a readable title; wider bars fit five.
  const budget = headerWidth >= 600 ? 5 : 3;
  const directCount = actions.length > budget ? budget - 1 : actions.length;
  const visibleActions = actions.slice(0, directCount);
  const overflowActions = actions.slice(directCount);
  const centered = embedded && props.titleContent === undefined;
  const titleInset = Math.max(sideWidths.leading, sideWidths.trailing) + 8;
  const hasCapsule =
    actions.length > 0 || hasContent(props.trailing) || hasContent(props.capsuleLeading);
  const hasTrailing = hasCapsule || prominentActions.length > 0;

  const titleText = (
    <>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className={cn("text-header-foreground font-t3-extrabold", centered && "text-center")}
        style={{ fontSize: 18 * scale, lineHeight: 23 * scale }}
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
          <View className="flex-row items-center gap-2 pl-2" onLayout={trackSide("trailing")}>
            {hasCapsule ? (
              <AndroidHeaderButtonGroup>
                {props.capsuleLeading}
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
            ) : null}
            {prominentActions.map((action) =>
              action.label ? (
                <AndroidHeaderTextButton
                  key={action.accessibilityLabel}
                  label={action.label}
                  accessibilityLabel={action.accessibilityLabel}
                  disabled={action.disabled}
                  onPress={action.onPress}
                  prominent
                />
              ) : (
                <AndroidHeaderProminentButton key={action.accessibilityLabel} {...action} />
              ),
            )}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!props.overlay) {
    // In-flow bars end in a short fade into the content instead of a hard
    // cut, iOS's scroll-edge look. Static, so it costs nothing while scrolling.
    return (
      <View style={{ zIndex: 10 }}>
        {bar}
        <InFlowScrollEdge
          color={
            props.edgeColor ?? themeVariables[embedded ? "--color-sheet-solid" : "--color-screen"]
          }
        />
      </View>
    );
  }
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
