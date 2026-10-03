import { useAtomValue } from "@effect/atom-react";
import type { QueuedThreadRun } from "@t3tools/client-runtime/state/thread-workflows";
import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { useCallback, useMemo, useRef, useState } from "react";

import { selectionHaptic } from "../../lib/haptics";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { beginQueuedRunEdit } from "../../state/queued-run-edit";
import { environmentThreadDetails, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildCancelQueuedRunCommand } from "./threadQueueControlPresentation";

const NO_QUEUED_RUNS: ReadonlyArray<QueuedThreadRun> = [];

export type QueuedRunAction = "steer" | "edit" | "up" | "down" | "remove";

/**
 * Messages the server holds behind the running turn, and what the queue panel
 * can do to one: steer the running turn with it, open it in the composer,
 * move it, or drop it. One mutation at a time; `busyRunId` names it.
 */
export function useThreadQueuedRuns(environmentId: EnvironmentId, threadId: ThreadId) {
  const workflow = useAtomValue(
    environmentThreadDetails.queueWorkflowAtom({ environmentId, threadId }),
  );
  const promote = useAtomCommand(threadEnvironment.promoteQueuedRun, "steer with queued message");
  const cancel = useAtomCommand(threadEnvironment.cancelQueuedRun, "remove queued message");
  const reorder = useAtomCommand(threadEnvironment.reorderQueuedRun, "reorder queued message");
  const resume = useAtomCommand(threadEnvironment.resumeThreadQueue, "resume queue");
  const [busyRunId, setBusyRunId] = useState<RunId | "resume" | null>(null);
  const busyRef = useRef(false);
  const queuedRuns = workflow?.queuedRuns ?? NO_QUEUED_RUNS;

  const run = useCallback(async (key: RunId | "resume", action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyRunId(key);
    void selectionHaptic();
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusyRunId(null);
    }
  }, []);

  const onAction = useCallback(
    (runId: RunId, action: QueuedRunAction) => {
      const index = queuedRuns.findIndex((entry) => entry.run.id === runId);
      const entry = queuedRuns[index];
      if (!entry || busyRef.current) return;
      switch (action) {
        case "edit":
          void selectionHaptic();
          beginQueuedRunEdit(scopedThreadKey(environmentId, threadId), {
            runId,
            messageId: entry.messageId,
            originalText: entry.text,
            existingAttachments: entry.attachments,
            ...(entry.context ? { context: entry.context } : {}),
          });
          return;
        case "up":
        case "down": {
          // The server inserts before `beforeRunId`; null appends.
          const beforeRunId =
            action === "up"
              ? queuedRuns[index - 1]?.run.id
              : (queuedRuns[index + 2]?.run.id ?? null);
          if (beforeRunId === undefined || !workflow?.canReorder) return;
          if (action === "down" && index >= queuedRuns.length - 1) return;
          void run(runId, () =>
            reorder({ environmentId, input: { threadId, runId, beforeRunId } }),
          );
          return;
        }
        case "remove":
          void run(runId, () =>
            cancel(buildCancelQueuedRunCommand({ environmentId, threadId, runId })),
          );
          return;
        case "steer": {
          const targetRunId = workflow?.activeRun?.id;
          if (!workflow?.canPromoteToSteer || targetRunId === undefined) return;
          void run(runId, () =>
            promote({ environmentId, input: { threadId, queuedRunId: runId, targetRunId } }),
          );
          return;
        }
      }
    },
    [cancel, environmentId, promote, queuedRuns, reorder, run, threadId, workflow],
  );

  const onResume = useCallback(() => {
    void run("resume", () => resume({ environmentId, input: { threadId } }));
  }, [environmentId, resume, run, threadId]);

  return useMemo(
    () => ({
      queuedRuns,
      isHeld: workflow?.isHeld === true,
      canReorder: workflow?.canReorder === true,
      canSteer: workflow?.canPromoteToSteer === true && workflow.activeRun !== null,
      busyRunId,
      onAction,
      onResume,
    }),
    [busyRunId, onAction, onResume, queuedRuns, workflow],
  );
}
