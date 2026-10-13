import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", () => ({ Platform: platform }));

const mocks = vi.hoisted(() => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  performAndroidHapticsAsync: vi.fn(),
  selectionAsync: vi.fn(),
}));

vi.mock("expo-haptics", () => ({
  AndroidHaptics: {
    Confirm: "confirm",
    Keyboard_Tap: "keyboard-tap",
    Long_Press: "long-press",
    Reject: "reject",
    Virtual_Key: "virtual-key",
  },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Error: "error", Success: "success" },
  impactAsync: mocks.impactAsync,
  notificationAsync: mocks.notificationAsync,
  performAndroidHapticsAsync: mocks.performAndroidHapticsAsync,
  selectionAsync: mocks.selectionAsync,
}));

import {
  errorHaptic,
  lightImpactHaptic,
  mediumImpactHaptic,
  selectionHaptic,
  successHaptic,
} from "./haptics";

const HAPTICS = [
  ["selectionHaptic", selectionHaptic, "keyboard-tap"],
  ["lightImpactHaptic", lightImpactHaptic, "virtual-key"],
  ["mediumImpactHaptic", mediumImpactHaptic, "long-press"],
  ["successHaptic", successHaptic, "confirm"],
  ["errorHaptic", errorHaptic, "reject"],
] as const;

describe("haptics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.OS = "ios";
    for (const mock of Object.values(mocks)) mock.mockResolvedValue(undefined);
  });

  it.each(HAPTICS)(
    "routes %s through the Android system haptic engine",
    async (_, haptic, type) => {
      platform.OS = "android";

      await haptic();

      expect(mocks.performAndroidHapticsAsync).toHaveBeenCalledWith(type);
      expect(mocks.selectionAsync).not.toHaveBeenCalled();
      expect(mocks.impactAsync).not.toHaveBeenCalled();
      expect(mocks.notificationAsync).not.toHaveBeenCalled();
    },
  );

  // A constant the device's API level does not know about rejects natively, and
  // a silent no-op has to be the worst that happens.
  it.each(HAPTICS)("resolves when %s is unsupported on the device", async (_, haptic) => {
    platform.OS = "android";
    mocks.performAndroidHapticsAsync.mockRejectedValueOnce(new Error("unsupported haptic type"));

    await expect(haptic()).resolves.toBeUndefined();
  });

  it.each(HAPTICS)("resolves when %s fails on iOS", async (_, haptic) => {
    mocks.impactAsync.mockRejectedValueOnce(new Error("no haptic engine"));
    mocks.notificationAsync.mockRejectedValueOnce(new Error("no haptic engine"));
    mocks.selectionAsync.mockRejectedValueOnce(new Error("no haptic engine"));

    await expect(haptic()).resolves.toBeUndefined();
    expect(mocks.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });
});
