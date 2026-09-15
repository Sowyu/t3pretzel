import type { MobileThemeAppearance, MobileThemeVariables } from "./mobileTheme";

/**
 * Colour a switch shows while it is on. Each entry carries a light and a dark
 * value so the swatch keeps its contrast in both appearances; `system` carries
 * none and leaves the active theme's accent in place, which is what every
 * build did before this preference existed.
 */
export const MOBILE_TOGGLE_COLOR_OPTIONS = [
  { id: "system", label: "System", light: null, dark: null },
  { id: "blue", label: "Blue", light: "#0a6cff", dark: "#0a84ff" },
  { id: "indigo", label: "Indigo", light: "#5145d8", dark: "#7d7aff" },
  { id: "purple", label: "Purple", light: "#9b31d8", dark: "#bf5af2" },
  { id: "pink", label: "Pink", light: "#d81b60", dark: "#ff4d79" },
  { id: "red", label: "Red", light: "#d92d20", dark: "#ff453a" },
  { id: "orange", label: "Orange", light: "#d9730d", dark: "#ff9f0a" },
  { id: "teal", label: "Teal", light: "#0d9488", dark: "#2dd4bf" },
  { id: "green", label: "Green", light: "#2a9d4c", dark: "#30d158" },
] as const;

export type MobileToggleColorId = (typeof MOBILE_TOGGLE_COLOR_OPTIONS)[number]["id"];

export const DEFAULT_MOBILE_TOGGLE_COLOR_ID: MobileToggleColorId = "system";

// A coloured track always gets a white thumb, matching how both platforms draw
// their own switches. The theme's accentForeground is only readable against the
// accent it was derived from.
const TOGGLE_THUMB_COLOR = "#ffffff";

export function normalizeMobileToggleColorId(value: unknown): MobileToggleColorId {
  return MOBILE_TOGGLE_COLOR_OPTIONS.some((option) => option.id === value)
    ? (value as MobileToggleColorId)
    : DEFAULT_MOBILE_TOGGLE_COLOR_ID;
}

/** Track colour for one appearance, or null when the theme accent should win. */
export function mobileToggleColorTrack(
  id: MobileToggleColorId,
  appearance: MobileThemeAppearance,
): string | null {
  return MOBILE_TOGGLE_COLOR_OPTIONS.find((option) => option.id === id)?.[appearance] ?? null;
}

/**
 * Overrides the on-state switch variables so every `ThemedSwitch` picks the
 * choice up through its existing `accent-switch-*` classes. Returns the same
 * object for `system` so the provider's memo stays stable.
 */
export function applyMobileToggleColor(
  variables: MobileThemeVariables,
  appearance: MobileThemeAppearance,
  id: MobileToggleColorId,
): MobileThemeVariables {
  const track = mobileToggleColorTrack(id, appearance);
  if (track === null) {
    return variables;
  }
  return {
    ...variables,
    "--color-switch-active-track": track,
    "--color-switch-active-thumb": TOGGLE_THUMB_COLOR,
  };
}
