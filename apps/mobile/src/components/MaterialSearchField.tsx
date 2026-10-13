import type { RefObject } from "react";
import { Pressable, TextInput, type TextInputInstance, View } from "react-native";

import { SymbolView } from "./AppSymbol";
import { GlassFill } from "./GlassSurface";
import { useLiquidGlass } from "./useLiquidGlass";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

export function MaterialSearchField({
  inputRef,
  accessibilityLabel,
  clearAccessibilityLabel,
  placeholder,
  value,
  onChangeText,
  autoFocus = true,
}: {
  readonly inputRef: RefObject<TextInputInstance | null>;
  readonly accessibilityLabel: string;
  readonly clearAccessibilityLabel: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  /** Header search opens on demand and focuses; persistent fields pass false. */
  readonly autoFocus?: boolean;
}) {
  const { scale, mediumIconSize } = useAndroidControlSizing();
  const liquid = useLiquidGlass().tier !== "none";
  return (
    <View
      className={
        liquid
          ? "min-w-0 flex-1 flex-row items-center"
          : "min-w-0 flex-1 flex-row items-center bg-subtle"
      }
      style={{
        // The iOS search field: a filled, 10dp-radius capsule with no border;
        // iOS 26's bar search field is a glass capsule.
        minHeight: Math.max(40, 38 * scale),
        borderRadius: 10 * scale,
        gap: 7 * scale,
        paddingHorizontal: (liquid ? 14 : 10.5) * scale,
      }}
    >
      {liquid ? <GlassFill interactive={false} /> : null}
      <SymbolView
        name="magnifyingglass"
        size={mediumIconSize}
        tintColorClassName="accent-foreground-muted"
      />
      <TextInput
        ref={inputRef}
        accessibilityLabel={accessibilityLabel}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        placeholder={placeholder}
        placeholderTextColorClassName="accent-placeholder"
        selectionColorClassName="accent-focus/32"
        cursorColorClassName="accent-focus"
        selectionHandleColorClassName="accent-focus"
        className="min-w-0 flex-1 font-sans text-base text-foreground"
        style={{ paddingVertical: 7 * scale }}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel={clearAccessibilityLabel}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            onChangeText("");
            inputRef.current?.focus();
          }}
        >
          <SymbolView
            name="xmark.circle.fill"
            size={mediumIconSize}
            tintColorClassName="accent-foreground-muted"
          />
        </Pressable>
      ) : null}
    </View>
  );
}
