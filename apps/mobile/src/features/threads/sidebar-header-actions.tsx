import { GlassFill } from "../../components/GlassSurface";
import { useLiquidGlass } from "../../components/useLiquidGlass";
import { SymbolView } from "../../components/AppSymbol";
import { Pressable, View } from "react-native";

export interface SidebarHeaderActionsProps {
  readonly onOpenSettings: () => void;
}

function FallbackHeaderButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: "gearshape" | "square.and.pencil";
  readonly onPress: () => void;
}) {
  const liquid = useLiquidGlass().tier !== "none";
  return (
    <Pressable
      className={
        liquid
          ? "size-11 items-center justify-center rounded-full"
          : "size-11 items-center justify-center rounded-full bg-subtle active:opacity-70"
      }
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
      onPress={props.onPress}
    >
      {liquid ? <GlassFill shape="circle" /> : null}
      <SymbolView
        name={props.icon}
        size={18}
        tintColorClassName="accent-foreground"
        type="monochrome"
      />
    </Pressable>
  );
}

export function SidebarHeaderActions(props: SidebarHeaderActionsProps) {
  return (
    <View className="flex-row items-center gap-0.5">
      <FallbackHeaderButton
        accessibilityLabel="Open settings"
        icon="gearshape"
        onPress={props.onOpenSettings}
      />
    </View>
  );
}
