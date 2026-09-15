import {
  projectThreadAwareness,
  type AgentAwarenessPhase,
  type ProjectThreadAwarenessInput,
} from "@t3tools/shared/agentAwareness";
import type { EnvironmentId } from "@t3tools/contracts";

import { scopedThreadKey } from "../../lib/scopedEntities";

/** One thread as the reconciler needs it: its shell plus its project's title. */
export interface TurnCompletionThread {
  readonly environmentId: EnvironmentId;
  readonly projectTitle: string;
  readonly thread: ProjectThreadAwarenessInput["thread"];
}

export interface TurnCompletionNotification {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string;
}

/** Last phase seen per scoped thread key. Absent means never observed. */
export type TurnCompletionPhases = ReadonlyMap<string, AgentAwarenessPhase>;

export interface TurnCompletionReconciliation {
  readonly phases: TurnCompletionPhases;
  readonly notifications: ReadonlyArray<TurnCompletionNotification>;
}

const WORKING_PHASES: ReadonlySet<AgentAwarenessPhase> = new Set([
  "starting",
  "running",
  "waiting_for_approval",
  "waiting_for_input",
]);

const TITLE_LIMIT = 120;
const BODY_LIMIT = 240;

function truncate(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}

/**
 * Notification copy for a thread that just stopped working. The phase, headline
 * and detail come from the same helper the relay pushes are built from, so a
 * local alert reads like the push it stands in for.
 */
export function formatTurnCompletionNotification(input: {
  readonly key: string;
  readonly phase: "completed" | "failed";
  readonly threadTitle: string;
  readonly projectTitle: string;
  readonly headline: string;
  readonly detail: string | undefined;
  readonly deepLink: string;
}): TurnCompletionNotification {
  const threadTitle = truncate(input.threadTitle, TITLE_LIMIT) || "Thread";
  const summary = input.detail?.trim() || input.headline;
  const projectTitle = input.projectTitle.trim();
  return {
    key: input.key,
    title: `${threadTitle} ${input.phase === "failed" ? "failed" : "finished"}`,
    body: truncate(projectTitle ? `${projectTitle} · ${summary}` : summary, BODY_LIMIT),
    deepLink: input.deepLink,
  };
}

/**
 * Folds the current thread list against the phases seen last time and returns
 * what to post. A thread only notifies on the edge out of a working phase, so
 * the first sight of a thread (cold start, reconnect, a newly created thread)
 * never fires — otherwise every already-finished thread would alert at launch.
 *
 * Phases are recorded even when nothing is posted, so a suppressed completion
 * cannot fire later once the app backgrounds or notifications are granted.
 */
export function reconcileTurnCompletions(input: {
  readonly phases: TurnCompletionPhases;
  readonly threads: ReadonlyArray<TurnCompletionThread>;
  readonly enabled: boolean;
  readonly foreground: boolean;
  readonly openThreadKey: string | null;
}): TurnCompletionReconciliation {
  const phases = new Map<string, AgentAwarenessPhase>();
  const notifications: TurnCompletionNotification[] = [];

  for (const entry of input.threads) {
    const awareness = projectThreadAwareness({
      environmentId: entry.environmentId,
      project: { title: entry.projectTitle },
      thread: entry.thread,
    });
    if (awareness === null) continue;

    const key = scopedThreadKey(entry.environmentId, entry.thread.id);
    const previous = input.phases.get(key);
    phases.set(key, awareness.phase);

    if (awareness.phase !== "completed" && awareness.phase !== "failed") continue;
    if (previous === undefined || !WORKING_PHASES.has(previous)) continue;
    if (!input.enabled) continue;
    if (input.foreground && input.openThreadKey === key) continue;

    notifications.push(
      formatTurnCompletionNotification({
        key,
        phase: awareness.phase,
        threadTitle: awareness.threadTitle,
        projectTitle: awareness.projectTitle,
        headline: awareness.headline,
        detail: awareness.detail,
        deepLink: awareness.deepLink,
      }),
    );
  }

  return { phases, notifications };
}
