import type { ServerProvider } from "@t3tools/contracts";
import { CHATGPT_USAGE_URL, usesChatGptSharing } from "@t3tools/shared/usageLimits";
import { Alert, Linking, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";

/**
 * Notice above the thread settings options when the selected Codex provider
 * bills eligible usage to the user's ChatGPT plan. Renders nothing otherwise.
 */
export function ChatGptSharingStatus(props: { readonly provider: ServerProvider | null }) {
  if (!usesChatGptSharing(props.provider)) return null;
  return (
    <View className="flex-row items-center justify-between gap-3 px-5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ChatGPT token sharing is active"
        className="min-h-11 flex-row items-center gap-2 active:opacity-60"
        onPress={() => {
          Alert.alert(
            "ChatGPT sharing is on",
            [
              props.provider?.auth.email,
              "Eligible usage uses your ChatGPT plan. Credit settings and limits are managed in ChatGPT.",
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
        }}
      >
        <ProviderIcon provider="codex" size={14} />
        <Text className="text-xs text-foreground-muted">Using ChatGPT plan</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        className="min-h-11 justify-center active:opacity-60"
        onPress={() => void Linking.openURL(CHATGPT_USAGE_URL).catch(() => undefined)}
      >
        <Text className="text-xs font-t3-medium text-primary">Manage usage</Text>
      </Pressable>
    </View>
  );
}
