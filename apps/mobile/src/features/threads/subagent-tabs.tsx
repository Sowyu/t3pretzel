import {
  foldSubagentActivities,
  formatSubagentModelLabel,
  formatSubagentTokenCount,
  type RuntimeSubagent,
  type RuntimeSubagentStatus,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { memo, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { cn } from "../../lib/cn";
import { deriveSubagentTabs, subagentToolCalls } from "../../lib/subagentTabs";
import { useSelectedThreadDetail } from "../../state/use-thread-detail";
import { selectionHaptic } from "../../lib/haptics";

const STATUS_LABEL = {
  pending: "Starting",
  running: "Working",
  waiting: "Needs input",
  idle: "Idle",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
} as const satisfies Record<RuntimeSubagentStatus, string>;

const STATUS_DOT = {
  pending: "bg-adaptive-sky-600-400",
  running: "bg-adaptive-sky-600-400",
  waiting: "bg-adaptive-amber-700-400",
  idle: "bg-foreground-muted",
  completed: "bg-adaptive-emerald-600-400",
  failed: "bg-adaptive-rose-600-400",
  cancelled: "bg-foreground-muted",
  interrupted: "bg-foreground-muted",
} as const satisfies Record<RuntimeSubagentStatus, string>;

/**
 * Left-edge tabs, one per subagent, shown while any subagent of the selected
 * thread runs. Tapping a tab opens that agent's activity. Rendered by
 * ThreadDetailScreen over the feed; `top` clears the header.
 */
export const SubagentTabs = memo(function SubagentTabs(props: { readonly top: number }) {
  const thread = useSelectedThreadDetail();
  const activities = thread?.activities;
  const sessionStatus = thread?.session?.status;
  const sessionLive = sessionStatus === "running" || sessionStatus === "starting";
  const roster = useMemo(
    () => (activities ? foldSubagentActivities(activities, { sessionLive }) : []),
    [activities, sessionLive],
  );
  const tabs = useMemo(() => deriveSubagentTabs(roster), [roster]);
  // The sheet keeps the agents it opened with, so it still shows results after
  // the wave ends and the tabs go away.
  const [openIds, setOpenIds] = useState<ReadonlyArray<string> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sheetAgents = useMemo(() => {
    if (openIds === null) return [];
    const ids = new Set([...openIds, ...tabs.map((agent) => agent.id)]);
    return roster
      .filter((agent) => ids.has(agent.id))
      .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id.localeCompare(b.id));
  }, [openIds, roster, tabs]);

  const open = (agentId: string) => {
    void selectionHaptic();
    setOpenIds(tabs.map((agent) => agent.id));
    setSelectedId(agentId);
  };

  return (
    <>
      {tabs.length > 0 ? (
        <View
          pointerEvents="box-none"
          className="absolute left-0 gap-1.5"
          style={{ top: props.top + 8 }}
        >
          {tabs.map((agent, index) => (
            <Pressable
              key={agent.id}
              accessibilityRole="button"
              accessibilityLabel={`Subagent ${index + 1}, ${agent.title}, ${STATUS_LABEL[agent.status]}`}
              accessibilityHint="Double tap to see what it is doing."
              hitSlop={{ top: 4, bottom: 4, right: 10 }}
              onPress={() => open(agent.id)}
              className="min-h-10 w-6 items-center justify-center gap-1 rounded-r-lg border border-l-0 border-adaptive-neutral-200-a80-white-a8 bg-card active:bg-subtle"
            >
              <View className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[agent.status])} />
              <Text className="font-t3-medium text-2xs text-foreground">{index + 1}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {openIds !== null ? (
        <SubagentSheet
          agents={sheetAgents}
          selectedId={selectedId}
          onSelect={setSelectedId}
          activities={activities ?? []}
          onClose={() => setOpenIds(null)}
        />
      ) : null}
    </>
  );
});

function SubagentSheet(props: {
  readonly agents: ReadonlyArray<RuntimeSubagent>;
  readonly selectedId: string | null;
  readonly onSelect: (agentId: string) => void;
  readonly activities: NonNullable<ReturnType<typeof useSelectedThreadDetail>>["activities"];
  readonly onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const agent = props.agents.find((entry) => entry.id === props.selectedId) ?? props.agents[0];
  const tools = useMemo(
    () => (agent ? subagentToolCalls(props.activities, agent.id) : []),
    [agent, props.activities],
  );
  const meta = agent
    ? [
        agent.role,
        formatSubagentModelLabel(agent.model, agent.effort),
        agent.usage ? `${formatSubagentTokenCount(agent.usage.totalTokens)} tokens` : null,
      ].filter(Boolean)
    : [];

  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose}>
      <View
        className="flex-1 bg-screen"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="flex-row items-center justify-between gap-3 px-5 py-3">
          <Text className="flex-1 font-t3-semibold text-xl">Subagents</Text>
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            className="min-h-11 justify-center px-3"
          >
            <Text className="text-base text-primary">Done</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="max-h-12 grow-0"
          contentContainerClassName="gap-2 px-5 pb-2"
        >
          {props.agents.map((entry, index) => {
            const selected = entry.id === agent?.id;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => props.onSelect(entry.id)}
                className={cn(
                  "min-h-9 max-w-56 flex-row items-center gap-1.5 rounded-full border px-3",
                  selected
                    ? "border-foreground bg-subtle"
                    : "border-adaptive-neutral-200-a80-white-a8 bg-card",
                )}
              >
                <View className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[entry.status])} />
                <Text className="shrink text-sm text-foreground" numberOfLines={1}>
                  {`${index + 1}. ${entry.title}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {agent ? (
          <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pb-6 pt-2">
            <View className="gap-1">
              <Text selectable className="font-t3-semibold text-lg text-foreground">
                {agent.title}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <View className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[agent.status])} />
                <Text className="text-sm text-foreground-muted">
                  {[STATUS_LABEL[agent.status], ...meta].join(" · ")}
                </Text>
              </View>
            </View>
            {agent.progress ? (
              <Text selectable className="text-sm text-foreground">
                {agent.progress}
              </Text>
            ) : null}
            <View className="gap-2">
              <Text className="font-t3-medium text-xs uppercase text-foreground-muted">
                {tools.length === 0 ? "No tool calls yet" : `Tool calls (${tools.length})`}
              </Text>
              {tools.map((tool) => (
                <View key={tool.id} className="flex-row gap-2">
                  <View
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 rounded-full",
                      tool.done ? "bg-foreground-muted" : "bg-adaptive-sky-600-400",
                    )}
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm text-foreground">{tool.title}</Text>
                    {tool.detail ? (
                      <Text
                        selectable
                        className="font-mono text-xs text-foreground-muted"
                        numberOfLines={4}
                      >
                        {tool.detail}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
            {agent.result || agent.error ? (
              <View className="gap-1">
                <Text className="font-t3-medium text-xs uppercase text-foreground-muted">
                  {agent.error ? "Error" : "Result"}
                </Text>
                <Text selectable className="text-sm text-foreground">
                  {agent.error ?? agent.result}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}
