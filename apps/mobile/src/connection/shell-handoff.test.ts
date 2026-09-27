import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, type OrchestrationShellSnapshot } from "@t3tools/contracts";

import { offerShell, takeShell, trackShellFetch } from "./shell-handoff";

const snapshot = { snapshotSequence: 7 } as unknown as OrchestrationShellSnapshot;

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

  it("ignores a snapshot older than a worker interval", async () => {
    const environmentId = EnvironmentId.make("env-b");
    offerShell(environmentId, snapshot);
    expect(await takeShell(environmentId, () => Date.now() + 21 * 60_000)).toBeNull();
  });
});
