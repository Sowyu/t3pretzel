import { useState } from "react";

export interface TerminalSurfaceBufferWindow {
  readonly buffer: string;
  readonly bufferStartOffset: number;
  readonly bufferResetKey: string;
}

const EMPTY_WINDOW: TerminalSurfaceBufferWindow = {
  buffer: "",
  bufferStartOffset: 0,
  bufferResetKey: "",
};

/**
 * A null buffer means the attachment is waiting for its first snapshot. The offsets
 * are held with the buffer so the native view keeps appending to the same window.
 */
export function useTerminalSurfaceBuffer({
  terminalKey,
  buffer,
  bufferStartOffset,
  bufferResetKey,
}: Omit<TerminalSurfaceBufferWindow, "buffer"> & {
  readonly terminalKey: string;
  readonly buffer: string | null;
}): TerminalSurfaceBufferWindow {
  const [snapshot, setSnapshot] = useState({
    terminalKey,
    window: buffer === null ? EMPTY_WINDOW : { buffer, bufferStartOffset, bufferResetKey },
  });
  const current =
    buffer !== null
      ? { buffer, bufferStartOffset, bufferResetKey }
      : snapshot.terminalKey === terminalKey
        ? snapshot.window
        : EMPTY_WINDOW;
  if (
    snapshot.terminalKey !== terminalKey ||
    snapshot.window.buffer !== current.buffer ||
    snapshot.window.bufferStartOffset !== current.bufferStartOffset ||
    snapshot.window.bufferResetKey !== current.bufferResetKey
  ) {
    setSnapshot({ terminalKey, window: current });
  }
  return current;
}
