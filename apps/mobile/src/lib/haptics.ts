import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * The haptic intents the app uses. Fire and forget: none of them ever reject,
 * so a device that cannot produce an effect just stays silent.
 *
 * `selectionAsync`, `impactAsync` and `notificationAsync` drive Android's raw
 * `Vibrator` with waveforms expo-haptics hand-wrote to imitate iOS. Those land
 * as a blunt buzz instead of a tick, and a gesture that fires one per step
 * turns into a rattle. `performAndroidHapticsAsync` hands the intent to the
 * system haptic engine, which uses the device's own tuning and needs no
 * `VIBRATE` permission. iOS keeps the UIKit generators, which already feel
 * right.
 */

const swallow = (haptic: Promise<void>): Promise<void> => haptic.catch(() => undefined);

// Of the system constants, only CLOCK_TICK, CONTEXT_CLICK, KEYBOARD_TAP,
// LONG_PRESS and VIRTUAL_KEY exist on every level the app supports (minSdk 24).
// The rest reject on older devices, which `swallow` turns into no haptic.
// ponytail: success/error are silent below API 30, give them a fallback if
// those devices still show up once minSdk moves.
const androidSystemHaptic = (type: Haptics.AndroidHaptics): Promise<void> =>
  swallow(Haptics.performAndroidHapticsAsync(type));

/** A selection changed: a row tapped, a picker choice, a slider step. */
export function selectionHaptic(): Promise<void> {
  return Platform.OS === "android"
    ? androidSystemHaptic(Haptics.AndroidHaptics.Keyboard_Tap)
    : swallow(Haptics.selectionAsync());
}

/** A small control committed an action. */
export function lightImpactHaptic(): Promise<void> {
  return Platform.OS === "android"
    ? androidSystemHaptic(Haptics.AndroidHaptics.Virtual_Key)
    : swallow(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Something engaged under the finger: a long press, a swipe passing its threshold. */
export function mediumImpactHaptic(): Promise<void> {
  return Platform.OS === "android"
    ? androidSystemHaptic(Haptics.AndroidHaptics.Long_Press)
    : swallow(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A background task finished successfully. */
export function successHaptic(): Promise<void> {
  return Platform.OS === "android"
    ? androidSystemHaptic(Haptics.AndroidHaptics.Confirm)
    : swallow(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A background task failed. */
export function errorHaptic(): Promise<void> {
  return Platform.OS === "android"
    ? androidSystemHaptic(Haptics.AndroidHaptics.Reject)
    : swallow(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
