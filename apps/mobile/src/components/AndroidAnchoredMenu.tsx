import type { MenuAction, MenuComponentProps } from "@react-native-menu/menu";
import type { ReactNode, Ref } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import Animated, { Keyframe, ReduceMotion } from "react-native-reanimated";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { cn } from "../lib/cn";
import { AppText as Text } from "./AppText";
import { isAppSymbolName, SymbolView } from "./AppSymbol";
import { OverlayPortal } from "./OverlayPortal";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

const SCREEN_MARGIN = 12;
const ANCHOR_GAP = 6;

// One short scale-and-fade, skipped entirely when the system asks for reduced motion.
const MENU_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
})
  .duration(160)
  .reduceMotion(ReduceMotion.System);

// Anchor position is snapshotted in window coordinates when the menu opens;
// the overlay root measures itself the same way, and the menu is placed from
// the delta. Both snapshots are taken at open time so later reflows (keyboard
// show/hide, screen transitions) can't flip an opens-up menu to opens-down
// mid-presentation.
type AnchorSnapshot = {
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
  readonly separator: boolean;
  readonly ref?: Ref<ViewInstance>;
  readonly onPress: () => void;
}) {
  const { scale } = useAndroidControlSizing();
  const { themeAppearance } = useAppearancePreferences();
  const iconSize = Math.round(18 * scale);
  const tint = props.disabled
    ? "accent-icon-subtle"
    : props.destructive
      ? "accent-danger-foreground"
      : "accent-foreground";
  const trailingIcon = props.submenu ? "chevron.right" : props.icon;
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
      className="flex-row items-center border-separator px-4 active:bg-subtle"
      style={{
        minHeight: Math.max(44, 44 * scale),
        gap: 10 * scale,
        paddingVertical: 10 * scale,
        borderTopWidth: props.separator ? StyleSheet.hairlineWidth : 0,
        // The theme separator vanishes on the lifted dark menu fill.
        ...(themeAppearance === "dark" ? { borderColor: "rgba(255, 255, 255, 0.08)" } : null),
      }}
    >
      {props.back ? (
        <SymbolView name="chevron.left" size={iconSize} tintColorClassName={tint} />
      ) : props.checkColumn ? (
        <View style={{ width: iconSize }}>
          {props.checked ? (
            <SymbolView name="checkmark" size={iconSize} tintColorClassName={tint} />
          ) : null}
        </View>
      ) : null}
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            "text-base",
            props.back && "font-t3-bold",
            props.disabled
              ? "text-foreground-tertiary"
              : props.destructive
                ? "text-danger-foreground"
                : "text-foreground",
          )}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text className="text-xs text-foreground-muted">{props.subtitle}</Text>
        ) : null}
      </View>
      {!props.back && trailingIcon && isAppSymbolName(trailingIcon) ? (
        <SymbolView name={trailingIcon} size={iconSize} tintColorClassName={tint} />
      ) : null}
    </Pressable>
  );
}

/**
 * Renders the app's MenuView actions as an iOS-style context menu on Android.
 * The menu lives in-window (OverlayPortal) so opening it from the composer
 * keeps the keyboard up; back press and a tap outside dismiss it, and
 * TalkBack focus moves into the menu and back to the anchor.
 */
