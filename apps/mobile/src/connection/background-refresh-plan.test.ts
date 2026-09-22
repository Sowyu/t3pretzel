import {
  BearerConnectionTarget,
  RelayConnectionTarget,
  SshConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import {
  type BackgroundRefreshRecord,
  backgroundRefreshReason,
  backgroundRefreshRowSubtitle,
  backgroundRefreshSummaryLabel,
  backgroundRefreshTargets,
  describeBackgroundRefreshFailure,
  isRetryableBackgroundRefreshFailure,
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

const refreshed = { label: "Cloud desktop", outcome: "refreshed" } as const;
const unreachable = { label: "Cloud desktop", outcome: "failed", reason: "HTTP 401" } as const;
const unauthorized = {
  label: "Cloud desktop",
  outcome: "skipped",
  reason: "no T3 Connect session",
} as const;

describe("summarizeBackgroundRefresh", () => {
  it("counts each outcome, the elapsed time, and keeps the detail", () => {
    const record = summarizeBackgroundRefresh({
      environments: [refreshed, unreachable, unauthorized, refreshed],
      startedAtMs: 1_000,
      finishedAtMs: 4_500,
      trigger: "worker",
    });
    expect(record).toMatchObject({
      finishedAtMs: 4_500,
      durationMs: 3_500,
      refreshed: 2,
      skipped: 1,
      failed: 1,
      trigger: "worker",
      workerRanAtMs: 4_500,
    });
    expect(record.environments).toHaveLength(4);
    expect(record.error).toBeUndefined();
  });

  it("never reports a negative duration when the clock moves back", () => {
    const record = summarizeBackgroundRefresh({
      environments: [],
      startedAtMs: 5_000,
      finishedAtMs: 1_000,
      trigger: "worker",
    });
    expect(record.durationMs).toBe(0);
  });

  it("carries the last worker run across a foreground run", () => {
    const record = summarizeBackgroundRefresh({
      environments: [refreshed],
      startedAtMs: 10_000,
      finishedAtMs: 11_000,
      trigger: "foreground",
      previousWorkerRanAtMs: 900,
    });
    expect(record.workerRanAtMs).toBe(900);
  });

  it("reports no worker run when one has never happened", () => {
    const record = summarizeBackgroundRefresh({
      environments: [],
      startedAtMs: 0,
      finishedAtMs: 1,
      trigger: "foreground",
      error: "no T3 Connect session",
    });
    expect(record.workerRanAtMs).toBeNull();
    expect(record.error).toBe("no T3 Connect session");
  });
});

const base: BackgroundRefreshRecord = {
  finishedAtMs: 0,
  durationMs: 0,
  refreshed: 0,
  skipped: 0,
  failed: 0,
  trigger: "worker",
  workerRanAtMs: 0,
  environments: [],
};

describe("backgroundRefreshSummaryLabel", () => {
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

  it("says the run failed when nothing was even attempted", () => {
    expect(backgroundRefreshSummaryLabel({ ...base, error: "ran out of time" })).toBe("Failed");
  });

  it("still leads with the successes when only part of the run fell over", () => {
    expect(backgroundRefreshSummaryLabel({ ...base, refreshed: 1, error: "ran out of time" })).toBe(
      "1 updated",
    );
  });
});

describe("backgroundRefreshReason", () => {
  it("prefers the run-level error", () => {
    expect(
      backgroundRefreshReason({
        ...base,
        failed: 1,
        environments: [unreachable],
        error: "ran out of time",
      }),
    ).toBe("ran out of time");
  });

  it("falls back to the first failure, then the first skip", () => {
    expect(
      backgroundRefreshReason({
        ...base,
        skipped: 1,
        failed: 1,
        environments: [unauthorized, unreachable],
      }),
    ).toBe("HTTP 401");
    expect(backgroundRefreshReason({ ...base, skipped: 1, environments: [unauthorized] })).toBe(
      "no T3 Connect session",
    );
  });

  it("stays quiet when everything worked", () => {
    expect(
      backgroundRefreshReason({ ...base, refreshed: 1, environments: [refreshed] }),
    ).toBeNull();
  });
});

describe("backgroundRefreshRowSubtitle", () => {
  const subtitle = (record: BackgroundRefreshRecord | null, overrides = {}) =>
    backgroundRefreshRowSubtitle({
      enabled: true,
      status: "available",
      record,
      relativeLabel: "12m",
      ...overrides,
    });

  it("says off before anything else", () => {
    expect(subtitle(base, { enabled: false, status: "restricted" })).toBe("Off");
  });

  it("names a system restriction over the last run", () => {
    expect(subtitle(base, { status: "restricted" })).toBe("Restricted by the system");
  });

  it("waits for the first run", () => {
    expect(subtitle(null)).toBe("Waiting for the first run");
  });

  it("appends the age of a clean run", () => {
    expect(
      subtitle({
        ...base,
        durationMs: 2_430,
        refreshed: 2,
        environments: [refreshed, refreshed],
      }),
    ).toBe("2 updated in 2.4 s · 12m ago");
  });

  it("appends why the run failed", () => {
    expect(subtitle({ ...base, durationMs: 340, error: "no T3 Connect session" })).toBe(
      "Failed in 340 ms · 12m ago · no T3 Connect session",
    );
  });
});

describe("describeBackgroundRefreshFailure", () => {
  it("names the HTTP status", () => {
    expect(
      describeBackgroundRefreshFailure({
        _tag: "RemoteEnvironmentAuthUndeclaredStatusError",
        status: 401,
        message: "Remote environment endpoint … returned undeclared status 401.",
      }),
    ).toBe("HTTP 401");
  });

  it("translates the transport failures", () => {
    expect(describeBackgroundRefreshFailure({ _tag: "RemoteEnvironmentAuthTimeoutError" })).toBe(
      "timed out",
    );
    expect(describeBackgroundRefreshFailure({ _tag: "RemoteEnvironmentAuthFetchError" })).toBe(
      "network error",
    );
    expect(describeBackgroundRefreshFailure({ _tag: "EnvironmentAuthInvalidError" })).toBe(
      "sign-in rejected",
    );
  });

  it("names an unreachable server instead of echoing its reason code", () => {
    expect(
      describeBackgroundRefreshFailure({
        _tag: "ConnectionTransientError",
        reason: "endpoint-unavailable",
      }),
    ).toBe("server unreachable");
  });

  it("turns a connection reason into a phrase", () => {
    expect(
      describeBackgroundRefreshFailure({
        _tag: "ConnectionBlockedError",
        reason: "authentication",
        detail: "Sign in to T3 Connect to connect this environment.",
      }),
    ).toBe("sign-in needed");
    expect(
      describeBackgroundRefreshFailure({ _tag: "ConnectionTransientError", reason: "network" }),
    ).toBe("network error");
  });

  it("falls back to a shortened message", () => {
    expect(describeBackgroundRefreshFailure(new Error("Something\n  broke"))).toBe(
      "Something broke",
    );
    expect(describeBackgroundRefreshFailure(new Error("x".repeat(60)))).toBe(
      `${"x".repeat(47)}\u2026`,
    );
    expect(describeBackgroundRefreshFailure(undefined)).toBe("unknown error");
  });
});

describe("isRetryableBackgroundRefreshFailure", () => {
  it("retries a relay that could not reach the host", () => {
    expect(
      isRetryableBackgroundRefreshFailure({
        _tag: "ConnectionTransientError",
        reason: "endpoint-unavailable",
      }),
    ).toBe(true);
  });

  it("retries timeouts and server errors", () => {
    expect(isRetryableBackgroundRefreshFailure({ _tag: "RemoteEnvironmentAuthTimeoutError" })).toBe(
      true,
    );
    expect(
      isRetryableBackgroundRefreshFailure({
        _tag: "RemoteEnvironmentAuthUndeclaredStatusError",
        status: 502,
      }),
    ).toBe(true);
  });

  it("does not retry what will fail the same way again", () => {
    expect(
      isRetryableBackgroundRefreshFailure({
        _tag: "ConnectionBlockedError",
        reason: "authentication",
      }),
    ).toBe(false);
    expect(
      isRetryableBackgroundRefreshFailure({
        _tag: "RemoteEnvironmentAuthUndeclaredStatusError",
        status: 401,
      }),
    ).toBe(false);
    expect(
      isRetryableBackgroundRefreshFailure({
        _tag: "RemoteEnvironmentAuthFetchError",
        cause: { _tag: "ConnectionBlockedError" },
      }),
    ).toBe(false);
  });
});
