import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidSheetHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import type { WorktreeSetupSheetProps } from "./worktree-setup-sheet";

/** Bottom sheet over a dimmed backdrop; tapping the backdrop or Done closes it. */
export function WorktreeSetupSheet({ children, height, onClose }: WorktreeSetupSheetProps) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-backdrop">
        <Pressable accessibilityLabel="Close setup details" className="flex-1" onPress={onClose} />
        <View
          className="w-full max-w-[640px] self-center overflow-hidden rounded-t-[24px] bg-sheet-solid"
          style={{
            height: Math.min((height || 360) + 64 + insets.bottom, window.height * 0.85),
            paddingBottom: insets.bottom,
          }}
        >
          <AndroidSheetHeader
            title="Worktree setup"
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close setup details"
                onPress={onClose}
                className="min-h-11 justify-center px-2"
              >
                <Text className="font-t3-medium text-sm text-foreground">Done</Text>
              </Pressable>
            }
          />
          {children}
        </View>
      </View>
    </Modal>
  );
}
