import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { THREAD_JUMP_KEYBINDING_COMMANDS } from "@t3tools/contracts";
import { useCallback, useEffect, useRef } from "react";

import type { ThreadListV2ListItem } from "../threads/threadListV2";
import {
  useHardwareKeyboardCommand,
  type HardwareKeyboardCommand,
} from "./hardwareKeyboardCommands";

type ThreadShortcutListItem = ThreadListV2ListItem | { readonly type: "v2-show-more" };

export function threadJumpIndex(command: HardwareKeyboardCommand) {
  return THREAD_JUMP_KEYBINDING_COMMANDS.findIndex((candidate) => candidate === command);
}

/** Uses the rendered list so filters and shelves keep their order. */
export function threadJumpTarget(
  items: ReadonlyArray<ThreadShortcutListItem>,
  command: HardwareKeyboardCommand,
) {
  let index = threadJumpIndex(command);
  if (index < 0) return null;
  for (const item of items) {
    const thread = item.type === "v2-thread" ? item.item.thread : null;
    if (thread !== null && index-- === 0) return thread;
  }
  return null;
}

export function useThreadJumpShortcuts(
  items: ReadonlyArray<ThreadShortcutListItem>,
  onSelectThread: (thread: EnvironmentThreadShell) => void,
) {
  // The handler reads the latest list through a ref, so list updates don't
  // re-register the nine jump commands.
  const latest = useRef({ items, onSelectThread });
  useEffect(() => {
    latest.current = { items, onSelectThread };
  }, [items, onSelectThread]);
  const jumpToThread = useCallback((command: HardwareKeyboardCommand) => {
    const thread = threadJumpTarget(latest.current.items, command);
    if (thread !== null) latest.current.onSelectThread(thread);
    return true;
  }, []);
  useHardwareKeyboardCommand(THREAD_JUMP_KEYBINDING_COMMANDS, jumpToThread);
}
