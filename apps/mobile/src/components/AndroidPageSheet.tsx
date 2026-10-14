import { useNavigation, type NavigationAction } from "@react-navigation/native";
import { createContext, use, useEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { GlassFlatBackdrop } from "./GlassBackdropSource";

/** iOS 26 page-sheet corners. */
const CORNER_RADIUS = 38;
/** iOS 26 floats a sheet below its full-height detent this far from the screen edges. */
const EDGE_INSET = 8;
/** iOS's compact settings sheet detent (Stack.tsx), as a share of the window height. */
const DETENT = 0.92;
/** Drags that start this far from the sheet top (grabber plus header) move the sheet. */
const DRAG_ZONE = 76;
const PRESENT = { duration: 480, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const DISMISS = {
  duration: 260,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
} as const;

const InPageSheetContext = createContext(false);

/** True inside an Android page sheet; headers center their title and leave room for the grabber. */
export function useInAndroidPageSheet() {
  return use(InPageSheetContext);
}

/**
 * The iOS page sheet for an Android `transparentModal` route: the screen
 * below stays visible and dimmed, the inset card slides up from the bottom
 * with a grabber, and a downward drag on the grabber or
 * header dismisses it. Every removal of the route (back, close buttons,
 * resets) first slides the card out. Motion runs on the UI thread and only
 * while the sheet moves.
 */
export function AndroidPageSheet(props: { readonly children: ReactNode }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { themeAppearance } = useAppearancePreferences();
  const top = Math.max(insets.top + 8, Math.round(height * (1 - DETENT)));
  const travel = height - top;
  const offset = useSharedValue(travel);
  const removing = useRef(false);

  useEffect(() => {
    offset.set(withSpring(0, PRESENT));
    // Present once; later size changes keep the card where it is.
  }, [offset]);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (removing.current) return;
        event.preventDefault();
        const finish = (action: NavigationAction) => {
          removing.current = true;
          navigation.dispatch(action);
        };
        offset.set(
          withTiming(travel, DISMISS, (finished) => {
            if (finished) runOnJS(finish)(event.data.action);
          }),
        );
      }),
    [navigation, offset, travel],
  );

  const dismissAfterDrag = () => {
    removing.current = true;
    navigation.goBack();
  };

  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      if (touch && touch.y > DRAG_ZONE) manager.fail();
    })
    .onUpdate((event) => {
      offset.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY > travel * 0.3 || event.velocityY > 900) {
        offset.set(
          withTiming(travel, DISMISS, (finished) => {
            if (finished) runOnJS(dismissAfterDrag)();
          }),
        );
      } else {
        offset.set(withSpring(0, PRESENT));
      }
    });

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [0, travel], [1, 0], "clamp"),
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            // UIKit's dimming view over the presenting screen.
            {
              backgroundColor: themeAppearance === "dark" ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.24)",
            },
            dimStyle,
          ]}
        />
      </Pressable>
      <GestureDetector gesture={drag}>
        <Animated.View
          className="absolute overflow-hidden bg-sheet-solid"
          style={[
            {
              top,
              left: EDGE_INSET,
              right: EDGE_INSET,
              bottom: EDGE_INSET,
              borderRadius: CORNER_RADIUS,
            },
            cardStyle,
          ]}
        >
          <InPageSheetContext value>
            <SafeAreaInsetsContext
              value={{ ...insets, top: 0, bottom: Math.max(0, insets.bottom - EDGE_INSET) }}
            >
              {/* Header glass samples the sheet, not the dimmed screen behind it. */}
              <GlassFlatBackdrop />
              {props.children}
            </SafeAreaInsetsContext>
          </InPageSheetContext>
          {/* The lit top edge of the card. */}
          <View
            pointerEvents="none"
            className="absolute inset-0"
            style={{
              borderRadius: CORNER_RADIUS,
              boxShadow:
                themeAppearance === "dark"
                  ? "inset 0 1px 0 rgba(255, 255, 255, 0.12)"
                  : "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
            }}
          />
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            className="absolute inset-x-0 items-center"
            style={{ top: 5 }}
          >
            <View
              className="rounded-full bg-foreground-tertiary opacity-50"
              style={{ width: 36, height: 5 }}
            />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
