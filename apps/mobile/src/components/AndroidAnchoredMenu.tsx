import type { MenuAction, MenuComponentProps } from "@react-native-menu/menu";
import type { ReactNode, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StyleProp, ViewInstance, ViewStyle } from "react-native";
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import Animated, {
  type EntryExitAnimationFunction,
  ReduceMotion,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { viewMirrorView } from "../../modules/t3-liquid-glass";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { cn } from "../lib/cn";
import { menuSections } from "./menuSections";
import { AppText as Text } from "./AppText";
import { isAppSymbolName, SymbolView } from "./AppSymbol";
import { GlassSurface } from "./GlassSurface";
import { OverlayPortal } from "./OverlayPortal";
import { useLiquidGlass } from "./useLiquidGlass";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

const SCREEN_MARGIN = 12;
const ANCHOR_GAP = 6;

// UIMenu's presentation: a spring from 0.85 at the anchor corner with a fade
// in, and a quicker fade out. Both run on the UI thread.
const MENU_ENTER: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.85 }] },
    animations: {
      opacity: withTiming(1, { duration: 140, reduceMotion: ReduceMotion.System }),
      transform: [
        {
          scale: withSpring(1, {
            duration: 220,
            dampingRatio: 0.82,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    },
  };
};

const MENU_EXIT: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 120, reduceMotion: ReduceMotion.System }),
      transform: [
        { scale: withTiming(0.92, { duration: 120, reduceMotion: ReduceMotion.System }) },
      ],
    },
  };
};

// The long-press preview: the scrim fades in while the pressed row lifts a
// little, as UIContextMenuInteraction does. One-shot, on the UI thread.
const SCRIM_ENTER: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System }) },
  };
};

const SCRIM_EXIT: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, { duration: 140, reduceMotion: ReduceMotion.System }) },
  };
};

const PREVIEW_SCALE = 1.02;

const PREVIEW_ENTER: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { transform: [{ scale: 1 }] },
    animations: {
      transform: [
        {
          scale: withSpring(PREVIEW_SCALE, {
            duration: 260,
            dampingRatio: 0.7,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    },
  };
};

const Mirror = viewMirrorView();

// Anchor position is snapshotted in window coordinates when the menu opens;
// the overlay root measures itself the same way, and the menu is placed from
// the delta. Both snapshots are taken at open time so later reflows (keyboard
// show/hide, screen transitions) can't flip an opens-up menu to opens-down
// mid-presentation.
type AnchorSnapshot = {
  /** The anchor's native tag, for the context preview's mirror. */
  readonly tag: number | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type OverlayFrame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type AndroidAnchoredMenuProps = {
  readonly actions: readonly MenuAction[];
  readonly title?: string;
  readonly onPressAction?: MenuComponentProps["onPressAction"];
  /** Applied to the anchor wrapper — call sites flex these to fill toolbars. */
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
  /**
   * Plain children open the menu on tap (the wrapper owns the press). A
   * render function keeps the children interactive and hands them `open` to
   * call from their own gesture — e.g. a row that selects on tap and opens
   * this menu on long-press.
   */
  readonly children: ReactNode | ((open: () => void) => ReactNode);
  /**
   * Replaces the action rows with custom content in the same anchored card,
   * like a SwiftUI popover. Receives `close` for its own Cancel/Done buttons.
   */
  readonly popover?: (close: () => void) => ReactNode;
  /** Card width for `popover` content; menus use the UIMenu width. */
  readonly popoverWidth?: number;
  /**
   * The long-press context menu look: the screen blurs and dims, and the
   * anchor lifts above the scrim with the menu under it.
   */
  readonly contextPreview?: boolean;
  /** Called after the menu closes for any reason (tap outside, back, an item, `close`). */
  readonly onClose?: () => void;
};

function focusAccessibility(target: ViewInstance | null) {
  const tag = target ? findNodeHandle(target) : null;
  if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
}

function MenuRow({
  ref,
  ...props
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: string;
  readonly checked?: boolean;
  readonly checkColumn: boolean;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly submenu?: boolean;
  readonly back?: boolean;
  readonly ref?: Ref<ViewInstance>;
  readonly onPress: () => void;
}) {
  const { scale } = useAndroidControlSizing();
  const { themeAppearance } = useAppearancePreferences();
  const iconSize = Math.round(19 * scale);
  const checkSize = Math.round(15 * scale);
  const tint = props.disabled
    ? "accent-icon-subtle"
    : props.destructive
      ? "accent-danger-foreground"
      : "accent-foreground";
  const trailingIcon = props.submenu ? "chevron.right" : props.icon;
  const pressedFill =
    themeAppearance === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.06)";
  return (
    <Pressable
      ref={ref}
      accessibilityRole="menuitem"
      accessibilityLabel={props.back ? `Back to ${props.title}` : undefined}
      accessibilityState={{
        disabled: Boolean(props.disabled),
        checked: props.checkColumn ? Boolean(props.checked) : undefined,
        expanded: props.submenu ? false : undefined,
      }}
      disabled={props.disabled}
      onPress={props.onPress}
      className="flex-row items-center"
      // iOS 26 highlights a pressed row with a rounded fill inset from the card
      // edge; the 10dp inner padding keeps labels 16dp from the edge.
      style={({ pressed }) => ({
        minHeight: Math.max(44, 44 * scale),
        marginHorizontal: 6,
        paddingHorizontal: 10,
        paddingVertical: 10 * scale,
        gap: 10 * scale,
        borderRadius: 14,
        backgroundColor: pressed ? pressedFill : undefined,
      })}
    >
      {props.back ? (
        <SymbolView name="chevron.left" size={checkSize} tintColorClassName={tint} />
      ) : props.checkColumn ? (
        <View style={{ width: checkSize }}>
          {props.checked ? (
            <SymbolView name="checkmark" size={checkSize} tintColorClassName={tint} />
          ) : null}
        </View>
      ) : null}
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            props.back && "font-t3-bold",
            props.disabled
              ? "text-foreground-tertiary"
              : props.destructive
                ? "text-danger-foreground"
                : "text-foreground",
          )}
          style={{ fontSize: 17 * scale, lineHeight: 22 * scale }}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text
            className={props.disabled ? "text-foreground-tertiary" : "text-foreground-muted"}
            style={{ fontSize: 15 * scale, lineHeight: 20 * scale }}
          >
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {!props.back && trailingIcon && isAppSymbolName(trailingIcon) ? (
        <SymbolView name={trailingIcon} size={iconSize} tintColorClassName={tint} />
      ) : null}
    </Pressable>
  );
}

