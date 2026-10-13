import { GlassFill } from "../../components/GlassSurface";
import { useLiquidGlass } from "../../components/useLiquidGlass";
import { SymbolView } from "../../components/AppSymbol";
import { Pressable } from "react-native";

export type SidebarFilterButtonIcon =
  | "line.3.horizontal.decrease.circle"
  | "line.3.horizontal.decrease.circle.fill";

export function SidebarFilterButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: SidebarFilterButtonIcon;
}) {
  const liquid = useLiquidGlass().tier !== "none";
  return (
    <Pressable
      className={
        liquid
          ? "size-11 cursor-pointer items-center justify-center rounded-full"
          : "size-11 cursor-pointer items-center justify-center rounded-full bg-subtle active:opacity-70"
      }
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
    >
      {liquid ? <GlassFill shape="circle" /> : null}
      <SymbolView
        name={props.icon}
        size={16}
        tintColorClassName="accent-foreground"
        type="monochrome"
      />
    </Pressable>
  );
}
