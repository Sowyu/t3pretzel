import type { OrchestrationV2Subagent, OrchestrationV2TurnItem } from "@t3tools/contracts";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { isActiveSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";
import type { ThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import { copySorted } from "@t3tools/shared/Array";
import * as DateTime from "effect/DateTime";

export interface SubagentToolCall {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly done: boolean;
}

/** Longest tool detail kept; the sheet clamps it to four lines anyway. */
const MAX_DETAIL_LENGTH = 400;

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function clip(value: string | null): string | null {
  return value !== null && value.length > MAX_DETAIL_LENGTH
    ? `${value.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : value;
}

function spawnOrder(subagent: OrchestrationV2Subagent): number {
  return DateTime.toEpochMillis(subagent.startedAt ?? subagent.updatedAt);
}

/** The agent's name for tabs and the sheet: its title, else its prompt cut to one line. */
export function subagentTitle(subagent: Pick<OrchestrationV2Subagent, "title" | "prompt">): string {
  const prompt = subagent.prompt.trim();
  const title = text(subagent.title) ?? (prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt);
  return formatSubagentDisplayTitle(title || "Subagent");
}

/**
 * The agents behind the thread's pill: the current run's roster from
 * deriveThreadTurnSubagents, including finished siblings, while any of them
 * still runs. Empty once nothing is live, which hides the pill.
 */
export function deriveSubagentTabs(
  turn: ThreadTurnSubagents | null,
): ReadonlyArray<OrchestrationV2Subagent> {
  return turn !== null && turn.liveCount > 0 ? turn.subagents : [];
}

/** The sheet's agents among the thread's subagents, in spawn order. */
export function selectSubagents(
  subagents: ReadonlyArray<OrchestrationV2Subagent>,
  ids: ReadonlySet<string>,
): ReadonlyArray<OrchestrationV2Subagent> {
  return copySorted(
    subagents.filter((agent) => ids.has(agent.id)),
    (a, b) => spawnOrder(a) - spawnOrder(b) || a.id.localeCompare(b.id),
  );
}

function toolCall(item: OrchestrationV2TurnItem): Omit<SubagentToolCall, "id" | "done"> | null {
  const title = text(item.title);
  switch (item.type) {
    case "command_execution":
      return { title: title ?? "Ran command", detail: text(item.input) };
    case "file_change":
      return {
        title: title ?? "Edited file",
        detail:
          item.changes !== undefined && item.changes.length > 1
            ? `${item.fileName} +${item.changes.length - 1} more`
            : item.fileName,
      };
    case "file_search":
      return { title: title ?? "Searched files", detail: text(item.pattern) };
    case "web_search":
      return { title: title ?? "Searched the web", detail: text(item.patterns?.join(", ")) };
    case "dynamic_tool":
      return {
        title: title ?? item.toolName ?? "Tool call",
        detail: item.input === undefined || item.input === null ? null : JSON.stringify(item.input),
      };
    case "subagent":
      return { title: subagentTitle({ title: item.title, prompt: item.prompt }), detail: null };
    default:
      return null;
  }
}

/**
 * Tool calls from a subagent's child thread, oldest first. Messages and
 * reasoning are left out: the sheet lists what the agent did, and its final
 * answer arrives as the subagent's `result`.
 */
export function subagentToolCalls(
  turnItems: ReadonlyArray<OrchestrationV2TurnItem>,
): ReadonlyArray<SubagentToolCall> {
  return copySorted(turnItems, (a, b) => a.ordinal - b.ordinal).flatMap((item) => {
    const call = toolCall(item);
    return call === null
      ? []
      : [
          {
            id: item.id,
            title: call.title,
            detail: clip(call.detail),
            done: !isActiveSubagentStatus(item.status),
          },
        ];
  });
}
