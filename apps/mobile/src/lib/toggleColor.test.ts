import { describe, expect, it } from "vite-plus/test";

import type { MobileThemeVariables } from "./mobileTheme";
import {
  applyMobileToggleColor,
  mobileToggleColorTrack,
  MOBILE_TOGGLE_COLOR_OPTIONS,
  normalizeMobileToggleColorId,
} from "./toggleColor";

const VARIABLES = {
  "--color-switch-active-track": "#accent",
  "--color-switch-active-thumb": "#accent-foreground",
  "--color-switch-inactive-track": "#secondary",
} as unknown as MobileThemeVariables;

describe("normalizeMobileToggleColorId", () => {
  it("falls back to system for anything unrecognized", () => {
    expect(normalizeMobileToggleColorId(undefined)).toBe("system");
    expect(normalizeMobileToggleColorId(null)).toBe("system");
    expect(normalizeMobileToggleColorId("chartreuse")).toBe("system");
    expect(normalizeMobileToggleColorId(7)).toBe("system");
  });

  it("keeps every offered id", () => {
    for (const option of MOBILE_TOGGLE_COLOR_OPTIONS) {
      expect(normalizeMobileToggleColorId(option.id)).toBe(option.id);
    }
  });
});

describe("mobileToggleColorTrack", () => {
  it("has no colour of its own for system", () => {
    expect(mobileToggleColorTrack("system", "light")).toBe(null);
    expect(mobileToggleColorTrack("system", "dark")).toBe(null);
  });

  it("gives every named colour a distinct light and dark value", () => {
    for (const option of MOBILE_TOGGLE_COLOR_OPTIONS) {
      if (option.id === "system") continue;
      expect(mobileToggleColorTrack(option.id, "light")).toMatch(/^#[0-9a-f]{6}$/);
      expect(mobileToggleColorTrack(option.id, "dark")).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("applyMobileToggleColor", () => {
  it("leaves the theme untouched for system", () => {
    expect(applyMobileToggleColor(VARIABLES, "light", "system")).toBe(VARIABLES);
  });

  it("overrides only the on-state variables", () => {
    const applied = applyMobileToggleColor(VARIABLES, "dark", "purple");

    expect(applied["--color-switch-active-track"]).toBe("#bf5af2");
    expect(applied["--color-switch-active-thumb"]).toBe("#ffffff");
    expect(applied["--color-switch-inactive-track"]).toBe("#secondary");
  });

  it("picks the value for the appearance being resolved", () => {
    expect(applyMobileToggleColor(VARIABLES, "light", "blue")["--color-switch-active-track"]).toBe(
      "#0a6cff",
    );
    expect(applyMobileToggleColor(VARIABLES, "dark", "blue")["--color-switch-active-track"]).toBe(
      "#0a84ff",
    );
  });
});
