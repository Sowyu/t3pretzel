import { GlassFill } from "../../components/GlassSurface";
import { useLiquidGlass } from "../../components/useLiquidGlass";
import {
  localSnoozeDate,
  localSnoozeTime,
  resolveCustomSnooze,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";
import { requireNativeModule } from "expo";
import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { AndroidAnchoredMenu } from "../../components/AndroidAnchoredMenu";
import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { SegmentedControl } from "../../components/SegmentedControl";
import { WheelPicker } from "../../components/WheelPicker";
import type { CustomSnoozeSheet as SharedCustomSnoozeSheet } from "./CustomSnoozeSheet.shared";

type Props = Parameters<typeof SharedCustomSnoozeSheet>[0];

const modes = [
  { value: "date", label: "Date and time" },
  { value: "duration", label: "Duration" },
] as const;
const units = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
] as const;

const DAY_MS = 86_400_000;
const amounts = Array.from({ length: 99 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
}));
const minutes = Array.from({ length: 60 }, (_, value) => ({
  value,
  label: String(value).padStart(2, "0"),
}));
const meridiems = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
] as const;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function systemUses24HourClock() {
  return requireNativeModule<{ is24HourFormat(): boolean }>("T3NativeControls").is24HourFormat();
}

/** Opens the anchored popover as soon as the snooze row mounts it. */
function OpenOnMount(props: { readonly open: () => void }) {
  const { open } = props;
  useEffect(() => {
    open();
  }, [open]);
  return null;
}

/**
 * The iOS custom snooze popover in RN: an xmark, centered title and Snooze
 * button bar over a mode picker and SwiftUI-style wheels (day, hour, minute
 * and AM/PM, or amount and unit). Anchored to the thread row it is mounted in,
 * like iOS's `Popover`; back and a tap outside cancel it.
 */
export function CustomSnoozeSheet(props: Props) {
  const { width: windowWidth } = useWindowDimensions();
  return (
    <AndroidAnchoredMenu
      actions={[]}
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
      popoverWidth={Math.min(360, windowWidth - 32)}
      popover={(close) => <CustomSnoozeContent onSnooze={props.onSnooze} close={close} />}
      onClose={props.onClose}
    >
      {(open) => <OpenOnMount open={open} />}
    </AndroidAnchoredMenu>
  );
}

function CustomSnoozeContent(props: {
  readonly onSnooze: Props["onSnooze"];
  readonly close: () => void;
}) {
  const liquid = useLiquidGlass().tier !== "none";
  const [is24Hour, setIs24Hour] = useState(systemUses24HourClock);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setIs24Hour(systemUses24HourClock());
    });
    return () => subscription.remove();
  }, []);
  const [mode, setMode] = useState<CustomSnoozeInput["mode"]>("date");
  const [date, setDate] = useState(() => new Date(Date.now() + 3_600_000));
  // The day wheel covers a year from today; it is built once per open.
  const [today] = useState(() => startOfDay(new Date()));
  const dayOptions = useMemo(
    () =>
      Array.from({ length: 366 }, (_, value) => {
        const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + value);
        return {
          value,
          label:
            value === 0
              ? "Today"
              : day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        };
      }),
    [today],
  );
  const hourOptions = useMemo(
    () =>
      is24Hour
        ? Array.from({ length: 24 }, (_, value) => ({
            value,
            label: String(value).padStart(2, "0"),
          }))
        : Array.from({ length: 12 }, (_, index) => ({
            value: index + 1,
            label: String(index + 1),
          })),
    [is24Hour],
  );
  const [amount, setAmount] = useState(2);
  const [unit, setUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const input: CustomSnoozeInput =
      mode === "date"
        ? { mode, date: localSnoozeDate(date), time: localSnoozeTime(date) }
        : { mode, amount: String(amount), unit };
    const snoozedUntil = resolveCustomSnooze(input, new Date());
    if (!snoozedUntil) {
      setError(
        mode === "date" ? "Choose a date and time in the future." : "Enter a positive duration.",
      );
      return;
    }
    props.onSnooze(snoozedUntil);
    props.close();
  };

  const dayOffset = Math.round((startOfDay(date).getTime() - today.getTime()) / DAY_MS);
  const hours = date.getHours();
  const updateDate = (change: (next: Date) => void) => {
    const next = new Date(date);
    change(next);
    setDate(next);
    setError(null);
  };
  return (
    <>
      <View className="min-h-14 flex-row items-center px-3">
        <AndroidHeaderIconButton
          accessibilityLabel="Cancel custom snooze"
          icon="xmark"
          onPress={props.close}
        />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="flex-1 text-center font-t3-bold"
          style={{ fontSize: 17, lineHeight: 22 }}
        >
          Custom snooze
        </Text>
        {/* The iOS glass capsule bar button. */}
        <Pressable
          accessibilityRole="button"
          hitSlop={4}
          className={
            liquid
              ? "h-10 justify-center rounded-full px-4"
              : "h-10 justify-center rounded-full border-separator bg-glass-fallback px-4 active:opacity-50"
          }
          style={{ borderWidth: StyleSheet.hairlineWidth }}
          onPress={submit}
        >
          {liquid ? <GlassFill /> : null}
          <Text className="font-t3-semibold" style={{ fontSize: 17 }}>
            Snooze
          </Text>
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 16 }}
      >
        <SegmentedControl
          options={modes}
          selected={mode}
          onSelect={(value) => {
            setMode(value);
            setError(null);
          }}
          role="tab"
        />
        {mode === "date" ? (
          <View className="flex-row">
            <WheelPicker
              accessibilityLabel="Snooze day"
              options={dayOptions}
              value={Math.min(Math.max(dayOffset, 0), dayOptions.length - 1)}
              onChange={(offset) =>
                updateDate((next) =>
                  next.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + offset),
                )
              }
              align="right"
              band="start"
              flex={2.2}
            />
            <WheelPicker
              accessibilityLabel="Snooze hour"
              options={hourOptions}
              value={is24Hour ? hours : hours % 12 || 12}
              onChange={(hour) =>
                updateDate((next) =>
                  next.setHours(is24Hour ? hour : (hour % 12) + (hours >= 12 ? 12 : 0)),
                )
              }
              align="right"
              band="middle"
            />
            <WheelPicker
              accessibilityLabel="Snooze minute"
              options={minutes}
              value={date.getMinutes()}
              onChange={(minute) => updateDate((next) => next.setMinutes(minute, 0, 0))}
              align="left"
              band={is24Hour ? "end" : "middle"}
            />
            {is24Hour ? null : (
              <WheelPicker
                accessibilityLabel="AM or PM"
                options={meridiems}
                value={hours >= 12 ? "PM" : "AM"}
                onChange={(meridiem) =>
                  updateDate((next) => next.setHours((hours % 12) + (meridiem === "PM" ? 12 : 0)))
                }
                align="left"
                band="end"
              />
            )}
          </View>
        ) : (
          <View className="flex-row">
            <WheelPicker
              accessibilityLabel="Duration amount"
              options={amounts}
              value={amount}
              onChange={(value) => {
                setAmount(value);
                setError(null);
              }}
              band="start"
            />
            <WheelPicker
              accessibilityLabel="Duration unit"
              options={units}
              value={unit}
              onChange={(value) => {
                setUnit(value);
                setError(null);
              }}
              band="end"
            />
          </View>
        )}
        {error ? (
          <Text accessibilityRole="alert" className="text-[13px] text-danger-foreground">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
