import type { ReactNode, RefObject } from "react";
import { Pressable, TextInput, type TextInputInstance, View } from "react-native";

import { SymbolView } from "./AppSymbol";
import { GlassSurface, supportsLiquidGlass } from "./GlassSurface";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

/** Android header search field. Sits in a row and takes the remaining width. */
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
  /** Collapsible search opens focused; an always-visible field waits for a tap. */
  readonly autoFocus?: boolean;
}) {
  const { scale, mediumIconSize } = useAndroidControlSizing();
  const content = (
    <View
      className="flex-row items-center"
      style={{ minHeight: 48 * scale, gap: 10 * scale, paddingHorizontal: 14 * scale }}
    >
      <SymbolView
        name="magnifyingglass"
        size={mediumIconSize}
        tintColorClassName="accent-foreground-muted"
        type="monochrome"
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
        style={{ paddingVertical: 10 * scale }}
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
            type="monochrome"
          />
        </Pressable>
      ) : null}
    </View>
  );
  return <SearchFieldSurface>{content}</SearchFieldSurface>;
}

// Glass like the header controls beside it: no fill, a hairline rim, the
// content refracting through. The flat input fill where the shader is missing.
function SearchFieldSurface(props: { readonly children: ReactNode }) {
  if (!supportsLiquidGlass) {
    return (
      <View className="min-w-0 flex-1 rounded-2xl border border-input-border bg-input">
        {props.children}
      </View>
    );
  }
  return (
    <GlassSurface
      chrome="none"
      fallbackClassName="border border-input-border"
      glassEffectStyle="regular"
      style={{ borderRadius: 16, flex: 1, minWidth: 0 }}
      tintColor="transparent"
    >
      {props.children}
    </GlassSurface>
  );
}
