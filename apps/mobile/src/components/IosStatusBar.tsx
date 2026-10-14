import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AppState, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { ClipPath, Defs, Path, Rect } from "react-native-svg";

import { statusBarModule, type StatusBarState } from "../../modules/t3-status-bar";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { batteryAppearance, formatStatusBarTime, msUntilNextMinute } from "./iosStatusBarFormat";

/*
 * Android draws the iOS status bar itself: the system bar stays hidden (a swipe
 * still shows it) and <IosStatusBar /> paints the clock, signal and battery in
 * the strip. Render it last in the app root and inside every RN <Modal>, since
 * a modal is its own window. Nothing animates: the clock repaints once per
 * minute and the rest only when the native feed reports a change.
 */

// Native feed, shared by every mounted bar. Listeners run while one is mounted.
let feedState: StatusBarState | null = null;
let feedSubscription: { remove(): void } | null = null;
const feedListeners = new Set<() => void>();

function subscribeFeed(listener: () => void) {
  feedListeners.add(listener);
  if (statusBarModule && !feedSubscription) {
    feedSubscription = statusBarModule.addListener("onChange", (next) => {
      if (feedState && next.clockRevision !== feedState.clockRevision) resyncClock();
      feedState = next;
      for (const notify of feedListeners) notify();
    });
    feedState = statusBarModule.getState();
  }
  return () => {
    feedListeners.delete(listener);
    if (feedListeners.size === 0) {
      feedSubscription?.remove();
      feedSubscription = null;
    }
  };
}

// Wall-clock minute, ticking on the boundary while the app is in the foreground.
let clockMinute = Math.floor(Date.now() / 60_000);
let clockTimer: ReturnType<typeof setTimeout> | undefined;
let clockAppState: { remove(): void } | null = null;
const clockListeners = new Set<() => void>();

function resyncClock() {
  clearTimeout(clockTimer);
  clockTimer = undefined;
  if (clockListeners.size === 0 || AppState.currentState === "background") return;
  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== clockMinute) {
    clockMinute = minute;
    for (const notify of clockListeners) notify();
  }
  // A few ms late so the timer never fires just before the boundary.
  clockTimer = setTimeout(resyncClock, msUntilNextMinute(Date.now()) + 20);
}

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockAppState = AppState.addEventListener("change", resyncClock);
    resyncClock();
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clockAppState?.remove();
      clockAppState = null;
      resyncClock();
    }
  };
}

// Full-screen surfaces that want no status bar at all.
let screenHides = 0;
const hideListeners = new Set<() => void>();
function subscribeHides(listener: () => void) {
  hideListeners.add(listener);
  return () => hideListeners.delete(listener);
}

/** Hides the drawn status bar while the calling screen is mounted, for immersive screens. */
export function useHideIosStatusBar() {
  useEffect(() => {
    screenHides += 1;
    for (const notify of hideListeners) notify();
    return () => {
      screenHides -= 1;
      for (const notify of hideListeners) notify();
    };
  }, []);
}

/** True on Android while the iOS status bar setting is on. */
export function useIosStatusBarActive() {
  const { iosStatusBarEnabled } = useAppearancePreferences();
  return statusBarModule !== null && iosStatusBarEnabled;
}

/**
 * Keeps the top safe-area inset at the status bar height while the system bar
 * is hidden, so no screen moves. Wrap the app inside SafeAreaProvider.
 */
export function IosStatusBarInsets(props: { readonly children: ReactNode }) {
  const active = useIosStatusBarActive();
  const insets = useSafeAreaInsets();
  // Re-reads the strip height on rotation.
  useWindowDimensions();
  const top = active ? (statusBarModule?.getMetrics().top ?? 0) : 0;
  const value = useMemo(() => (top > insets.top ? { ...insets, top } : insets), [insets, top]);
  return <SafeAreaInsetsContext value={value}>{props.children}</SafeAreaInsetsContext>;
}

/**
 * The root bar. Also owns hiding the system bar, so render it once in the app
 * root; modals render <IosStatusBarOverlay />.
 */
export function IosStatusBar() {
  const active = useIosStatusBarActive();
  useEffect(() => {
    statusBarModule?.setHidden(active);
  }, [active]);
  if (!statusBarModule) return null;
  return (
    <>
      {/* RN's StatusBar stack also hides it in modal windows. */}
      <StatusBar hidden={active} />
      <IosStatusBarOverlay />
    </>
  );
}

/**
 * The drawn bar alone. Render it as the last child of an RN <Modal>. Pass
 * `appearance` when the modal is always dark or light, whatever the theme.
 */
export function IosStatusBarOverlay(props: { readonly appearance?: "light" | "dark" }) {
  const active = useIosStatusBarActive();
  const hidden = useSyncExternalStore(subscribeHides, () => screenHides > 0);
  if (!active || hidden) return null;
  return <StatusBarStrip appearance={props.appearance} />;
}

const SYSTEM_GREEN = { light: "#34C759", dark: "#30D158" } as const;
const SYSTEM_RED = { light: "#FF3B30", dark: "#FF453A" } as const;
// The Dynamic Island's width, for phones without a top camera cutout.
const ISLAND_WIDTH = 126;

