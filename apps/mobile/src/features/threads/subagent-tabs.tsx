import type { ThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import { memo } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { GlassControl } from "../../components/GlassControl";
import { SubagentStatusDot } from "./SubagentStatusDot";

/**
 * One pill under the header, "3 agents working · 2 done", shown while any
 * subagent of the current turn runs. Tapping it opens the Agents sheet, which
 * lists every agent and opens its thread. Rendered by ThreadDetailScreen over
 * the feed; `top` clears the header.
 */
export const SubagentTabs = memo(function SubagentTabs(props: {
  readonly top: number;
  readonly turn: ThreadTurnSubagents | null;
  readonly onOpen: () => void;
}) {
  const turn = props.turn;
  if (turn === null || turn.liveCount === 0) return null;
  const doneCount = turn.subagents.length - turn.liveCount;
  const label = [
    `${turn.liveCount} ${turn.liveCount === 1 ? "agent" : "agents"} working`,
    doneCount > 0 ? `${doneCount} done` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens this turn's subagents"
      hitSlop={6}
      onPress={props.onOpen}
      className="absolute left-3 active:opacity-70"
      style={{ top: props.top + 8 }}
    >
      <GlassControl
        radius={18}
        className="h-9 border border-border bg-card shadow-md shadow-black/10"
      >
        <View className="h-9 flex-row items-center gap-2 px-3.5">
          <SubagentStatusDot tone="working" placement="sheet" />
          <Text className="font-t3-medium text-xs text-foreground" numberOfLines={1}>
            {label}
          </Text>
        </View>
      </GlassControl>
    </Pressable>
  );
});