/** The thin line iOS 26 draws between menu sections; items within a section have none. */
function SectionSeparator(props: { readonly dark: boolean }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 16,
        marginVertical: 4,
        backgroundColor: props.dark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.1)",
      }}
    />
  );
}

/**
 * Renders the app's MenuView actions as an iOS-style context menu on Android.
 * The menu lives in-window (OverlayPortal) so opening it from the composer
 * keeps the keyboard up; back press and a tap outside dismiss it, and
 * TalkBack focus moves into the menu and back to the anchor.
 *
 * Closed, this is only the anchor wrapper: everything the open menu needs
 * (keyboard state, theme, sizing) lives in OpenMenu, so the many closed menus
 * on a list's rows never re-render when the keyboard moves.
 */
export function AndroidAnchoredMenu(props: AndroidAnchoredMenuProps) {
  const [anchor, setAnchor] = useState<AnchorSnapshot | null>(null);
  const anchorRef = useRef<ViewInstance>(null);

  const { onClose } = props;
  const close = useCallback(() => {
    setAnchor(null);
    // Return TalkBack focus to the control that opened the menu.
    setTimeout(() => focusAccessibility(anchorRef.current), 0);
    onClose?.();
  }, [onClose]);

  const open = useCallback(() => {
    const anchorView = anchorRef.current;
    anchorView?.measureInWindow((x, y, width, height) => {
      setAnchor({ tag: findNodeHandle(anchorView) ?? null, x, y, width, height });
    });
  }, []);

  // Opening and closing re-render this wrapper; the same element lets React
  // skip the anchor's own subtree.
  const { children } = props;
  const anchorContent = useMemo(
    () => (typeof children === "function" ? children(open) : children),
    [children, open],
  );

  return (
    <>
      {typeof children === "function" ? (
        <View ref={anchorRef} collapsable={false} className={props.className} style={props.style}>
          {anchorContent}
        </View>
      ) : (
        <Pressable
          ref={anchorRef}
          accessibilityRole="button"
          className={props.className}
          collapsable={false}
          style={props.style}
          onPress={open}
        >
          <View pointerEvents="none">{anchorContent}</View>
        </Pressable>
      )}
      {anchor === null ? null : <OpenMenu {...props} anchor={anchor} close={close} />}
    </>
  );
}

