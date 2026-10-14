import { requireNativeModule } from "expo";
import { useState } from "react";
import { View } from "react-native";

import { WheelPicker } from "./WheelPicker";

const minutes = Array.from({ length: 60 }, (_, value) => ({
  value,
  label: String(value).padStart(2, "0"),
}));
const hours24 = Array.from({ length: 24 }, (_, value) => ({
  value,
  label: String(value).padStart(2, "0"),
}));
const hours12 = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
}));
const meridiems = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
] as const;

/**
 * Android's inline stand-in for the iOS `.spinner` time picker: hour, minute
 * and AM/PM wheels following the system 12/24-hour setting. Hours are 0..23.
 */
export function TimeWheel(props: {
  readonly hours: number;
  readonly minutes: number;
  readonly onChange: (hours: number, minutes: number) => void;
  readonly accessibilityLabel: string;
}) {
  // A synchronous native call: read it once per mount, not on every wheel settle.
  const [is24Hour] = useState(() =>
    requireNativeModule<{ is24HourFormat(): boolean }>("T3NativeControls").is24HourFormat(),
  );
  const pm = props.hours >= 12;
  // iOS's compact spinner: narrow columns centered together, one shared band.
  return (
    <View className="flex-row justify-center px-4 pb-3">
      <WheelPicker
        accessibilityLabel={`${props.accessibilityLabel} hour`}
        options={is24Hour ? hours24 : hours12}
        value={is24Hour ? props.hours : props.hours % 12 || 12}
        onChange={(hour) =>
          props.onChange(is24Hour ? hour : (hour % 12) + (pm ? 12 : 0), props.minutes)
        }
        align="right"
        band="start"
        width={64}
      />
      <WheelPicker
        accessibilityLabel={`${props.accessibilityLabel} minute`}
        options={minutes}
        value={props.minutes}
        onChange={(minute) => props.onChange(props.hours, minute)}
        align="left"
        band={is24Hour ? "end" : "middle"}
        width={64}
      />
      {is24Hour ? null : (
        <WheelPicker
          accessibilityLabel={`${props.accessibilityLabel} AM or PM`}
          options={meridiems}
          value={pm ? "PM" : "AM"}
          onChange={(meridiem) =>
            props.onChange((props.hours % 12) + (meridiem === "PM" ? 12 : 0), props.minutes)
          }
          align="left"
          band="end"
          width={64}
        />
      )}
    </View>
  );
}
