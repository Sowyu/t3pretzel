import {
  BearerConnectionTarget,
  RelayConnectionTarget,
  SshConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import {
  backgroundRefreshSummaryLabel,
  backgroundRefreshTargets,
  shouldRegisterBackgroundRefresh,
  summarizeBackgroundRefresh,
} from "./background-refresh-plan";

const bearer = new BearerConnectionTarget({
  environmentId: EnvironmentId.make("paired"),
  label: "Paired laptop",
  connectionId: "connection-1",
});
const relay = new RelayConnectionTarget({
  environmentId: EnvironmentId.make("cloud"),
  label: "Cloud desktop",
});
const ssh = new SshConnectionTarget({
  environmentId: EnvironmentId.make("ssh"),
  label: "Remote box",
  connectionId: "connection-2",
});

describe("backgroundRefreshTargets", () => {
  it("keeps the targets a headless run can authenticate", () => {
    expect(backgroundRefreshTargets([bearer, relay, ssh], [])).toEqual([bearer, relay]);
  });

  it("drops environments the user switched off", () => {
    expect(backgroundRefreshTargets([bearer, relay], [relay.environmentId])).toEqual([bearer]);
  });

  it("returns nothing when only unsupported targets are saved", () => {
    expect(backgroundRefreshTargets([ssh], [])).toEqual([]);
  });
});

describe("shouldRegisterBackgroundRefresh", () => {
  it("registers when the user opted in and something can be refreshed", () => {
    expect(shouldRegisterBackgroundRefresh({ enabled: true, refreshableEnvironmentCount: 1 })).toBe(
      true,
    );
  });

  it("does not burn a wakeup with nothing to refresh", () => {
    expect(shouldRegisterBackgroundRefresh({ enabled: true, refreshableEnvironmentCount: 0 })).toBe(
      false,
    );
  });

  it("stays off when the user turned it off", () => {
    expect(
      shouldRegisterBackgroundRefresh({ enabled: false, refreshableEnvironmentCount: 3 }),
    ).toBe(false);
  });
});

describe("summarizeBackgroundRefresh", () => {
  it("counts each outcome and the elapsed time", () => {
    expect(
      summarizeBackgroundRefresh({
        outcomes: ["refreshed", "failed", "skipped", "refreshed"],
        startedAtMs: 1_000,
        finishedAtMs: 4_500,
      }),
    ).toEqual({
      finishedAtMs: 4_500,
      durationMs: 3_500,
      refreshed: 2,
      skipped: 1,
      failed: 1,
    });
  });

  it("never reports a negative duration when the clock moves back", () => {
    const record = summarizeBackgroundRefresh({
      outcomes: [],
      startedAtMs: 5_000,
      finishedAtMs: 1_000,
    });
    expect(record.durationMs).toBe(0);
  });
});

describe("backgroundRefreshSummaryLabel", () => {
  const base = { finishedAtMs: 0, durationMs: 0, refreshed: 0, skipped: 0, failed: 0 };

  it("leads with what was updated", () => {
    expect(backgroundRefreshSummaryLabel({ ...base, refreshed: 2 })).toBe("2 updated");
  });

  it("mentions unreachable environments alongside a partial success", () => {
    expect(backgroundRefreshSummaryLabel({ ...base, refreshed: 1, failed: 2 })).toBe(
      "1 updated, 2 unreachable",
    );
  });

  it("reports a total failure", () => {
    expect(backgroundRefreshSummaryLabel({ ...base, failed: 1 })).toBe("1 unreachable");
  });

  it("separates skipped environments from an empty catalog", () => {
    expect(backgroundRefreshSummaryLabel({ ...base, skipped: 1 })).toBe("Nothing to refresh");
    expect(backgroundRefreshSummaryLabel(base)).toBe("No environments");
  });
});
