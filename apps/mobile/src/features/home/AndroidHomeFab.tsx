import type { ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { useWorkspaceState } from "../../state/workspace";

/**
 * Android-only wrapper that overlays a bottom-right new-task FAB on a thread
 * list. Other platforms render children unchanged.
 */
export function AndroidHomeFabLayout(props: {
  readonly onStartNewTask: () => void;
  readonly children: ReactNode;
  /** The tablet sidebar sits the FAB closer to the bottom edge. */
  readonly sidebar?: boolean;
}) {
  if (Platform.OS !== "android") {
    return <>{props.children}</>;
  }

  return <AndroidHomeFab {...props} />;
}

function AndroidHomeFab(props: {
  readonly onStartNewTask: () => void;
  readonly children: ReactNode;
  readonly sidebar?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { state } = useWorkspaceState();
  return (
    <View className="flex-1">
      {props.children}
      {state.hasConnections ? (
        <Pressable
          accessibilityLabel="New task"
          accessibilityRole="button"
          onPress={props.onStartNewTask}
          className="absolute right-5 size-14 items-center justify-center rounded-full bg-primary shadow-lg"
          style={{
            bottom: props.sidebar
              ? Math.max(insets.bottom, 12) + 6
              : Math.max(insets.bottom, 16) + 16,
          }}
        >
          <SymbolView
            name="square.and.pencil"
            size={22}
            tintColorClassName="accent-primary-foreground"
            type="monochrome"
          />
        </Pressable>
      ) : null}
    </View>
  );
}
