import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, type OrchestrationV2ShellSnapshot } from "@t3tools/contracts";

import { offerShell, takeShell, trackShellFetch } from "./shell-handoff";

const snapshot = { snapshotSequence: 7 } as unknown as OrchestrationV2ShellSnapshot;

describe("shell handoff", () => {
  it("waits for a fetch in flight, then hands its snapshot over once", async () => {
    const environmentId = EnvironmentId.make("env-a");
    let finish = () => {};
    void trackShellFetch(environmentId, new Promise<void>((resolve) => (finish = resolve)));
    const taken = takeShell(environmentId);
    offerShell(environmentId, snapshot);
    finish();
    expect(await taken).toBe(snapshot);
    expect(await takeShell(environmentId)).toBeNull();
  });

  it("drops a snapshot nobody waited on once it is more than seconds old", async () => {
    const environmentId = EnvironmentId.make("env-b");
    offerShell(environmentId, snapshot, Date.now() - 31_000);
    expect(await takeShell(environmentId)).toBeNull();
  });

  it("still hands over a snapshot offered seconds ago", async () => {
    const environmentId = EnvironmentId.make("env-c");
    offerShell(environmentId, snapshot, Date.now() - 5_000);
    expect(await takeShell(environmentId)).toBe(snapshot);
  });

  it("does not hand a stale snapshot to a reconnect whose own wait came back empty", async () => {
    const environmentId = EnvironmentId.make("env-d");
    // Offered by a resume refresh, then the resume resubscribed and never took it.
    offerShell(environmentId, snapshot, Date.now() - 10 * 60_000);
    let finish = () => {};
    void trackShellFetch(environmentId, new Promise<void>((resolve) => (finish = resolve)));
    const taken = takeShell(environmentId);
    finish();
    expect(await taken).toBeNull();
  });

  it("stops waiting on a slow background fetch so the live list is not held up", async () => {
    const environmentId = EnvironmentId.make("env-e");
    void trackShellFetch(environmentId, new Promise<void>(() => {}));
    expect(await takeShell(environmentId, Date.now, 10)).toBeNull();
  });
});
