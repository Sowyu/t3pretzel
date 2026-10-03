import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { ThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import {
  isOrchestrationV2WorkActive,
  type EnvironmentId,
  type OrchestrationV2Subagent,
  type ThreadId,
} from "@t3tools/contracts";
import { copySorted } from "@t3tools/shared/Array";
import { deriveSubagentElapsedMs, formatDuration } from "@t3tools/shared/orchestrationTiming";
import { StackActions, useNavigation } from "@react-navigation/native";
import * as DateTime from "effect/DateTime";
import { Atom } from "effect/unstable/reactivity";
import { memo, useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidSheetHeader } from "../../components/AndroidScreenHeader";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { GlassControl } from "../../components/GlassControl";
import { cn } from "../../lib/cn";
import { selectionHaptic } from "../../lib/haptics";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentThreadDetails } from "../../state/threads";
import { useThreadProjection } from "../../state/use-thread-detail";
import { SubagentStatusDot } from "./SubagentStatusDot";
import { resolveSubagentRowPresentation } from "./threadAgentsPresentation";

type AgentsTarget = { readonly environmentId: EnvironmentId; readonly threadId: ThreadId };

function spawnOrder(subagent: OrchestrationV2Subagent): number {
  return DateTime.toEpochMillis(subagent.startedAt ?? subagent.updatedAt);
}

/** The sheet's agents among the thread's subagents, in spawn order. */
function selectSubagents(
  subagents: ReadonlyArray<OrchestrationV2Subagent>,
  ids: ReadonlySet<string>,
): ReadonlyArray<OrchestrationV2Subagent> {
  return copySorted(
    subagents.filter((agent) => ids.has(agent.id)),
    (a, b) => spawnOrder(a) - spawnOrder(b) || a.id.localeCompare(b.id),
  );
}

export function useThreadTurnSubagents(target: AgentsTarget): ThreadTurnSubagents | null {
  return useAtomValue(environmentThreadDetails.turnSubagentsAtom(target));
}

/**
 * The open agents sheet: the agents it lists and the row last tapped. It keeps
 * the agents it opened with, so it still shows results after the wave ends and
 * the pill goes away. The feed's subagent card opens it too (openSubagentSheet).
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
 * One glass pill under the header, "3 agents working · 2 done", shown while
 * any subagent of the current turn runs. Tapping it opens the agents sheet.
 * Rendered by ThreadDetailScreen over the feed; `top` clears the header.
 */
