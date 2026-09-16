import type { ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView, type AppSymbolName } from "./AppSymbol";
import { AppText as Text } from "./AppText";
import { GlassControl } from "./GlassControl";
import { GlassSurface } from "./GlassSurface";
import { cn } from "../lib/cn";

export interface AndroidHeaderAction {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

export function AndroidHeaderIconButton(props: {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      disabled={props.disabled}
      hitSlop={8}
      onPress={props.onPress}
      className={props.disabled ? "opacity-55" : undefined}
    >
      {/* Same circle as the home header's controls: liquid glass where the
          platform has it, the flat bg-subtle fill everywhere else. */}
      <GlassControl className="size-11 items-center justify-center rounded-full" radius={22}>
        <SymbolView
          name={props.icon}
          size={20}
          tintColorClassName={props.disabled ? "accent-icon-subtle" : "accent-foreground"}
          type="monochrome"
        />
      </GlassControl>
    </Pressable>
  );
}

export function AndroidScreenHeader(props: {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly actions?: ReadonlyArray<AndroidHeaderAction>;
  readonly trailing?: ReactNode;
  /** Sits on the header surface under the title row, above the bottom border.
      The Files screen puts its search field here, matching the home header. */
  readonly below?: ReactNode;
  readonly onBack?: () => void;
  readonly embedded?: boolean;
  readonly hideBottomBorder?: boolean;
  /** Floats the bar over the screen as liquid glass instead of sitting in
      flow, so content refracts through it while it scrolls underneath. The
      caller owns the matching top inset for that content and measures this
      bar with `onLayout` (see ThreadRouteScreen). */
  readonly floating?: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const paddingTop = props.embedded ? 8 : Math.max(insets.top, 12);
  const paddingClassName = cn("px-3", props.below ? "pb-3" : "pb-2.5");

  const content = (
    <>
      <View className="min-h-12 flex-row items-center gap-2">
        {props.onBack ? (
          <Pressable
            accessibilityLabel="Navigate up"
            accessibilityRole="button"
            hitSlop={8}
            onPress={props.onBack}
            className="-mr-2 size-11 items-center justify-center"
          >
            <SymbolView
              name="chevron.left"
              size={24}
              tintColorClassName={"accent-foreground"}
              type="monochrome"
            />
          </Pressable>
        ) : null}

        <View className={cn("min-w-0 flex-1", !props.onBack && "pl-1")}>
          <Text numberOfLines={1} className="text-lg font-t3-bold text-foreground">
            {props.title}
          </Text>
          {props.subtitle ? (
            <Text
              numberOfLines={1}
              className="mt-px text-[13px] font-t3-medium text-foreground-muted"
            >
              {props.subtitle}
            </Text>
          ) : null}
        </View>

        {props.actions?.map((action) => (
          <AndroidHeaderIconButton
            key={action.accessibilityLabel}
            accessibilityLabel={action.accessibilityLabel}
            disabled={action.disabled}
            icon={action.icon}
            onPress={action.onPress}
          />
        ))}
        {props.trailing}
      </View>

      {props.below ? <View className="mt-3">{props.below}</View> : null}
    </>
  );

  if (props.floating) {
    // The glass has to CONTAIN what it sits over (see GlassSurface), so the
    // padded row lives inside it and the bar carries no border of its own.
    return (
      <GlassSurface
        chrome="none"
        glassEffectStyle="regular"
        onLayout={props.onLayout}
        tintColor="transparent"
        style={{ position: "absolute", top: 0, left: 0, right: 0, borderRadius: 0, zIndex: 1 }}
      >
        <View className={paddingClassName} style={{ paddingTop }}>
          {content}
        </View>
      </GlassSurface>
    );
  }

  return (
    <View
      className={cn("border-b border-header-border bg-header", paddingClassName)}
      onLayout={props.onLayout}
      style={{
        paddingTop,
        borderBottomWidth: props.hideBottomBorder ? 0 : undefined,
      }}
    >
      {content}
    </View>
  );
}

export function AndroidSheetHeader(
  props: Omit<Parameters<typeof AndroidScreenHeader>[0], "embedded">,
) {
  return <AndroidScreenHeader {...props} embedded />;
}