export function AndroidAnchoredMenu(props: AndroidAnchoredMenuProps) {
  const { scale, menuWidth: desiredMenuWidth } = useAndroidControlSizing();
  const { themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  const [anchor, setAnchor] = useState<AnchorSnapshot | null>(null);
  const [path, setPath] = useState<readonly MenuAction[]>([]);
  // Height of the overlay root. Menus that flip above their anchor are pinned
  // by their BOTTOM edge (bottom = rootHeight - anchorTop), so drill-in height
  // changes grow upward without re-measurement or a two-frame jitter.
  const [overlay, setOverlay] = useState<OverlayFrame | null>(null);
  const menuWidth =
    overlay === null
      ? desiredMenuWidth
      : Math.min(desiredMenuWidth, Math.max(0, overlay.width - 2 * SCREEN_MARGIN));
  const anchorRef = useRef<ViewInstance>(null);
  const overlayRef = useRef<ViewInstance>(null);
  const firstRowRef = useRef<ViewInstance>(null);

  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboardHeight = useKeyboardState((state) => state.height);
  const close = useCallback(() => {
    setAnchor(null);
    setPath([]);
    setOverlay(null);
    // Return TalkBack focus to the control that opened the menu.
    setTimeout(() => focusAccessibility(anchorRef.current), 0);
  }, []);

  const open = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, []);

  const measureOverlay = useCallback(() => {
    overlayRef.current?.measureInWindow((x, y, width, height) => {
      setOverlay({ x, y, width, height });
    });
  }, []);

  // Back returns to the parent submenu before closing the menu.
  const submenuDepth = path.length;
  const isOpen = anchor !== null;
  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (submenuDepth > 0) setPath((current) => current.slice(0, -1));
      else close();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, close, submenuDepth]);

  const parent = path[path.length - 1] ?? null;
  const levelActions = (parent?.subactions ?? props.actions).filter(
    (action) => !(action.attributes?.hidden ?? false),
  );

  // Anchor in overlay-local coordinates (both measured in window space).
  const local =
    anchor === null || overlay === null
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
    local === null ? 0 : alignsLeft ? local.x : local.x + local.width - menuWidth;
  const left =
    overlay === null
      ? 0
      : Math.min(Math.max(preferredLeft, SCREEN_MARGIN), overlay.width - menuWidth - SCREEN_MARGIN);
  // The keyboard can stay up while the menu is open (in-window overlay, no
  // focus change), so the space it covers is not usable.
  const usableBottom =
    overlay === null ? 0 : overlay.height - (keyboardVisible ? keyboardHeight : 0);
  const spaceBelow =
    local === null ? 0 : usableBottom - (local.y + local.height) - ANCHOR_GAP - SCREEN_MARGIN;
  const spaceAbove = local === null ? 0 : local.y - ANCHOR_GAP - SCREEN_MARGIN;
  const opensDown = spaceBelow >= 280 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(opensDown ? spaceBelow : spaceAbove, 480);

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

  const checkColumn = levelActions.some((action) => action.state === "on");
  const showTitle = parent === null && Boolean(props.title);

  return (
    <>
      {typeof props.children === "function" ? (
        <View ref={anchorRef} collapsable={false} className={props.className} style={props.style}>
          {props.children(open)}
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
          <View pointerEvents="none">{props.children}</View>
        </Pressable>
      )}
      {anchor === null ? null : (
        <OverlayPortal>
          <View
            ref={overlayRef}
            collapsable={false}
            className="absolute inset-0"
            onLayout={measureOverlay}
          >
            <Pressable
              accessibilityLabel="Close menu"
              accessibilityRole="button"
              className="absolute inset-0"
              onPress={close}
            />
            {local === null ? null : (
              <Animated.View
                key={submenuDepth === 0 ? "root" : "submenu"}
                entering={submenuDepth === 0 ? MENU_ENTER : undefined}
                accessibilityRole="menu"
                className="absolute overflow-hidden border-separator"
                style={{
                  left,
                  maxHeight,
                  width: menuWidth,
                  borderRadius: 14,
                  borderWidth: StyleSheet.hairlineWidth,
                  // Solid: iOS blurs what is behind a menu, and without a blur any
                  // translucency lets the text underneath read through the items.
                  // Dark menus sit a step above the screen, like iOS's lighter dark menus.
                  backgroundColor: isDark
                    ? colors["--color-grouped-card"]
                    : colors["--color-card-alt"],
                  ...(isDark ? { borderColor: "rgba(255, 255, 255, 0.1)" } : null),
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
                  transformOrigin: `${opensDown ? "top" : "bottom"} ${alignsLeft ? "left" : "right"}`,
                  ...(opensDown
                    ? { top: local.y + local.height + ANCHOR_GAP }
                    : { bottom: (overlay?.height ?? 0) - local.y + ANCHOR_GAP }),
                }}
              >
                {/* keyboardShouldPersistTaps: the menu often opens over an
                    active editor; the first item tap must act, not just
                    dismiss the keyboard. */}
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator={false}
                >
                  {showTitle ? (
                    <View
                      ref={firstRowRef}
                      accessible
                      accessibilityRole="header"
                      className="px-4"
                      style={{ paddingVertical: 8 * scale }}
                    >
                      <Text className="text-center text-xs text-foreground-muted">
                        {props.title}
                      </Text>
                    </View>
                  ) : null}
                  {parent ? (
                    <MenuRow
                      back
                      ref={firstRowRef}
                      title={parent.title}
                      checkColumn={false}
                      separator={false}
                      onPress={() => setPath((current) => current.slice(0, -1))}
                    />
                  ) : null}
                  {levelActions.map((action, index) => (
                    <MenuRow
                      key={action.id ?? `${index}-${action.title}`}
                      ref={index === 0 && !parent && !showTitle ? firstRowRef : undefined}
                      title={action.title}
                      subtitle={action.subtitle}
                      icon={action.image}
                      checked={action.state === "on"}
                      checkColumn={checkColumn}
                      destructive={action.attributes?.destructive}
                      disabled={action.attributes?.disabled}
                      submenu={(action.subactions?.length ?? 0) > 0}
                      separator={index > 0 || parent !== null || showTitle}
                      onPress={() => onPressItem(action)}
                    />
                  ))}
                </ScrollView>
              </Animated.View>
            )}
          </View>
        </OverlayPortal>
      )}
    </>
  );
}
