import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AndroidAnchoredMenu } from "../../../components/AndroidAnchoredMenu";
import { AppText } from "../../../components/AppText";
import { WheelPicker } from "../../../components/WheelPicker";
import { cn } from "../../../lib/cn";
import type { AutoSettleDaysFieldProps } from "./AutoSettleDaysField";

const days = Array.from(
  { length: MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS - MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS + 1 },
  (_, index) => MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS + index,
).map((value) => ({ value, label: `${value} ${value === 1 ? "day" : "days"}` }));

/**
 * The iOS row value and popover: the count in accent text that opens a 240dp
 * card with a day wheel and Cancel/Done. The value commits on Done.
 */
export function AutoSettleDaysField(props: AutoSettleDaysFieldProps) {
  const [draft, setDraft] = useState(props.value);
  return (
    <AndroidAnchoredMenu
      actions={[]}
      popoverWidth={240}
      popover={(close) => (
        <View style={{ padding: 12, gap: 4 }}>
          <WheelPicker
            accessibilityLabel="Days before auto-settle"
            options={days}
            value={draft}
            onChange={setDraft}
          />
          <View className="flex-row justify-center" style={{ gap: 24 }}>
            {(["Cancel", "Done"] as const).map((label) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                hitSlop={8}
                className="min-h-11 justify-center px-2 active:opacity-50"
                onPress={() => {
                  close();
                  if (label === "Done" && !props.disabled && draft !== props.value)
                    props.onValueChange(draft);
                }}
              >
                <AppText className="text-[17px] text-primary-text">{label}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    >
      {(open) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Days before auto-settle: ${props.value}`}
          accessibilityState={{ disabled: Boolean(props.disabled) }}
          disabled={props.disabled}
          onPress={() => {
            setDraft(props.value);
            open();
          }}
          hitSlop={8}
          className={cn(
            "min-h-11 min-w-11 items-end justify-center active:opacity-50",
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