export const SubagentTabs = memo(function SubagentTabs(
  props: AgentsTarget & { readonly top: number },
) {
  const turn = useThreadTurnSubagents(props);
  const liveCount = turn?.liveCount ?? 0;
  const doneCount = (turn?.subagents.length ?? 0) - liveCount;
  const pillLabel = [
    `${liveCount} ${liveCount === 1 ? "agent" : "agents"} working`,
    doneCount > 0 ? `${doneCount} done` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sheet = useAtomValue(subagentSheetAtom);
  const setSheet = useAtomSet(subagentSheetAtom);
  // Leaving the thread closes the sheet, so it does not reopen on the next one.
  useEffect(() => () => setSheet(null), [setSheet]);

  return (
    <>
      {turn !== null && liveCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pillLabel}
          accessibilityHint="Opens the list of agents in this turn"
          hitSlop={6}
          onPress={() => {
            const firstLive = turn.subagents.find((agent) =>
              isOrchestrationV2WorkActive(agent.status),
            );
            openSubagentSheet(
              turn.subagents.map((agent) => agent.id),
              firstLive?.id ?? turn.subagents[0]!.id,
            );
          }}
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
                {pillLabel}
              </Text>
            </View>
          </GlassControl>
        </Pressable>
      ) : null}
      {sheet !== null ? (
        <ThreadAgentsSheet
          environmentId={props.environmentId}
          threadId={props.threadId}
          agentIds={sheet.agentIds}
          selectedId={sheet.selectedId}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
});

/**
 * The agents of one wave, upstream's ThreadAgentsSheet rows in the fork's
 * modal sheet. A row with its own thread opens it; provider-native agents run
 * inside the parent and only show their progress or result.
 */
function ThreadAgentsSheet(
  props: AgentsTarget & {
    readonly agentIds: ReadonlyArray<string>;
    readonly selectedId: string;
    readonly onClose: () => void;
  },
) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const turn = useThreadTurnSubagents(props);
  const roster = useThreadProjection(props)?.projection.subagents;
  const subagents = useMemo(
    () =>
      roster
        ? selectSubagents(
            roster,
            new Set([...props.agentIds, ...(turn?.subagents ?? []).map((agent) => agent.id)]),
          )
        : [],
    [props.agentIds, roster, turn],
  );
  const hasLiveAgent = subagents.some((agent) => isOrchestrationV2WorkActive(agent.status));

  const openChildThread = (childThreadId: ThreadId) => {
    void selectionHaptic();
    props.onClose();
    // Pushed, so Back returns to this thread.
    navigation.dispatch(
      StackActions.push("Thread", {
        environmentId: String(props.environmentId),
        threadId: String(childThreadId),
      }),
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose}>
      <View className="flex-1 bg-sheet" style={{ paddingTop: insets.top }}>
        {Platform.OS === "android" ? (
          <AndroidSheetHeader title="Agents" onBack={props.onClose} />
        ) : (
          <View className="flex-row items-center justify-between gap-3 px-5 py-3">
            <Text className="flex-1 font-t3-semibold text-xl">Agents</Text>
            <Pressable
              accessibilityRole="button"
              onPress={props.onClose}
              className="min-h-11 justify-center px-3"
            >
              <Text className="text-base text-primary">Done</Text>
            </Pressable>
          </View>
        )}
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        >
          {subagents.length === 0 ? (
            <Text className="pt-6 text-center text-sm text-foreground-muted">
              {roster ? "No agents in this turn." : "Loading agents…"}
            </Text>
          ) : (
            subagents.map((subagent) => (
              <AgentRow
                key={subagent.id}
                subagent={subagent}
                selected={subagent.id === props.selectedId}
                tickSeconds={hasLiveAgent}
                onOpen={openChildThread}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const AgentRow = memo(function AgentRow(props: {
  readonly subagent: OrchestrationV2Subagent;
  readonly selected: boolean;
  readonly tickSeconds: boolean;
  readonly onOpen: (childThreadId: ThreadId) => void;
}) {
  const { subagent } = props;
  const presentation = resolveSubagentRowPresentation(subagent);
  const childThreadId = subagent.childThreadId;
  const elapsed = useSubagentElapsed(subagent, props.tickSeconds);
  const accessibilityLabel = `${presentation.title}, ${presentation.statusLabel}`;

  const row = (
    <View
      className={cn(
        "-mx-2 min-h-14 flex-row items-center gap-3 rounded-2xl px-2 py-3",
        props.selected && "bg-subtle",
      )}
    >
      <SubagentStatusDot tone={presentation.tone} placement="sheet" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-t3-medium text-sm text-foreground" numberOfLines={1}>
          {presentation.title}
        </Text>
        <Text
          className="text-xs text-foreground-muted"
          numberOfLines={childThreadId === null ? 4 : 1}
        >
          {presentation.detail ?? presentation.statusLabel}
        </Text>
      </View>
      {elapsed === null ? null : (
        <Text className="shrink-0 text-2xs tabular-nums text-foreground-muted">{elapsed}</Text>
      )}
      {presentation.canOpenThread ? (
        <SymbolView name="chevron.right" size={12} tintColorClassName="accent-icon-subtle" />
      ) : null}
    </View>
  );

  if (childThreadId === null) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Provider-managed agent. Its work appears in the transcript."
      >
        {row}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens this agent's thread"
      onPress={() => props.onOpen(childThreadId)}
      className="active:opacity-70"
    >
      {row}
    </Pressable>
  );
});

/**
 * Elapsed time for one agent. Only a live agent in a sheet with live work
 * ticks, so a settled sheet never repaints.
 */
function useSubagentElapsed(
  subagent: Pick<OrchestrationV2Subagent, "status" | "startedAt" | "completedAt">,
  tickSeconds: boolean,
): string | null {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const running = isOrchestrationV2WorkActive(subagent.status);
  useEffect(() => {
    if (!tickSeconds || !running) return;
    const intervalId = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(intervalId);
  }, [running, tickSeconds]);
  const elapsedMs = deriveSubagentElapsedMs(
    {
      status: subagent.status,
      startedAt: subagent.startedAt === null ? null : DateTime.formatIso(subagent.startedAt),
      completedAt: subagent.completedAt === null ? null : DateTime.formatIso(subagent.completedAt),
    },
    nowMs,
  );
  return elapsedMs === null || elapsedMs === 0 ? null : formatDuration(elapsedMs);
}
