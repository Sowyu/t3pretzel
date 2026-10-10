import { describe, expect, it } from "vite-plus/test";

import { panReleaseValue } from "./liquidSwitchRelease";

describe("panReleaseValue", () => {
  it("leaves a tap to the Pressable", () => {
    expect(panReleaseValue({ activated: false, success: false, progress: 0, value: false })).toBe(
      null,
    );
  });

  it("lands a finished drag on the nearer side", () => {
    expect(panReleaseValue({ activated: true, success: true, progress: 0.7, value: false })).toBe(
      true,
    );
    expect(panReleaseValue({ activated: true, success: true, progress: 0.3, value: true })).toBe(
      false,
    );
  });

  it("springs a cancelled drag back", () => {
    expect(panReleaseValue({ activated: true, success: false, progress: 0.9, value: false })).toBe(
      false,
    );
  });
});
