import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { AppText as Text } from "./AppText";

const ROW_HEIGHT = 36;
const VISIBLE_ROWS = 5;
const PAD = ((VISIBLE_ROWS - 1) / 2) * ROW_HEIGHT;
const ROW_STYLE = { height: ROW_HEIGHT };
const LABEL_STYLE = { fontSize: 20, fontVariant: ["tabular-nums" as const] };

export type WheelOption<T> = { readonly value: T; readonly label: string };

/**
 * A column of SwiftUI's `.wheel` picker in JS: five 36dp rows that snap, a
 * rounded selection band behind the middle row, and the outer rows faded out
 * by the native scroll view's fading edge, which fades to transparent on any
 * background and does no JS work while scrolling. The value commits when
 * the scroll settles; tapping a row scrolls to it. Put several side by side
 * in a row for a multi-column wheel.
 */
export function WheelPicker<T extends string | number>(props: {
  readonly options: readonly WheelOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly accessibilityLabel: string;
  /** Text alignment inside the column; iOS centers single wheels. */
  readonly align?: "left" | "center" | "right";
  /** Rounds only the band's outer ends when columns sit side by side. */
  readonly band?: "full" | "start" | "middle" | "end";
  readonly flex?: number;
  /** A fixed column width in dp, for compact multi-column wheels. Overrides `flex`. */
  readonly width?: number;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const listRef = useRef<FlatList<WheelOption<T>>>(null);
  const index = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.value),
  );
  const settledIndex = useRef(index);

  // Follow outside changes (another column clamping this one, a reset).
  useEffect(() => {
    if (settledIndex.current === index) return;
    settledIndex.current = index;
    listRef.current?.scrollToOffset({ offset: index * ROW_HEIGHT, animated: true });
  }, [index]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(
      props.options.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)),
    );
    if (next === settledIndex.current) return;
    settledIndex.current = next;
    const option = props.options[next];
    if (option) props.onChange(option.value);
  };

  const select = (next: number) => {
    const option = props.options[next];
    if (!option) return;
    settledIndex.current = next;
    listRef.current?.scrollToOffset({ offset: next * ROW_HEIGHT, animated: true });
    props.onChange(option.value);
  };
  // Rows render once per scroll window, not on every parent render.
  const selectRef = useRef(select);
  useLayoutEffect(() => {
    selectRef.current = select;
  });
  const align = props.align ?? "center";
  const renderItem = useCallback(
    ({ item, index: row }: { readonly item: WheelOption<T>; readonly index: number }) => (
      <Pressable
        importantForAccessibility="no"
        onPress={() => selectRef.current(row)}
        className="justify-center px-3"
        style={ROW_STYLE}
      >
        <Text
          numberOfLines={1}
          className="text-foreground"
          style={[LABEL_STYLE, { textAlign: align }]}
        >
          {item.label}
        </Text>
      </Pressable>
    ),
    [align],
  );

  const band = props.band ?? "full";
  const radius = 8;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityValue={{ text: props.options[index]?.label }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") select(index + 1);
        if (event.nativeEvent.actionName === "decrement") select(index - 1);
      }}
      style={{
        ...(props.width === undefined ? { flex: props.flex ?? 1 } : { width: props.width }),
        height: ROW_HEIGHT * VISIBLE_ROWS,
      }}
    >
      <View
        pointerEvents="none"
        className="absolute inset-x-0"
        style={{
          top: PAD,
          // iOS's selection band is the translucent system fill.
          backgroundColor:
            themeAppearance === "dark" ? "rgba(120, 120, 128, 0.24)" : "rgba(120, 120, 128, 0.12)",
          height: ROW_HEIGHT,
          borderTopLeftRadius: band === "full" || band === "start" ? radius : 0,
          borderBottomLeftRadius: band === "full" || band === "start" ? radius : 0,
          borderTopRightRadius: band === "full" || band === "end" ? radius : 0,
          borderBottomRightRadius: band === "full" || band === "end" ? radius : 0,
        }}
      />
      <FlatList
        ref={listRef}
        data={props.options}
        keyExtractor={(option) => String(option.value)}
        getItemLayout={(_, row) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * row, index: row })}
        initialScrollIndex={index}
        initialNumToRender={VISIBLE_ROWS + 4}
        windowSize={5}
        snapToInterval={ROW_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: PAD }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(event) => {
          // A slow release snaps without a fling, so no momentum event follows.
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) settle(event);
        }}
        renderItem={renderItem}
        // Two rows of fade at each end, iOS's dimmed outer rows. Native, so it
        // works over any surface and costs nothing per frame.
        fadingEdgeLength={PAD}
      />
    </View>
  );
}
