import { NavigationContext } from "@react-navigation/native";
import { createContext, use, useEffect, useRef, type ComponentProps } from "react";
import {
  Platform,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useAndroidPageSheetContentAtTop } from "../components/AndroidPageSheet";
import { ScrollViewMarker } from "react-native-screens";
import { nativeHeaderScrollEdgeEffects } from "./scrollEdgeEffects";

type ScrollEdgeEffects = ComponentProps<typeof ScrollViewMarker>["scrollEdgeEffects"];

const DEFAULT_SCROLL_EDGE_EFFECTS = nativeHeaderScrollEdgeEffects(Platform.OS, Platform.Version);

export const NativeScrollEdgeEffectsContext = createContext<ScrollEdgeEffects>(undefined);

/** Register the content scroll view and apply its route's native edge settings. */
export function NativeScrollViewMarker(props: ComponentProps<typeof ScrollViewMarker>) {
  const effects = use(NativeScrollEdgeEffectsContext);
  return (
    <ScrollViewMarker
      {...props}
      scrollEdgeEffects={props.scrollEdgeEffects ?? effects ?? DEFAULT_SCROLL_EDGE_EFFECTS}
    />
  );
}

/** Primary screen scrolling; Android keeps its existing native view hierarchy. */
export function NativeScrollView(props: ComponentProps<typeof ScrollView>) {
  if (Platform.OS === "android") return <SheetTrackedScrollView {...props} />;
  return (
    <NativeScrollViewMarker style={{ flex: 1 }}>
      <ScrollView {...props} />
    </NativeScrollViewMarker>
  );
}

/**
 * Inside an Android page sheet, tells the sheet whether this (focused) scroll
 * view rests at its top, so a downward drag on the content can dismiss the
 * sheet as on iOS. Reports only when a drag or fling ends and on focus, never
 * per frame.
 */
function SheetTrackedScrollView(props: ComponentProps<typeof ScrollView>) {
  const atTop = useAndroidPageSheetContentAtTop();
  const navigation = use(NavigationContext);
  const offset = useRef(0);
  const tracks = atTop !== null && !props.horizontal;

  useEffect(() => {
    if (!tracks) return;
    const report = () => atTop.set(offset.current <= 0);
    if (navigation?.isFocused() ?? true) report();
    const unsubscribeFocus = navigation?.addListener("focus", report);
    const unsubscribeBlur = navigation?.addListener("blur", () => atTop.set(false));
    return () => {
      unsubscribeFocus?.();
      unsubscribeBlur?.();
      atTop.set(false);
    };
  }, [tracks, atTop, navigation]);

  if (!tracks) return <ScrollView {...props} />;
  const { onScrollEndDrag, onMomentumScrollEnd } = props;
  const record = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    if (navigation?.isFocused() ?? true) atTop.set(offset.current <= 0);
  };
  return (
    <ScrollView
      {...props}
      onScrollEndDrag={(event) => {
        record(event);
        onScrollEndDrag?.(event);
      }}
      onMomentumScrollEnd={(event) => {
        record(event);
        onMomentumScrollEnd?.(event);
      }}
    />
  );
}
