import type { MenuView } from "@react-native-menu/menu";
import type { ComponentProps, ReactNode } from "react";
import type { AccessibilityProps } from "react-native";

import type { AndroidMenuAction } from "./AndroidAnchoredMenu";

export type ControlPillMenuProps = Omit<
  ComponentProps<typeof MenuView>,
  "actions" | "children" | "themeVariant"
> &
  Pick<AccessibilityProps, "accessible" | "accessibilityLabel" | "accessibilityRole"> & {
    /** Android draws `leading` nodes; iOS drops them for the native UIMenu. */
    readonly actions: readonly AndroidMenuAction[];
    readonly children: ReactNode;
    readonly className?: string;
  };
