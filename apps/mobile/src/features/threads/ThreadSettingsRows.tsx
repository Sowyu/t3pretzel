import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { cn } from "../../lib/cn";
import type { ModelOption } from "../../lib/modelOptions";

function SelectedCheckmark(props: { readonly selected: boolean }) {
  return props.selected ? (
    <SymbolView
      name="checkmark"
      size={16}
      tintColorClassName="accent-icon"
      type="monochrome"
      weight="semibold"
    />
  ) : null;
}

/** One catalog model inside a provider's grouped card in the thread settings picker. */
export function ModelRow(props: {
  readonly option: ModelOption;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={[props.option.label, props.option.subtitle].filter(Boolean).join(", ")}
      accessibilityRole="radio"
      accessibilityState={{
        checked: props.selected,
        disabled: props.option.isUnavailable === true,
      }}
      disabled={props.option.isUnavailable}
      onPress={props.onPress}
      className={cn(
        "mx-4 min-h-11 flex-row items-center gap-2 bg-card px-4 py-2 active:bg-subtle",
        props.isFirst && "rounded-t-2xl",
        props.isLast ? "rounded-b-2xl" : "border-b border-border-subtle",
      )}
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="min-w-0 shrink text-base font-t3-medium text-foreground"
            numberOfLines={1}
          >
            {props.option.label}
          </Text>
          {props.option.isDefault ? (
            <View className="rounded-md bg-subtle-strong px-1.5 py-0.5">
              <Text className="text-3xs font-t3-bold text-foreground-muted">Default</Text>
            </View>
          ) : null}
          {props.option.isLegacy ? (
            <View className="rounded-md bg-subtle px-1.5 py-0.5">
              <Text className="text-3xs font-t3-bold text-foreground-muted">Legacy</Text>
            </View>
          ) : null}
          {props.option.isUnavailable ? (
            <Text className="text-xs text-foreground">Unavailable</Text>
          ) : null}
        </View>
        {props.option.subtitle ? (
          <Text className="text-xs text-foreground-muted" numberOfLines={1}>
            {props.option.subtitle}
          </Text>
        ) : null}
      </View>
      <SelectedCheckmark selected={props.selected} />
    </Pressable>
  );
}

/** Single option inside a submenu panel (reasoning, runtime, and other select options). */
export function ChoiceRow(props: {
  readonly label: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly isLast: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={props.description ? `${props.label}. ${props.description}` : props.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      className={cn(
        "min-h-14 flex-row items-center gap-3 bg-card px-4 py-3 active:bg-subtle",
        !props.isLast && "border-b border-border-subtle",
      )}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-t3-medium text-foreground">{props.label}</Text>
        {props.description ? (
          <Text className="text-sm leading-5 text-foreground-muted">{props.description}</Text>
        ) : null}
      </View>
      <SelectedCheckmark selected={props.selected} />
    </Pressable>
  );
}
