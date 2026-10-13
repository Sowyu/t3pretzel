import { useAtomValue } from "@effect/atom-react";
import { type VcsActionState, type VcsActionTarget } from "@t3tools/client-runtime/state/vcs";
import { Atom } from "effect/reactivity";
import { useMemo } from "react";

import { appAtomRegistry } from "./atom-registry";
import { vcsActionManager } from "./vcs";

export function useVcsActionState(target: VcsActionTarget): VcsActionState {
  return useAtomValue(vcsActionManager.stateAtom(target));
}

export interface GitActionResultNotification {
  readonly type: "success" | "error";
  readonly title: string;
  readonly description?: string;
  readonly prUrl?: string;
}

const RESULT_DISMISS_MS = 5_000;

const gitActionResultAtom = Atom.make<GitActionResultNotification | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:git-action-result"),
);
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function broadcast(result: GitActionResultNotification | null): void {
  appAtomRegistry.set(gitActionResultAtom, result);
}

export function showGitActionResult(result: GitActionResultNotification): void {
  if (dismissTimer) clearTimeout(dismissTimer);
  broadcast(result);
  dismissTimer = setTimeout(() => {
    dismissTimer = null;
    broadcast(null);
  }, RESULT_DISMISS_MS);
}

export function dismissGitActionResult(): void {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = null;
  broadcast(null);
}

export function useGitActionResultNotification(): {
  readonly result: GitActionResultNotification | null;
  readonly dismiss: () => void;
} {
  const result = useAtomValue(gitActionResultAtom);
  return { result, dismiss: dismissGitActionResult };
}

export type GitActionProgressPhase = "idle" | "running" | "success" | "error";

export interface GitActionProgress {
  readonly phase: GitActionProgressPhase;
  readonly label: string | null;
  readonly description: string | null;
  /**
   * When a running action without output started. The overlay ticks its own
   * elapsed label from this, so the screen calling the hook never re-renders
   * on a clock.
   */
  readonly runningSinceMs?: number | null;
  readonly prUrl?: string;
}

const EMPTY_PROGRESS: GitActionProgress = {
  phase: "idle",
  label: null,
  description: null,
};

/** "Running for 12s", or null for the first two seconds. */
export function formatGitActionElapsed(sinceMs: number, nowMs: number): string | null {
  const elapsed = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
  if (elapsed < 2) return null;
  return `Running for ${elapsed}s`;
}

export function useGitActionProgress(target: VcsActionTarget): GitActionProgress {
  const actionState = useVcsActionState(target);
  const { result } = useGitActionResultNotification();
  const running = actionState.isRunning;
  const label = actionState.currentLabel;
  const outputLine = actionState.lastOutputLine;
  const runningSinceMs = actionState.hookStartedAtMs ?? actionState.phaseStartedAtMs;

  return useMemo((): GitActionProgress => {
    if (running) {
      return {
        phase: "running",
        label,
        description: outputLine,
        runningSinceMs: outputLine === null ? runningSinceMs : null,
      };
    }
    if (result) {
      return {
        phase: result.type,
        label: result.title,
        description: result.description ?? null,
        prUrl: result.prUrl,
      };
    }
    return EMPTY_PROGRESS;
  }, [label, outputLine, result, running, runningSinceMs]);
}
