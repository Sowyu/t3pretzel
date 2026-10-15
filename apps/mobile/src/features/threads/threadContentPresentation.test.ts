import { describe, expect, it } from "@effect/vitest";

import { projectThreadContentPresentation } from "./threadContentPresentation";

describe("thread content presentation", () => {
  it("renders cached detail while its environment reconnects", () => {
    expect(
      projectThreadContentPresentation({
        hasDetail: true,
        detailError: null,
        detailDeleted: false,
        connectionState: "reconnecting",
        connectionError: null,
      }),
    ).toEqual({ kind: "ready" });
  });

  it("loads missing detail inside the thread screen when connected", () => {
    expect(
      projectThreadContentPresentation({
        hasDetail: false,
        detailError: null,
        detailDeleted: false,
        connectionState: "connected",
        connectionError: null,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("explains uncached detail while disconnected instead of loading forever", () => {
    expect(
      projectThreadContentPresentation({
        hasDetail: false,
        detailError: null,
        detailDeleted: false,
        connectionState: "error",
        connectionError: null,
      }),
    ).toEqual({
      kind: "unavailable",
      title: "Messages not cached",
      detail: "Reconnect this environment to load the conversation.",
    });
  });

  it("stops loading uncached detail once a reconnect has failed", () => {
    expect(
      projectThreadContentPresentation({
        hasDetail: false,
        detailError: null,
        detailDeleted: false,
        connectionState: "reconnecting",
        connectionError: "Failed to connect",
      }),
    ).toMatchObject({ kind: "unavailable", title: "Messages not cached" });
    expect(
      projectThreadContentPresentation({
        hasDetail: false,
        detailError: null,
        detailDeleted: false,
        connectionState: "reconnecting",
        connectionError: null,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("surfaces detail errors before presenting a loading state", () => {
    expect(
      projectThreadContentPresentation({
        hasDetail: false,
        detailError: "The thread stream failed.",
        detailDeleted: false,
        connectionState: "connected",
        connectionError: null,
      }),
    ).toEqual({
      kind: "unavailable",
      title: "Could not load conversation",
      detail: "The thread stream failed.",
    });
  });

  // ThreadFeed is memoized on this prop; a new object per render re-rendered it.
  it("returns the same object while the presentation stays the same", () => {
    const input = {
      hasDetail: true,
      detailError: null,
      detailDeleted: false,
      connectionState: "connected",
      connectionError: null,
    } as const;
    expect(projectThreadContentPresentation(input)).toBe(projectThreadContentPresentation(input));
    const loading = { ...input, hasDetail: false };
    expect(projectThreadContentPresentation(loading)).toBe(
      projectThreadContentPresentation(loading),
    );
  });
});
