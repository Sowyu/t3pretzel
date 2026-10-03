import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts";
import { Pressable, View } from "react-native";

import { SymbolView, type AppSymbolName } from "../../../components/AppSymbol";
import { AppText } from "../../../components/AppText";
import { GlassControl } from "../../../components/GlassControl";
import { selectionHaptic } from "../../../lib/haptics";
import type { AutoSettleDaysFieldProps } from "./AutoSettleDaysField";

/** Glass stepper for the auto-settle day count; one tap moves one day. */
export function AutoSettleDaysField(props: AutoSettleDaysFieldProps) {
  const adjust = (amount: number) => {
    if (props.disabled) return;
    const next = Math.max(
      MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
      Math.min(MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS, props.value + amount),
    );
    if (next === props.value) return;
    void selectionHaptic();
    props.onValueChange(next);
  };

  return (
    <View className="shrink-0 flex-row items-center gap-2">
      <StepButton
        icon="minus"
        accessibilityLabel="Decrease days before auto-settle"
        disabled={props.disabled || props.value <= MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
        onPress={() => adjust(-1)}
      />
      <AppText
        className="min-w-8 text-center text-base text-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
        accessibilityLabel={`${props.value} ${props.value === 1 ? "day" : "days"} before auto-settle`}
        accessibilityLiveRegion="polite"
      >
        {props.value}
      </AppText>
      <StepButton
        icon="plus"
        accessibilityLabel="Increase days before auto-settle"
        disabled={props.disabled || props.value >= MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
        onPress={() => adjust(1)}
      />
    </View>
  );
}

function StepButton(props: {
  readonly icon: AppSymbolName;
  readonly accessibilityLabel: string;
  readonly disabled: boolean | undefined;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      disabled={props.disabled}
      hitSlop={6}
      onPress={props.onPress}
      className={props.disabled ? "opacity-40" : undefined}
    >
      <GlassControl className="size-9 items-center justify-center rounded-full" radius={18}>
        <SymbolView name={props.icon} size={16} tintColorClassName="accent-foreground" />
      </GlassControl>
    </Pressable>
  );
}
