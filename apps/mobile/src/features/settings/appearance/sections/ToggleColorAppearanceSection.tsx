import { Pressable, View } from "react-native";

import { SymbolView } from "../../../../components/AppSymbol";
import { AppText as Text } from "../../../../components/AppText";
import { cn } from "../../../../lib/cn";
import {
  mobileToggleColorTrack,
  MOBILE_TOGGLE_COLOR_OPTIONS,
  type MobileToggleColorId,
} from "../../../../lib/toggleColor";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

function ColorSwatch(props: {
  readonly color: string | null;
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${props.label} toggle color`}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected, disabled: props.disabled }}
      className={cn(
        "size-12 items-center justify-center rounded-full active:scale-[0.92]",
        props.selected ? "border-2 border-primary" : "border border-border",
        props.disabled && "opacity-[0.45]",
      )}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <View
        // System shows what the theme's switches already use, so the swatch
        // matches the toggles on the screen behind it.
        className={cn(
          "size-8 items-center justify-center rounded-full",
          !props.color && "bg-switch-active-track",
        )}
        style={props.color ? { backgroundColor: props.color } : undefined}
      >
        {props.selected ? (
          <SymbolView
            name="checkmark"
            size={15}
            tintColorClassName="accent-switch-active-thumb"
            type="monochrome"
            weight="semibold"
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export function ToggleColorAppearanceSection() {
  const { isReady, setToggleColorId, themeAppearance, toggleColorId } = useAppearancePreferences();

  return (
    <View className="gap-3">
      <Text className="px-2 text-sm font-t3-medium text-foreground-muted">Toggle color</Text>
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-3">
        {MOBILE_TOGGLE_COLOR_OPTIONS.map((option) => (
          <ColorSwatch
            color={mobileToggleColorTrack(option.id, themeAppearance)}
            disabled={!isReady}
            key={option.id}
            label={option.label}
            onPress={() => setToggleColorId(option.id as MobileToggleColorId)}
            selected={option.id === toggleColorId}
          />
        ))}
      </View>
      <Text className="px-2 text-sm text-foreground-muted">
        Sets the color every switch shows while it is on.
      </Text>
    </View>
  );
}
