import type { ReactNode } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidSheetHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";

/** Sheet frame for the worktree setup details; the card mounts it while details are open. */
export function WorktreeSetupSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-sheet" style={{ paddingTop: insets.top }}>
        {Platform.OS === "android" ? (
          <AndroidSheetHeader title="Worktree setup" onBack={onClose} />
        ) : (
          <View className="flex-row items-center justify-between gap-3 px-5 py-3">
            <Text className="flex-1 font-t3-semibold text-xl">Worktree setup</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close setup details"
              onPress={onClose}
              className="min-h-11 justify-center px-3"
            >
              <Text className="text-base text-primary">Done</Text>
            </Pressable>
          </View>
        )}
        {children}
      </View>
    </Modal>
  );
}
