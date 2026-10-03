import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { CHATGPT_USAGE_URL, collectExternalUsageLinks } from "@t3tools/shared/usageLimits";
import { Linking, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { ControlPill } from "../../components/ControlPill";
import { ProviderIcon } from "../../components/ProviderIcon";
import { environmentPresentations } from "../../state/presentation";

/** Usage tab card linking ChatGPT-account Codex users to the usage page ChatGPT keeps. */
export function ChatGptUsageSummary({
  selectedEnvironmentIds,
}: {
  selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
}) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const selected =
    selectedEnvironmentIds === null
      ? presentations
      : new Map([...presentations].filter(([id]) => selectedEnvironmentIds.has(id)));
  const usage = collectExternalUsageLinks(selected).find((link) => link.url === CHATGPT_USAGE_URL);
  if (!usage) return null;
  return (
    <View className="flex-row items-center gap-3 rounded-[24px] border-continuous bg-card p-4">
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <ProviderIcon provider="codex" size={16} />
          <Text className="text-sm font-t3-medium text-foreground">ChatGPT shared usage</Text>
        </View>
        <Text className="text-xs text-foreground-muted">
          {usage.accounts.join(", ")}. Open ChatGPT with the account you connected.
        </Text>
      </View>
      <ControlPill
        variant="pill"
        label="Manage usage"
        onPress={() => void Linking.openURL(usage.url).catch(() => undefined)}
      />
    </View>
  );
}
