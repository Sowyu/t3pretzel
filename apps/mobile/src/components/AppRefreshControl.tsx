import { useEffect } from "react";
import { Platform, RefreshControl, View, type RefreshControlProps } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppActivityIndicator } from "./AppActivityIndicator";

/** UIRefreshControl's default tint (systemGray). */
const IOS_SPINNER_GRAY = "#8E8E93";
/** How far UIRefreshControl pushes the content down while it spins. */
const REFRESH_GAP = 56;
const SHIFT = { duration: 320, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;

/**
 * Pull to refresh. ScrollView clones this element and passes the list as its
 * child, so every prop is forwarded.
 *
 * Android keeps SwipeRefreshLayout for the pull itself (a bare gray arc, no
 * Material disc). Once refreshing, the arc hides, the content slides down
 * like UIRefreshControl's, and the iOS spokes spin in the gap above it. The
 * slide is one UI-thread spring per state change; nothing runs while idle.
 */
// ponytail: the pull itself is still Android's arc; a gesture-driven spokes control needs every list on an animated scroll handler.
export function AppRefreshControl(props: RefreshControlProps) {
  if (Platform.OS !== "android") return <RefreshControl {...props} />;
  return <AndroidRefreshControl {...props} />;
}

function AndroidRefreshControl({ children, style, refreshing, ...props }: RefreshControlProps) {
  const shift = useSharedValue(refreshing ? REFRESH_GAP : 0);
  useEffect(() => {
    shift.set(withSpring(refreshing ? REFRESH_GAP : 0, SHIFT));
  }, [refreshing, shift]);
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: shift.get() }] }));

  return (
    <View style={[style, { overflow: "hidden" }]}>
      {refreshing ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 items-center justify-center"
          // Content under a floating header starts at progressViewOffset.
          style={{ top: props.progressViewOffset ?? 0, height: REFRESH_GAP }}
        >
          <AppActivityIndicator color={IOS_SPINNER_GRAY} />
        </View>
      ) : null}
      <Animated.View style={[{ flex: 1 }, contentStyle]}>
        <RefreshControl
          progressBackgroundColor="transparent"
          {...props}
          // The spokes take over once refreshing; the arc only shows during the pull.
          colors={[refreshing ? "transparent" : IOS_SPINNER_GRAY]}
          refreshing={refreshing}
          style={{ flex: 1 }}
        >
          {children}
        </RefreshControl>
      </Animated.View>
    </View>
  );
}
