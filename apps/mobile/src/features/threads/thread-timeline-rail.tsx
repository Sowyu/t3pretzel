import { useCallback, useState } from "react";
import { Platform, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { AppText as Text } from "../../components/AppText";
import { GlassSurface } from "../../components/GlassSurface";
import { selectionHaptic } from "../../lib/haptics";
import {
  resolveTimelineRailHeight,
  resolveTimelineRailIndexFromY,
  resolveTimelineRailTickOffset,
  resolveTimelineRailTickWidth,
  TIMELINE_RAIL_MIN_ITEMS,
  type TimelineRailItem,
} from "./thread-timeline-rail.logic";

// Touches on this strip along the right edge belong to the rail, not the
// list, so it stays narrow. The ticks end 12 from the edge like desktop's.
const HIT_WIDTH = 28;
const TICK_RIGHT = 12;
const TICK_HEIGHT = 2;
// Desktop caps the rail to the viewport minus 18rem so it never reaches the
// chrome at either end.
const RAIL_VERTICAL_RESERVE = 288;
const PREVIEW_WIDTH = 260;

/**
 * Ticks down the right edge of the thread, one per user message. Tap a tick
 * to jump to that message; drag along the rail to scrub with a preview of
 * the message and its answer. `inViewRange` brightens the ticks currently on
 * screen; `currentIndex` is the one the reader is at, which draws widest.
 */
export function ThreadTimelineRail(props: {
  readonly items: ReadonlyArray<TimelineRailItem>;
  readonly currentIndex: number | null;
  readonly inViewRange: readonly [number, number] | null;
  readonly onSelect: (item: TimelineRailItem) => void;
  /** Header and composer (plus keyboard) heights over the feed; Android keeps the rail between them. */
  readonly topInset: number;
  readonly bottomInset: number;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState(windowHeight);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => (current === height ? current : height));
  }, []);
  const [previewHeight, setPreviewHeight] = useState(0);
  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setPreviewHeight((current) => (current === height ? current : height));
  }, []);
  const { items, onSelect } = props;
  // iOS keeps the full-height strip and the desktop reserve. Android lays the
  // strip out between the insets, so the reserve only tops up what they leave.
  const insetTop = Platform.OS === "android" ? props.topInset : 0;
  const insetBottom = Platform.OS === "android" ? props.bottomInset : 0;
  const railHeight = resolveTimelineRailHeight(
    items.length,
    viewportHeight - Math.max(0, RAIL_VERTICAL_RESERVE - insetTop - insetBottom),
  );

  const indexAt = useCallback(
    (y: number) => resolveTimelineRailIndexFromY({ itemCount: items.length, railHeight, y }),
    [items.length, railHeight],
  );
  const scrubTo = useCallback(
    (y: number) => {
      const next = indexAt(y);
      setActiveIndex((current) => {
        if (next !== null && next !== current) void selectionHaptic();
        return next;
      });
    },
    [indexAt],
  );
  const finish = useCallback(
    (y: number, select: boolean) => {
      setActiveIndex(null);
      if (!select) return;
      const index = indexAt(y);
      const item = index === null ? undefined : items[index];
      if (item) onSelect(item);
    },
    [indexAt, items, onSelect],
  );

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .onBegin((event) => scrubTo(event.y))
    .onUpdate((event) => scrubTo(event.y))
    .onFinalize((event, success) => finish(event.y, success));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => finish(event.y, success));
  const gesture = Gesture.Exclusive(pan, tap);

  if (items.length < TIMELINE_RAIL_MIN_ITEMS) {
    return null;
  }

  const focusIndex = activeIndex ?? props.currentIndex;
  const activeItem = activeIndex === null ? null : (items[activeIndex] ?? null);
  const activeOffset =
    activeIndex === null ? 0 : resolveTimelineRailTickOffset(activeIndex, items.length, railHeight);
  const railTop = (viewportHeight - railHeight) / 2;

  return (
    <View
      onLayout={handleLayout}
      pointerEvents="box-none"
      style={{
        alignItems: "flex-end",
        bottom: insetBottom,
        justifyContent: "center",
        position: "absolute",
        right: 0,
        top: insetTop,
        width: HIT_WIDTH + PREVIEW_WIDTH,
      }}
    >
      <GestureDetector gesture={gesture}>
        <View
          accessibilityLabel="Message timeline"
          accessibilityRole="adjustable"
          style={{ height: railHeight, width: HIT_WIDTH }}
        >
          {items.map((item, index) => {
            const distance = focusIndex === null ? null : Math.abs(index - focusIndex);
            const inView =
              props.inViewRange !== null &&
              index >= props.inViewRange[0] &&
              index <= props.inViewRange[1];
            return (
              <View
                key={item.id}
                className={inView ? "bg-foreground" : "bg-foreground-muted"}
                style={{
                  borderRadius: TICK_HEIGHT / 2,
                  height: TICK_HEIGHT,
                  opacity: distance === 0 ? 0.85 : inView ? 0.8 : 0.35,
                  position: "absolute",
                  right: TICK_RIGHT,
                  top:
                    resolveTimelineRailTickOffset(index, items.length, railHeight) -
                    TICK_HEIGHT / 2,
                  width: resolveTimelineRailTickWidth(distance),
                }}
              />
            );
          })}
        </View>
      </GestureDetector>
      {activeItem ? (
        // Centred on the tick once measured; the first frame lands with its
        // top on the tick, which the fade-in below covers.
        <View
          onLayout={handlePreviewLayout}
          pointerEvents="none"
          style={{
            opacity: previewHeight > 0 ? 1 : 0,
            position: "absolute",
            right: HIT_WIDTH + 4,
            top: railTop + activeOffset - previewHeight / 2,
            width: PREVIEW_WIDTH,
          }}
        >
          <GlassSurface chrome="none" glassEffectStyle="regular" style={{ borderRadius: 12 }}>
            <View className="p-3">
              <Text numberOfLines={1} className="text-sm font-t3-medium text-foreground">
                {activeItem.userText ?? "User message"}
              </Text>
              {activeItem.assistantText ? (
                <Text numberOfLines={3} className="mt-1 text-sm text-foreground-muted">
                  {activeItem.assistantText}
                </Text>
              ) : null}
            </View>
          </GlassSurface>
        </View>
      ) : null}
    </View>
  );
}
