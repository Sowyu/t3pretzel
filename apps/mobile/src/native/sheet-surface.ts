import { Platform } from "react-native";

/**
 * Form sheets inherit the live React Navigation palette supplied by App. Each
 * presented route paints its content with bg-sheet, including nested pushes.
 * Android has no system sheet radius, so every sheet gets the same rounded
 * top here; iOS keeps UIKit's own corner.
 *
 * Android's native sheet is clear and flat: GuardedScreenLayout (Stack.tsx)
 * draws the iOS 26 floating card inside it, inset from the screen edges.
 */
export const FORM_SHEET_PRESENTATION_OPTIONS = {
  presentation: "formSheet" as const,
  ...(Platform.OS === "android"
    ? {
        sheetCornerRadius: 38,
        sheetElevation: 0,
        contentStyle: { backgroundColor: "transparent" },
      }
    : {}),
};

/** iOS 26 floats a partial-height sheet this far in from the screen edges, with 38pt corners. */
export const FLOATING_SHEET_INSET = 8;
export const FLOATING_SHEET_RADIUS = 38;
