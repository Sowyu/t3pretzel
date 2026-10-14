import { describe, expect, it } from "vite-plus/test";

import { batteryAppearance, formatStatusBarTime, msUntilNextMinute } from "./iosStatusBarFormat";

describe("formatStatusBarTime", () => {
  it("drops AM/PM and the leading zero in 12-hour time", () => {
    expect(formatStatusBarTime(new Date(2026, 0, 1, 9, 41), false)).toBe("9:41");
    expect(formatStatusBarTime(new Date(2026, 0, 1, 21, 5), false)).toBe("9:05");
    expect(formatStatusBarTime(new Date(2026, 0, 1, 0, 0), false)).toBe("12:00");
    expect(formatStatusBarTime(new Date(2026, 0, 1, 12, 30), false)).toBe("12:30");
  });

  it("pads hours in 24-hour time", () => {
    expect(formatStatusBarTime(new Date(2026, 0, 1, 9, 41), true)).toBe("09:41");
    expect(formatStatusBarTime(new Date(2026, 0, 1, 21, 5), true)).toBe("21:05");
    expect(formatStatusBarTime(new Date(2026, 0, 1, 0, 0), true)).toBe("00:00");
  });
});

describe("msUntilNextMinute", () => {
  it("lands on the next minute boundary", () => {
    expect(msUntilNextMinute(120_000)).toBe(60_000);
    expect(msUntilNextMinute(120_001)).toBe(59_999);
    expect(msUntilNextMinute(179_999)).toBe(1);
  });
});

describe("batteryAppearance", () => {
  it("colours charging green and 20% or less red", () => {
    expect(batteryAppearance(0.2, true).tone).toBe("charging");
    expect(batteryAppearance(0.2, false).tone).toBe("low");
    expect(batteryAppearance(0.21, false).tone).toBe("normal");
  });

  it("keeps a sliver of fill and caps at full", () => {
    expect(batteryAppearance(0, false).fill).toBe(0.06);
    expect(batteryAppearance(0.5, false).fill).toBe(0.5);
    expect(batteryAppearance(1.4, false).fill).toBe(1);
  });
});
