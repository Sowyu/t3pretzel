import { terminalDebugLog } from "./terminalDebugLog";

export const TERMINAL_BUFFER_REPLAY_STABILITY_DELAY_MS = 180;

export function getTerminalBufferReplayKey(input: {
  readonly terminalKey: string;
  readonly fontSize: number;
}): string {
  return `${input.terminalKey}:${input.fontSize}`;
}

export interface TerminalSurfaceReplayWindow {
  readonly buffer: string;
  readonly startOffset: number;
  readonly resetKey: string;
}

export function getTerminalSurfaceReplayWindow(
  input: TerminalSurfaceReplayWindow & {
    readonly replayKey: string;
    readonly readyReplayKey: string | null;
  },
): TerminalSurfaceReplayWindow {
  // Pass live buffer whenever ready key is unset or matches. Hide it only when ready key is
  // stale vs current replay key (e.g. mid font-size transition). The stale reset key makes
  // the native view rebuild and replay once the buffer comes back, instead of appending.
  if (input.readyReplayKey !== null && input.readyReplayKey !== input.replayKey) {
    terminalDebugLog("replay:stale-key-hiding-buffer", {
      replayKey: input.replayKey,
      readyReplayKey: input.readyReplayKey,
      bufferLen: input.buffer.length,
    });
    return { buffer: "", startOffset: 0, resetKey: `stale:${input.replayKey}` };
  }

  return { buffer: input.buffer, startOffset: input.startOffset, resetKey: input.resetKey };
}
