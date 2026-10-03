import type { EnvironmentId, OrchestrationV2Subagent, ThreadId } from "@t3tools/contracts";
import { isActiveSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";
import { deriveThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";
import { memo, useEffect, useMemo } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { GlassControl } from "../../components/GlassControl";
import { cn } from "../../lib/cn";
import {
  deriveSubagentTabs,
  selectSubagents,
  subagentTitle,
  subagentToolCalls,
} from "../../lib/subagentTabs";
import { useSelectedThreadProjection, useThreadProjection } from "../../state/use-thread-detail";
import { selectionHaptic } from "../../lib/haptics";
import { appAtomRegistry } from "../../state/atom-registry";

type SubagentStatus = OrchestrationV2Subagent["status"];

const STATUS_LABEL = {
  pending: "Starting",
  running: "Working",
  waiting: "Needs input",
  idle: "Idle",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
} as const satisfies Record<SubagentStatus, string>;

const STATUS_DOT = {
  pending: "bg-adaptive-sky-600-400",
  running: "bg-adaptive-sky-600-400",
  waiting: "bg-adaptive-amber-700-400",
  idle: "bg-foreground-muted",
  completed: "bg-adaptive-emerald-600-400",
  failed: "bg-adaptive-rose-600-400",
  cancelled: "bg-foreground-muted",
  interrupted: "bg-foreground-muted",
} as const satisfies Record<SubagentStatus, string>;

/**
 * The open subagent sheet: the agents it lists and the one shown. It keeps the
 * agents it opened with, so it still shows results after the wave ends and the
 * tabs go away. The feed's subagent card opens it too (openSubagentSheet).
 */
const subagentSheetAtom = Atom.make<{
  readonly agentIds: ReadonlyArray<string>;
  readonly selectedId: string;
} | null>(null).pipe(Atom.keepAlive);

export function openSubagentSheet(agentIds: ReadonlyArray<string>, selectedId: string) {
  void selectionHaptic();
  appAtomRegistry.set(subagentSheetAtom, { agentIds, selectedId });
}

/**
 * One pill under the header, "3 agents working · 2 done", shown while any
 * subagent of the selected thread runs. Tapping it opens the sheet on the
 * first live agent, where every agent's full title and activity are. Rendered
 * by ThreadDetailScreen over the feed; `top` clears the header.
 */
export const SubagentTabs = memo(function SubagentTabs(props: { readonly top: number }) {
  const thread = useSelectedThreadProjection();
  const runs = thread?.projection.runs;
  const roster = thread?.projection.subagents;
  // Keyed on runs and subagents so streaming turn items do not recompute it.
  const tabs = useMemo(
    () =>
      runs && roster
        ? deriveSubagentTabs(deriveThreadTurnSubagents({ runs, subagents: roster }))
        : [],
    [runs, roster],
  );
  const liveTabs = tabs.filter((agent) => isActiveSubagentStatus(agent.status));
  const doneCount = tabs.length - liveTabs.length;
  const pillLabel = [
    `${liveTabs.length} ${liveTabs.length === 1 ? "agent" : "agents"} working`,
    doneCount > 0 ? `${doneCount} done` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sheet = useAtomValue(subagentSheetAtom);
  const setSheet = useAtomSet(subagentSheetAtom);
  // Leaving the thread closes the sheet, so it does not reopen on the next one.
  useEffect(() => () => setSheet(null), [setSheet]);

  const sheetAgents = useMemo(() => {
    if (sheet === null || !roster) return [];
    return selectSubagents(roster, new Set([...sheet.agentIds, ...tabs.map((agent) => agent.id)]));
  }, [sheet, roster, tabs]);

  return (
    <>
      {liveTabs.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pillLabel}
          accessibilityHint="Double tap to see what the subagents are doing."
          hitSlop={6}
          onPress={() =>
            openSubagentSheet(
              tabs.map((agent) => agent.id),
              liveTabs[0]!.id,
            )
          }
          className="absolute left-3 active:opacity-70"
          style={{ top: props.top + 8 }}
        >
          <GlassControl
            radius={18}
            className="h-9 border border-border bg-card shadow-md shadow-black/10"
          >
            <View className="h-9 flex-row items-center gap-2 px-3.5">
              <View className={cn("h-2 w-2 rounded-full", STATUS_DOT.running)} />
              <Text className="font-t3-medium text-xs text-foreground" numberOfLines={1}>
                {pillLabel}
              </Text>
            </View>
          </GlassControl>
        </Pressable>
      ) : null}
      {sheet !== null ? (
        <SubagentSheet
          environmentId={thread?.environmentId ?? null}
          agents={sheetAgents}
          selectedId={sheet.selectedId}
          onSelect={(selectedId) => setSheet({ ...sheet, selectedId })}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
});

function SubagentSheet(props: {
  readonly environmentId: EnvironmentId | null;
  readonly agents: ReadonlyArray<OrchestrationV2Subagent>;
  readonly selectedId: string | null;
  readonly onSelect: (agentId: string) => void;
  readonly onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const agent = props.agents.find((entry) => entry.id === props.selectedId) ?? props.agents[0];
  const meta = agent?.model ? [agent.model] : [];
  const failed = agent?.status === "failed";

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
                  {`${index + 1}. ${subagentTitle(entry)}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {agent ? (
          <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pb-6 pt-2">
            <View className="gap-1">
              <Text selectable className="font-t3-semibold text-lg text-foreground">
                {subagentTitle(agent)}
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
            {agent.childThreadId !== null && props.environmentId !== null ? (
              <SubagentToolCalls
                environmentId={props.environmentId}
                threadId={agent.childThreadId}
              />
            ) : null}
            {agent.result ? (
              <View className="gap-1">
                <Text className="font-t3-medium text-xs uppercase text-foreground-muted">
                  {failed ? "Error" : "Result"}
                </Text>
                <Text selectable className="text-sm text-foreground">
                  {agent.result}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * The selected agent's tool calls, read from its child thread. Mounted only
 * for the agent shown in the open sheet, so at most one extra thread
 * subscription is live. Agents without a child thread (some provider-native
 * ones) show only their progress and result.
 */
function SubagentToolCalls(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const child = useThreadProjection({
    environmentId: props.environmentId,
    threadId: props.threadId,
  });
  const turnItems = child?.projection.turnItems;
  // Only the child's own items: a forked child can carry its parent's history.
  const tools = useMemo(
    () =>
      turnItems
        ? subagentToolCalls(turnItems.filter((item) => item.threadId === props.threadId))
        : [],
    [props.threadId, turnItems],
  );

  return (
    <View className="gap-2">
      <Text className="font-t3-medium text-xs uppercase text-foreground-muted">
        {child === null
          ? "Loading tool calls"
          : tools.length === 0
            ? "No tool calls yet"
            : `Tool calls (${tools.length})`}
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
  );
}