function StatusBarStrip(props: { readonly appearance?: "light" | "dark" }) {
  const themeAppearance = useAppearancePreferences().themeAppearance;
  const appearance = props.appearance ?? themeAppearance;
  const feed = useSyncExternalStore(subscribeFeed, () => feedState);
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Re-read with the width, so rotation moves the cutout gap.
  const metrics = statusBarModule?.getMetrics();
  if (!feed || top <= 0) return null;
  const color = appearance === "dark" ? "#FFFFFF" : "#000000";
  const leftEdge = metrics?.cutoutLeft ?? (width - ISLAND_WIDTH) / 2;
  const rightEdge = metrics?.cutoutRight ?? (width + ISLAND_WIDTH) / 2;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: top }}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: leftEdge,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBarClock color={color} use24Hour={feed.use24Hour} revision={feed.clockRevision} />
      </View>
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: rightEdge,
          right: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {feed.cellular ? <CellularGlyph color={color} bars={feed.cellularBars} /> : null}
        {feed.wifi ? <WifiGlyph color={color} bars={feed.wifiBars} /> : null}
        <BatteryGlyph
          color={color}
          level={feed.batteryLevel}
          charging={feed.charging}
          appearance={appearance}
        />
      </View>
    </View>
  );
}

function StatusBarClock(props: {
  readonly color: string;
  readonly use24Hour: boolean;
  /** Re-renders after a clock or time zone change. */
  readonly revision: number;
}) {
  const minute = useSyncExternalStore(subscribeClock, () => clockMinute);
  return (
    <Text
      allowFontScaling={false}
      style={{
        color: props.color,
        fontFamily: "DMSans-SemiBold",
        fontSize: 17,
        letterSpacing: -0.2,
        includeFontPadding: false,
      }}
    >
      {formatStatusBarTime(new Date(minute * 60_000), props.use24Hour)}
    </Text>
  );
}

const DIM = 0.3;

function CellularGlyph(props: { readonly color: string; readonly bars: number }) {
  const heights = [4.2, 6.4, 8.7, 11];
  return (
    <Svg width={17} height={11} viewBox="0 0 17 11">
      {heights.map((height, index) => (
        <Rect
          key={height}
          x={index * 4.65}
          y={11 - height}
          width={3.05}
          height={height}
          rx={1}
          fill={props.color}
          opacity={index < props.bars ? 1 : DIM}
        />
      ))}
    </Svg>
  );
}

// The fan's apex sits at the bottom centre; arcs span 45 degrees each side.
const WIFI_W = 16;
const WIFI_H = 11.5;
function wifiPoint(radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return `${(WIFI_W / 2 + radius * Math.sin(radians)).toFixed(2)} ${(WIFI_H - radius * Math.cos(radians)).toFixed(2)}`;
}
function wifiArc(radius: number) {
  return `M${wifiPoint(radius, -45)}A${radius} ${radius} 0 0 1 ${wifiPoint(radius, 45)}`;
}
const WIFI_DOT = `M${WIFI_W / 2} ${WIFI_H - 0.6}L${wifiPoint(3.4, -45)}A3.4 3.4 0 0 1 ${wifiPoint(3.4, 45)}Z`;
const WIFI_ARCS = [wifiArc(6.1), wifiArc(9.9)];

function WifiGlyph(props: { readonly color: string; readonly bars: number }) {
  return (
    <Svg width={WIFI_W} height={WIFI_H} viewBox={`0 0 ${WIFI_W} ${WIFI_H}`}>
      <Path
        d={WIFI_DOT}
        fill={props.color}
        stroke={props.color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {WIFI_ARCS.map((d, index) => (
        <Path
          key={d}
          d={d}
          fill="none"
          stroke={props.color}
          strokeWidth={2.4}
          strokeLinecap="round"
          opacity={index + 2 <= props.bars ? 1 : DIM}
        />
      ))}
    </Svg>
  );
}

const BOLT = "M13.6 1.6L8.4 7.1h3.3l-1.3 3.3 5.2-5.5h-3.3z";

function BatteryGlyph(props: {
  readonly color: string;
  readonly level: number;
  readonly charging: boolean;
  readonly appearance: "light" | "dark";
}) {
  const { fill, tone } = batteryAppearance(props.level, props.charging);
  const fillColor =
    tone === "charging"
      ? SYSTEM_GREEN[props.appearance]
      : tone === "low"
        ? SYSTEM_RED[props.appearance]
        : props.color;
  return (
    <Svg width={27.5} height={12} viewBox="0 0 27.5 12">
      <Defs>
        <ClipPath id="ios-battery-body">
          <Rect x={0} y={0} width={25} height={12} rx={4} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={25} height={12} rx={4} fill={props.color} opacity={0.35} />
      <Rect
        x={0}
        y={0}
        width={25 * fill}
        height={12}
        fill={fillColor}
        clipPath="url(#ios-battery-body)"
      />
      <Path
        d="M26 4h0.2a1.3 1.3 0 0 1 1.3 1.3v1.4a1.3 1.3 0 0 1-1.3 1.3H26z"
        fill={props.color}
        opacity={0.4}
      />
      {props.charging ? <Path d={BOLT} fill="#FFFFFF" /> : null}
    </Svg>
  );
}
