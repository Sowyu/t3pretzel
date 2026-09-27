import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  isActiveSubagentStatus,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

export interface SubagentToolCall {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly done: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The agents behind the thread's left-edge tabs, from foldSubagentActivities:
 * every agent in the wave that is still running, including finished siblings
 * launched alongside it. Empty once nothing is live, which hides the tabs.
 * Workflow coordinators are containers, so only their members get tabs.
 */
export function deriveSubagentTabs(
  roster: ReadonlyArray<RuntimeSubagent>,
): ReadonlyArray<RuntimeSubagent> {
  const agents = roster.filter((agent) => agent.kind !== "workflow");
  let waveStart: string | null = null;
  for (const agent of agents) {
    if (isActiveSubagentStatus(agent.status) && (!waveStart || agent.firstSeenAt < waveStart)) {
      waveStart = agent.firstSeenAt;
    }
  }
  if (waveStart === null) return [];
  const start = waveStart;
  return agents
    .filter((agent) => agent.firstSeenAt >= start)
    .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id.localeCompare(b.id));
}

/**
 * Tool calls a subagent made, oldest first. The server stamps each inner tool
 * row with `agentId` = the agent's taskId and drops the subagent's own text,
 * so tool calls are all there is to show. Rows fold by the same identity the
 * server and work log use: `data.toolCallId`, else itemType/title/detail.
 */
export function subagentToolCalls(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  agentId: string,
): ReadonlyArray<SubagentToolCall> {
  const calls = new Map<string, SubagentToolCall>();
  const rows = activities
    .filter(
      (activity) =>
        (activity.kind === "tool.updated" || activity.kind === "tool.completed") &&
        asRecord(activity.payload)?.agentId === agentId,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const activity of rows) {
    const payload = asRecord(activity.payload)!;
    const detail = asText(payload.detail);
    const title = activity.summary.replace(/\s+(?:complete|completed)\s*$/iu, "").trim();
    const toolCallId = asText(asRecord(payload.data)?.toolCallId);
    const id = toolCallId
      ? `id:${toolCallId}`
      : [asText(payload.itemType) ?? "", title, detail ?? ""].join("\u001f");
    const previous = calls.get(id);
    calls.set(id, {
      id,
      title,
      detail: detail ?? previous?.detail ?? null,
      done: previous?.done === true || activity.kind === "tool.completed",
    });
  }
  return Array.from(calls.values());
}