function OpenMenu(
  props: AndroidAnchoredMenuProps & {
    readonly anchor: AnchorSnapshot;
    readonly close: () => void;
  },
) {
  const { anchor, close } = props;
  const { scale, menuWidth } = useAndroidControlSizing();
  const desiredMenuWidth = props.popover ? (props.popoverWidth ?? menuWidth) : menuWidth;
  const { themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const liquid = useLiquidGlass().tier !== "none";
  const [path, setPath] = useState<readonly MenuAction[]>([]);
  // Height of the overlay root. Menus that flip above their anchor are pinned
  // by their BOTTOM edge (bottom = rootHeight - anchorTop), so drill-in height
  // changes grow upward without re-measurement or a two-frame jitter.
  const [overlay, setOverlay] = useState<OverlayFrame | null>(null);
  const cardWidth =
    overlay === null
      ? desiredMenuWidth
      : Math.min(desiredMenuWidth, Math.max(0, overlay.width - 2 * SCREEN_MARGIN));
  const overlayRef = useRef<ViewInstance>(null);
  const firstRowRef = useRef<ViewInstance>(null);
  // The mirror draws the live anchor view; without the native module the
  // menu still opens, just without the lifted row.
  const previewTag = props.contextPreview && Mirror ? anchor.tag : null;
  const anchorGap = previewTag === null ? ANCHOR_GAP : ANCHOR_GAP + 6;

  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboardHeight = useKeyboardState((state) => state.height);

  const measureOverlay = useCallback(() => {
    overlayRef.current?.measureInWindow((x, y, width, height) => {
      setOverlay({ x, y, width, height });
    });
  }, []);

  // Back returns to the parent submenu before closing the menu.
  const submenuDepth = path.length;
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (submenuDepth > 0) setPath((current) => current.slice(0, -1));
      else close();
      return true;
    });
    return () => subscription.remove();
  }, [close, submenuDepth]);

  const parent = path[path.length - 1] ?? null;
  const sections = menuSections(parent?.subactions ?? props.actions);

  // Anchor in overlay-local coordinates (both measured in window space).
  const local =
    overlay === null
      ? null
      : {
          x: anchor.x - overlay.x,
          y: anchor.y - overlay.y,
          width: anchor.width,
          height: anchor.height,
        };
  const alignsLeft =
    local === null || overlay === null ? true : local.x + local.width / 2 <= overlay.width / 2;
  const preferredLeft =
    local === null ? 0 : alignsLeft ? local.x : local.x + local.width - cardWidth;
  const left =
    overlay === null
      ? 0
      : Math.min(Math.max(preferredLeft, SCREEN_MARGIN), overlay.width - cardWidth - SCREEN_MARGIN);
  // The keyboard can stay up while the menu is open (in-window overlay, no
  // focus change), so the space it covers is not usable.
  const usableBottom =
    overlay === null ? 0 : overlay.height - (keyboardVisible ? keyboardHeight : 0);
  const spaceBelow =
    local === null ? 0 : usableBottom - (local.y + local.height) - anchorGap - SCREEN_MARGIN;
  const spaceAbove = local === null ? 0 : local.y - anchorGap - SCREEN_MARGIN;
  const opensDown = spaceBelow >= 280 || spaceBelow >= spaceAbove;
  // UIMenu uses the room up to the screen edge, then scrolls.
  const maxHeight = Math.min(
    opensDown ? spaceBelow : spaceAbove,
    overlay === null ? 0 : overlay.height * 0.8,
  );

  // Move TalkBack focus into the menu once it is placed, and on each drill-in.
  const placed = local !== null;
  useEffect(() => {
    if (!placed) return;
    const timer = setTimeout(() => focusAccessibility(firstRowRef.current), 50);
    return () => clearTimeout(timer);
  }, [placed, submenuDepth]);

  const { onPressAction } = props;
  const onPressItem = useCallback(
    (action: MenuAction) => {
      if ((action.subactions?.length ?? 0) > 0) {
        setPath((current) => [...current, action]);
        return;
      }
      close();
      if (action.id !== undefined) {
        onPressAction?.({
          nativeEvent: { event: action.id },
        } as Parameters<NonNullable<MenuComponentProps["onPressAction"]>>[0]);
      }
    },
    [close, onPressAction],
  );

  // One leading checkmark column for the whole level, as UIMenu aligns it.
  const checkColumn = sections.some((section) =>
    section.actions.some((action) => action.state === "on"),
  );
  const showTitle = parent === null && Boolean(props.title) && !props.popover;

  return (
    <OverlayPortal>
      <View
        ref={overlayRef}
        collapsable={false}
        className="absolute inset-0"
        onLayout={measureOverlay}
      >
        {previewTag === null ? (
          <Pressable
            accessibilityLabel="Close menu"
            accessibilityRole="button"
            className="absolute inset-0"
            onPress={close}
          />
        ) : (
          <Animated.View entering={SCRIM_ENTER} exiting={SCRIM_EXIT} className="absolute inset-0">
            {liquid ? (
              // One blur over the still screen: nothing under it moves while
              // the menu is open, so it draws only while the scrim fades.
              <GlassSurface
                chrome="none"
                variant="scrim"
                tintColor={isDark ? "rgba(0, 0, 0, 0.36)" : "rgba(0, 0, 0, 0.14)"}
                pointerEvents="none"
                style={{ position: "absolute", inset: 0, borderRadius: 0 }}
              >
                {null}
              </GlassSurface>
            ) : (
              <View
                pointerEvents="none"
                className="absolute inset-0"
                style={{ backgroundColor: isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.22)" }}
              />
            )}
            <Pressable
              accessibilityLabel="Close menu"
              accessibilityRole="button"
              className="absolute inset-0"
              onPress={close}
            />
          </Animated.View>
        )}
        {local === null || previewTag === null || !Mirror ? null : (
          <Animated.View
            entering={PREVIEW_ENTER}
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              left: local.x,
              top: local.y,
              width: local.width,
              height: local.height,
              borderRadius: 16,
              transform: [{ scale: PREVIEW_SCALE }],
              boxShadow: isDark
                ? "0 10px 32px rgba(0, 0, 0, 0.6)"
                : "0 10px 32px rgba(0, 0, 0, 0.2)",
            }}
          >
            <View
              className="flex-1 overflow-hidden"
              style={{ borderRadius: 16, backgroundColor: colors["--color-screen"] }}
            >
              <Mirror sourceTag={previewTag} style={{ flex: 1 }} />
            </View>
          </Animated.View>
        )}
        {local === null ? null : (
          <Animated.View
            entering={MENU_ENTER}
            exiting={MENU_EXIT}
            accessibilityRole="menu"
            className="absolute overflow-hidden"
            style={{
              left,
              maxHeight,
              width: cardWidth,
              borderRadius: 24,
              // Glass draws its own rim. Without glass the card is solid: any
              // translucency without a blur lets the text underneath read
              // through the items. Dark menus sit a step above the screen,
              // like iOS's lighter dark menus.
              borderWidth: liquid ? 0 : StyleSheet.hairlineWidth,
              backgroundColor: liquid
                ? "transparent"
                : isDark
                  ? colors["--color-grouped-card"]
                  : colors["--color-card-alt"],
              borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
              boxShadow: isDark
                ? "0 16px 48px rgba(0, 0, 0, 0.55)"
                : "0 16px 48px rgba(0, 0, 0, 0.18)",
              transformOrigin: `${opensDown ? "top" : "bottom"} ${alignsLeft ? "left" : "right"}`,
              ...(opensDown
                ? { top: local.y + local.height + anchorGap }
                : { bottom: (overlay?.height ?? 0) - local.y + anchorGap }),
            }}
          >
            {liquid ? (
              <GlassSurface
                chrome="none"
                variant="menu"
                pointerEvents="none"
                style={{ position: "absolute", inset: 0, borderRadius: 24 }}
              >
                {null}
              </GlassSurface>
            ) : null}
            {props.popover ? (
              props.popover(close)
            ) : (
              // keyboardShouldPersistTaps: the menu often opens over an
              // active editor; the first item tap must act, not just
              // dismiss the keyboard. The key resets scroll on drill-in.
              <ScrollView
                key={submenuDepth}
                bounces={false}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 6 }}
              >
                {showTitle ? (
                  <View
                    ref={firstRowRef}
                    accessible
                    accessibilityRole="header"
                    style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}
                  >
                    <Text
                      className="text-center text-foreground-muted"
                      style={{ fontSize: 13 * scale, lineHeight: 18 * scale }}
                    >
                      {props.title}
                    </Text>
                  </View>
                ) : null}
                {parent ? (
                  <>
                    <MenuRow
                      back
                      ref={firstRowRef}
                      title={parent.title}
                      checkColumn={false}
                      onPress={() => setPath((current) => current.slice(0, -1))}
                    />
                    <SectionSeparator dark={isDark} />
                  </>
                ) : null}
                {sections.map((section, sectionIndex) => (
                  <View key={section.key}>
                    {sectionIndex > 0 ? <SectionSeparator dark={isDark} /> : null}
                    {section.title ? (
                      <Text
                        accessibilityRole="header"
                        className="text-foreground-muted"
                        style={{
                          fontSize: 13 * scale,
                          lineHeight: 18 * scale,
                          paddingHorizontal: 16,
                          paddingTop: 6,
                          paddingBottom: 2,
                        }}
                      >
                        {section.title}
                      </Text>
                    ) : null}
                    {section.actions.map((action, index) => (
                      <MenuRow
                        key={action.id ?? `${index}-${action.title}`}
                        ref={
                          sectionIndex === 0 && index === 0 && !parent && !showTitle
                            ? firstRowRef
                            : undefined
                        }
                        title={action.title}
                        subtitle={action.subtitle}
                        icon={action.image}
                        checked={action.state === "on"}
                        checkColumn={checkColumn}
                        destructive={action.attributes?.destructive}
                        disabled={action.attributes?.disabled}
                        submenu={(action.subactions?.length ?? 0) > 0}
                        onPress={() => onPressItem(action)}
                      />
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        )}
      </View>
    </OverlayPortal>
  );
}
