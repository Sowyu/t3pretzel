import { View } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";

/** The enclosing radio row owns selection, touch and accessibility. */
export function MaterialRadioIndicator({ selected }: { readonly selected: boolean }) {
  const { themeVariables } = useAppearancePreferences();
  // Expo's radio button cannot override colors in the pinned SDK, and every
  // theme needs its exact accent, so the indicator is drawn here.
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: themeVariables[selected ? "--color-primary" : "--color-foreground-muted"],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: themeVariables["--color-primary"],
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
