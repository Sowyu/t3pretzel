import type { QueuedThreadRun } from "@t3tools/client-runtime/state/thread-workflows";
import * as DateTime from "effect/DateTime";

import type { ThreadFeedEntry } from "../../lib/threadActivity";
import type { QueuedThreadMessage } from "../../state/thread-outbox-model";

export type PendingThreadFeedEntry = ThreadFeedEntry & {
  readonly pendingMessage?: QueuedThreadMessage;
  readonly acknowledged?: boolean;
  /** A message the server holds behind the running turn. */
  readonly queuedRun?: QueuedThreadRun;
};

/**
 * Append what has not started yet after all presented activity: first the
 * server's queued runs in queue order, then the local outbox, until each
 * message shows up in the feed.
 */
export function appendPendingThreadMessages(
  presentedFeed: ReadonlyArray<ThreadFeedEntry>,
  feed: ReadonlyArray<ThreadFeedEntry>,
  queuedMessages: ReadonlyArray<QueuedThreadMessage>,
  queuedRuns: ReadonlyArray<QueuedThreadRun> = [],
): ReadonlyArray<PendingThreadFeedEntry> {
  if (queuedMessages.length === 0 && queuedRuns.length === 0) return presentedFeed;
  const deliveredIds = new Set(
    feed.flatMap((entry) => (entry.type === "message" ? [entry.message.id] : [])),
  );
  const outboxIds = new Set(queuedMessages.map((message) => message.messageId));
  return [
    ...presentedFeed,
    ...queuedRuns
      .filter((queued) => !deliveredIds.has(queued.messageId) && !outboxIds.has(queued.messageId))
      .map((queuedRun): PendingThreadFeedEntry => {
        const createdAt = DateTime.formatIso(queuedRun.run.requestedAt);
        return {
          type: "message",
          id: queuedRun.messageId,
          createdAt,
          queuedRun,
          message: {
            id: queuedRun.messageId,
            role: "user",
            text: queuedRun.text,
            attachments: queuedRun.attachments,
            context: queuedRun.context,
            createdAt,
            updatedAt: createdAt,
            runId: queuedRun.run.id,
            streaming: false,
            visibility: "local",
            sourceThreadId: queuedRun.run.threadId,
          },
        };
      }),
    ...queuedMessages
      .filter((message) => !deliveredIds.has(message.messageId))
      .map((pendingMessage): PendingThreadFeedEntry => ({
        type: "message",
        id: pendingMessage.messageId,
        createdAt: pendingMessage.createdAt,
        pendingMessage,
        message: {
          id: pendingMessage.messageId,
          role: "user",
          text: pendingMessage.text,
          attachments: [],
          context: pendingMessage.context,
          createdAt: pendingMessage.createdAt,
          updatedAt: pendingMessage.createdAt,
          runId: null,
          streaming: false,
          visibility: "local",
          sourceThreadId: pendingMessage.threadId,
        },
      })),
  ];
}
