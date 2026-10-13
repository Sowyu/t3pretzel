import { Platform } from "react-native";

/**
 * Form sheets inherit the live React Navigation palette supplied by App. Each
 * presented route paints its content with bg-sheet, including nested pushes.
 * Android has no system sheet radius, so every sheet gets the same rounded
 * top here; iOS keeps UIKit's own corner.
 */
export const FORM_SHEET_PRESENTATION_OPTIONS = {
  presentation: "formSheet" as const,
  ...(Platform.OS === "android" ? { sheetCornerRadius: 38 } : {}),
};
