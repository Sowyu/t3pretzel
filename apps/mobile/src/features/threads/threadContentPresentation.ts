import { type EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";

export type ThreadContentPresentation =
  | { readonly kind: "ready" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "unavailable";
      readonly title: string;
      readonly detail: string;
    };

// Shared instances: ThreadFeed is memoized and receives this object as a prop,
// so a fresh { kind: "ready" } on every parent render re-rendered the whole
// feed each time the thread screen did, about ten times while a thread opens.
export const READY_THREAD_CONTENT: ThreadContentPresentation = Object.freeze({ kind: "ready" });
const LOADING_THREAD_CONTENT: ThreadContentPresentation = Object.freeze({ kind: "loading" });

export function projectThreadContentPresentation(input: {
  readonly hasDetail: boolean;
  readonly detailError: string | null;
  readonly detailDeleted: boolean;
  readonly connectionState: EnvironmentConnectionPhase;
}): ThreadContentPresentation {
  if (input.hasDetail) {
    return READY_THREAD_CONTENT;
  }
  if (input.detailDeleted) {
    return {
      kind: "unavailable",
      title: "Thread unavailable",
      detail: "This thread was deleted or is no longer available.",
    };
  }
  if (input.detailError !== null) {
    return {
      kind: "unavailable",
      title: "Could not load conversation",
      detail: input.detailError,
    };
  }
  if (
    input.connectionState === "connected" ||
    input.connectionState === "connecting" ||
    input.connectionState === "reconnecting"
  ) {
    // Messages will arrive once the (re)connection completes — present as
    // loading; the composer's connection pill reports the connection phase.
    return LOADING_THREAD_CONTENT;
  }
  return {
    kind: "unavailable",
    title: "Messages not cached",
    detail: "Reconnect this environment to load the conversation.",
  };
}
