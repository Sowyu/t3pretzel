import { describe, expect, it, vi } from "vite-plus/test";

import { connectionFloatingStatus, threadSyncFloatingLabel } from "./floating-working-status";

const status = (
  connectionState: Parameters<typeof connectionFloatingStatus>[0]["connectionState"],
  overrides: { connectionError?: string | null; environmentLabel?: string | null } = {},
) =>
  connectionFloatingStatus({
    connectionError: overrides.connectionError ?? null,
    connectionState,
    environmentLabel:
      overrides.environmentLabel === undefined ? "Mac mini" : overrides.environmentLabel,
    onReconnect: () => {},
  });

describe("connectionFloatingStatus", () => {
  it("yields the pill to sync and working state once connected", () => {
    expect(status("connected")).toBeNull();
  });

  it("names the environment it is retrying, and goes quiet after a failure", () => {
    expect(status("connecting")).toMatchObject({
      tone: "reconnecting",
      label: "Connecting to Mac mini...",
    });
    expect(status("reconnecting")).toMatchObject({
      tone: "reconnecting",
      label: "Reconnecting to Mac mini...",
    });
    expect(status("reconnecting", { connectionError: "ECONNREFUSED" })).toBeNull();
  });

  it("reports why the environment is unreachable", () => {
    expect(status("offline")).toMatchObject({
      tone: "unavailable",
      label: "You are offline",
    });
    expect(status("available")).toMatchObject({
      tone: "unavailable",
      label: "Mac mini is not connected",
    });
    expect(status("error", { connectionError: "handshake timed out" })).toMatchObject({
      label: "Failed to connect to Mac mini: handshake timed out",
    });
    expect(status("error")).toMatchObject({ label: "Failed to connect to Mac mini" });
  });

  it("falls back to a generic name when the environment has no label", () => {
    expect(status("error", { environmentLabel: null })).toMatchObject({
      label: "Failed to connect to Environment",
    });
  });

  it("carries the reconnect handler so the pill can trigger it", () => {
    const onReconnect = vi.fn();
    const pill = connectionFloatingStatus({
      connectionError: null,
      connectionState: "offline",
      environmentLabel: "Mac mini",
      onReconnect,
    });
    if (pill?.kind !== "connection") throw new Error("expected a connection pill");
    pill.onPress();
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});

describe("threadSyncFloatingLabel", () => {
  it("labels a sync by whether messages are already on screen", () => {
    const label = (contentKind: "ready" | "loading" | "unavailable") =>
      threadSyncFloatingLabel({
        syncStatus: "synchronizing",
        contentKind,
        connectionState: "connected",
      });
    expect(label("ready")).toBe("Syncing messages...");
    expect(label("loading")).toBe("Loading messages...");
    expect(label("unavailable")).toBeNull();
  });

  it("does not spin while the environment cannot be reached", () => {
    for (const connectionState of ["reconnecting", "connecting", "error", "offline"] as const) {
      expect(
        threadSyncFloatingLabel({
          syncStatus: "synchronizing",
          contentKind: "ready",
          connectionState,
        }),
      ).toBeNull();
    }
  });
});
