import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import {
  localSnoozeDate,
  localSnoozeTime,
  resolveCustomSnooze,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";
import { requireNativeModule } from "expo";
import { useEffect, useState } from "react";
import {
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { OverlayPortal } from "../../components/OverlayPortal";
import { SegmentedControl } from "../../components/SegmentedControl";
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

function systemUses24HourClock() {
  return requireNativeModule<{ is24HourFormat(): boolean }>("T3NativeControls").is24HourFormat();
}

/**
 * The iOS custom snooze popover in RN: an xmark, centered title and Snooze
 * button bar over a mode picker. Dates and times use the system pickers.
 * Rendered through OverlayPortal because recycled thread rows can unmount it.
 */
export function CustomSnoozeSheet(props: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [is24Hour, setIs24Hour] = useState(systemUses24HourClock);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setIs24Hour(systemUses24HourClock());
    });
    return () => subscription.remove();
  }, []);
  const { onClose } = props;
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);
  const [mode, setMode] = useState<CustomSnoozeInput["mode"]>("date");
  const [date, setDate] = useState(() => new Date(Date.now() + 3_600_000));
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
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
    props.onClose();
  };

  const timeLabel = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: is24Hour ? "h23" : "h12",
  });

  return (
    <OverlayPortal>
      <View className="absolute inset-0 items-center justify-center bg-backdrop px-4">
        <Pressable
          accessibilityLabel="Cancel custom snooze"
          className="absolute inset-0"
          onPress={props.onClose}
        />
        <View
          accessibilityViewIsModal
          className="overflow-hidden rounded-[20px] border-separator bg-card-alt"
          style={{
            width: Math.min(360, windowWidth - 32),
            maxHeight: "80%",
            borderWidth: StyleSheet.hairlineWidth,
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.24)",
          }}
        >
          <View className="min-h-14 flex-row items-center px-3">
            <AndroidHeaderIconButton
              accessibilityLabel="Cancel custom snooze"
              icon="xmark"
              onPress={props.onClose}
            />
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="flex-1 text-center text-[17px] font-t3-bold"
            >
              Custom snooze
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              className="min-h-10 justify-center px-2 active:opacity-50"
              onPress={submit}
            >
              <Text className="text-base font-t3-bold">Snooze</Text>
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
                setPicker(null);
                setError(null);
              }}
              role="tab"
            />
            {mode === "date" ? (
              <View className="overflow-hidden rounded-xl bg-subtle">
                {(["date", "time"] as const).map((value, index) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={value === "date" ? "Choose date" : "Choose time"}
                    className="min-h-12 flex-row items-center justify-between border-separator px-4 active:opacity-50"
                    style={{ borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0 }}
                    onPress={() => setPicker(value)}
                  >
                    <Text>{value === "date" ? "Date" : "Time"}</Text>
                    <Text className="text-foreground-secondary">
                      {value === "date"
                        ? date.toLocaleDateString([], {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })
                        : timeLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View className="gap-4">
                <View className="flex-row items-center justify-center gap-6">
                  <AndroidHeaderIconButton
                    accessibilityLabel="Decrease duration"
                    icon="minus"
                    disabled={amount <= 1}
                    onPress={() => {
                      setAmount((current) => Math.max(1, current - 1));
                      setError(null);
                    }}
                  />
                  <Text
                    accessibilityLiveRegion="polite"
                    testID="snooze-duration"
                    className="min-w-12 text-center text-2xl font-t3-bold"
                  >
                    {String(amount)}
                  </Text>
                  <AndroidHeaderIconButton
                    accessibilityLabel="Increase duration"
                    icon="plus"
                    disabled={amount >= 99}
                    onPress={() => {
                      setAmount((current) => Math.min(99, current + 1));
                      setError(null);
                    }}
                  />
                </View>
                <SegmentedControl
                  options={units}
                  selected={unit}
                  onSelect={(value) => {
                    setUnit(value);
                    setError(null);
                  }}
                />
              </View>
            )}
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-danger-foreground">
                {error}
              </Text>
            ) : null}
          </ScrollView>
        </View>
        {picker ? (
          <DateTimePicker
            value={date}
            mode={picker}
            is24Hour={is24Hour}
            onDismiss={() => setPicker(null)}
            onValueChange={(_, selected) => {
              const next = new Date(date);
              if (picker === "date")
                next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
              else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
              setDate(next);
              setPicker(null);
              setError(null);
            }}
          />
        ) : null}
      </View>
    </OverlayPortal>
  );
}
