import type {
  EnvironmentId,
  OrchestrationProjectShell,
  OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { projectThreadAwarenessV2, type AgentAwarenessPhase } from "@t3tools/shared/agentAwareness";
import * as DateTime from "effect/DateTime";

/** A turn finished somewhere the user was not looking. */
export interface TurnCompletionAlert {
  /** One per run, so the native seen-alert history posts it once. */
  readonly alertId: string;
  readonly title: string;
  readonly body: string;
  /** `/threads/:environmentId/:threadId`, opened on tap. */
  readonly path: string;
}

// A refresh after days away must not post every turn that finished meanwhile.
const MAX_ALERT_AGE_MS = 12 * 60 * 60_000;
const TITLE_LIMIT = 120;
const BODY_LIMIT = 240;

const FINISHED: ReadonlySet<AgentAwarenessPhase> = new Set(["completed", "failed"]);

function truncate(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}

function phaseOf(
  environmentId: EnvironmentId,
  projectTitle: string,
  thread: OrchestrationV2ThreadShell,
) {
  return projectThreadAwarenessV2({ environmentId, project: { title: projectTitle }, thread });
}

/**
 * Compares two views of one environment's threads and returns the turns that
 * finished between them. `previous` is the cached shell for a background
 * refresh, or the last live snapshot for a backgrounded app; null means there
 * is no earlier view, so nothing is new.
 *
 * A turn counts when its run is finished now and the earlier view did not
 * already show that run finished. A thread created and finished in between
 * counts too, since a 15 minute refresh often swallows a whole turn. The alert
 * id names the run, so a reconnect that replays an older snapshot, or a live
 * notifier and a background refresh that both see the turn, post it once.
 */
export function detectTurnCompletions(input: {
  readonly environmentId: EnvironmentId;
  readonly previous: ReadonlyArray<OrchestrationV2ThreadShell> | null;
  readonly current: ReadonlyArray<OrchestrationV2ThreadShell>;
  readonly projects: ReadonlyArray<Pick<OrchestrationProjectShell, "id" | "title">>;
  readonly nowMs: number;
}): ReadonlyArray<TurnCompletionAlert> {
  if (input.previous === null) return [];
  const previousById = new Map(input.previous.map((thread) => [thread.id, thread] as const));
  const projectTitles = new Map(input.projects.map((project) => [project.id, project.title]));
  const alerts: Array<TurnCompletionAlert> = [];

  for (const thread of input.current) {
    const before = previousById.get(thread.id);
    // The shell reducer keeps unchanged rows by reference.
    if (before === thread || thread.latestRunId === null || thread.archivedAt !== null) continue;
    const projectTitle = projectTitles.get(thread.projectId) ?? "";
    const awareness = phaseOf(input.environmentId, projectTitle, thread);
    if (awareness === null || !FINISHED.has(awareness.phase)) continue;
    if (before !== undefined && before.latestRunId === thread.latestRunId) {
      const earlier = phaseOf(input.environmentId, projectTitle, before);
      if (earlier !== null && FINISHED.has(earlier.phase)) continue;
    }
    const finishedAt = thread.latestRunCompletedAt ?? thread.updatedAt;
    if (input.nowMs - DateTime.toEpochMillis(finishedAt) > MAX_ALERT_AGE_MS) continue;

    const failed = awareness.phase === "failed";
    const summary = awareness.detail?.trim() || awareness.headline;
    const project = awareness.projectTitle.trim();
    alerts.push({
      alertId: `turn:${input.environmentId}:${thread.id}:${thread.latestRunId}`,
      title: `${truncate(awareness.threadTitle, TITLE_LIMIT) || "Thread"} ${failed ? "failed" : "finished"}`,
      body: truncate(project ? `${project} · ${summary}` : summary, BODY_LIMIT),
      path: awareness.deepLink,
    });
  }
  return alerts;
}
