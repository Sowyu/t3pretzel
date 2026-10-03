import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { useCallback, useRef, useState } from "react";

import { selectionHaptic } from "../../lib/haptics";
import { environmentThreadDetails, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

/**
 * Messages the server holds behind the running turn, with the two things the
 * feed can do to one: steer the running turn with it now, or drop it.
 */
export function useThreadQueuedRuns(environmentId: EnvironmentId, threadId: ThreadId) {
  const workflow = useAtomValue(
    environmentThreadDetails.queueWorkflowAtom({ environmentId, threadId }),
  );
  const promote = useAtomCommand(threadEnvironment.promoteQueuedRun, "steer with queued message");
  const cancel = useAtomCommand(threadEnvironment.cancelQueuedRun, "remove queued message");
  const [busyRunId, setBusyRunId] = useState<RunId | null>(null);
  const busyRef = useRef(false);
  const activeRunId = workflow?.activeRun?.id ?? null;
  const canSteer = workflow?.canPromoteToSteer === true && activeRunId !== null;

  const run = useCallback(async (runId: RunId, action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyRunId(runId);
    void selectionHaptic();
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusyRunId(null);
    }
  }, []);

  const onSteer = useCallback(
    (queuedRunId: RunId) => {
      if (!canSteer || activeRunId === null) return;
      void run(queuedRunId, () =>
        promote({
          environmentId,
          input: { threadId, queuedRunId, targetRunId: activeRunId },
        }),
      );
    },
    [activeRunId, canSteer, environmentId, promote, run, threadId],
  );

  const onRemove = useCallback(
    (runId: RunId) => {
      void run(runId, () => cancel({ environmentId, input: { threadId, runId } }));
    },
    [cancel, environmentId, run, threadId],
  );

  return {
    queuedRuns: workflow?.queuedRuns ?? [],
    canSteer,
    busyRunId,
    onSteer,
    onRemove,
  };
}
