import type { MenuAction } from "@react-native-menu/menu";
import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts";
import { Pressable } from "react-native";

import { AndroidAnchoredMenu } from "../../../components/AndroidAnchoredMenu";
import { AppText } from "../../../components/AppText";
import { cn } from "../../../lib/cn";
import type { AutoSettleDaysFieldProps } from "./AutoSettleDaysField";

const days = Array.from(
  { length: MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS - MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS + 1 },
  (_, index) => MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS + index,
);

/**
 * The iOS bordered button and day picker: a tinted capsule showing the count
 * that opens a scrolling menu of day options.
 */
export function AutoSettleDaysField(props: AutoSettleDaysFieldProps) {
  const actions: MenuAction[] = days.map((value) => ({
    id: String(value),
    title: `${value} ${value === 1 ? "day" : "days"}`,
    state: value === props.value ? "on" : undefined,
  }));
  return (
    <AndroidAnchoredMenu
      actions={actions}
      title="Days before auto-settle"
      onPressAction={({ nativeEvent }) => {
        const next = Number(nativeEvent.event);
        if (!props.disabled && next !== props.value) props.onValueChange(next);
      }}
    >
      {(open) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Days before auto-settle: ${props.value}`}
          accessibilityState={{ disabled: Boolean(props.disabled) }}
          disabled={props.disabled}
          onPress={open}
          className={cn(
            "min-h-11 min-w-16 items-center justify-center rounded-full bg-subtle px-4 active:opacity-50",
            props.disabled && "opacity-45",
          )}
        >
          <AppText
            className="text-base text-primary-text"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {props.value}
          </AppText>
        </Pressable>
      )}
    </AndroidAnchoredMenu>
  );
}
