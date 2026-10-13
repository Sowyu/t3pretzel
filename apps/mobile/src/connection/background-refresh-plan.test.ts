import {
  BearerConnectionTarget,
  ConnectionBlockedError,
  RelayConnectionTarget,
  SshConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  type BackgroundRefreshNativeStatus,
  type BackgroundRefreshRecord,
  backgroundRefreshDeferral,
  backgroundRefreshEnvironments,
  backgroundRefreshRowSubtitle,
  describeBackgroundRefreshFailure,
  isNothingToTry,
  isRetryableBackgroundRefreshFailure,
  parseBackgroundRefreshRecord,
  summarizeBackgroundRefresh,
} from "./background-refresh-plan";

const laptop = EnvironmentId.make("laptop");
const lan = new BearerConnectionTarget({
  environmentId: laptop,
  label: "Laptop",
  connectionId: "learned:laptop:http://192.168.1.4@connection-1",
});
const relay = new RelayConnectionTarget({ environmentId: laptop, label: "Laptop" });
const paired = new BearerConnectionTarget({
  environmentId: EnvironmentId.make("paired"),
  label: "Paired box",
  connectionId: "connection-2",
});
const ssh = new SshConnectionTarget({
  environmentId: EnvironmentId.make("ssh"),
  label: "Remote box",
  connectionId: "connection-3",
});

describe("backgroundRefreshEnvironments", () => {
  it("fetches each environment once, trying its routes in the saved order", () => {
    expect(backgroundRefreshEnvironments([lan, paired, relay, ssh], [])).toEqual([
      { environmentId: laptop, label: "Laptop", routes: [lan, relay] },
      { environmentId: paired.environmentId, label: "Paired box", routes: [paired] },
    ]);
  });

  it("leaves out environments the user switched off and ones only SSH reaches", () => {
    expect(backgroundRefreshEnvironments([lan, relay, ssh], [laptop])).toEqual([]);
  });
});

const NOW = 10 * 60 * 60_000;
const MINUTE = 60_000;

function status(input: Partial<BackgroundRefreshNativeStatus> = {}): BackgroundRefreshNativeStatus {
  return {
    enabled: true,
    armedAtMs: NOW - 5 * MINUTE,
    workState: "ENQUEUED",
    lastStartedAtMs: null,
    lastFinishedAtMs: null,
    lastOutcome: null,
    record: null,
    ignoringBatteryOptimizations: false,
    backgroundRestricted: false,
    standbyBucket: 10,
    ...input,
  };
}

function record(input: Partial<BackgroundRefreshRecord> = {}): string {
  return JSON.stringify(
    summarizeBackgroundRefresh({
      environments: [{ environmentId: "laptop", label: "Laptop", outcome: "refreshed" }],
      startedAtMs: NOW - 12 * MINUTE - 2_000,
      finishedAtMs: NOW - 12 * MINUTE,
      notified: 0,
      ...input,
    }),
  );
}

describe("backgroundRefreshDeferral", () => {
  it("trusts an optimised app that Android still wakes on time", () => {
    expect(backgroundRefreshDeferral(status({ lastStartedAtMs: NOW - 20 * MINUTE }), NOW)).toBe(
      null,
    );
  });

  it("reports battery deferral once the worker is an hour overdue", () => {
    expect(backgroundRefreshDeferral(status({ lastStartedAtMs: NOW - 90 * MINUTE }), NOW)).toBe(
      "battery",
    );
    expect(backgroundRefreshDeferral(status({ armedAtMs: NOW - 2 * 60 * MINUTE }), NOW)).toBe(
      "battery",
    );
  });

  it("reports battery deferral straight away in the rare standby bucket", () => {
    expect(backgroundRefreshDeferral(status({ standbyBucket: 40 }), NOW)).toBe("battery");
  });

  it("never blames the battery once the app is unrestricted", () => {
    expect(
      backgroundRefreshDeferral(
        status({ ignoringBatteryOptimizations: true, armedAtMs: 0, standbyBucket: 45 }),
        NOW,
      ),
    ).toBe(null);
  });

  it("says when background usage is restricted outright", () => {
    expect(backgroundRefreshDeferral(status({ backgroundRestricted: true }), NOW)).toBe(
      "restricted",
    );
  });
});

describe("backgroundRefreshRowSubtitle", () => {
  const subtitle = (input: Partial<BackgroundRefreshNativeStatus> | null, enabled = true) =>
    backgroundRefreshRowSubtitle({
      enabled,
      status: input === null ? null : status(input),
      nowMs: NOW,
    });

  it("explains every reason it has not run", () => {
    expect(subtitle({}, false)).toBe("Off");
    expect(subtitle(null)).toBe("Not available in this build");
    expect(subtitle({ enabled: false })).toBe("Starts when you pair an environment");
    expect(subtitle({})).toBe("Waiting for Android to run it");
    expect(subtitle({ armedAtMs: NOW - 3 * 60 * MINUTE })).toBe(
      "Not run yet · Android is deferring it",
    );
    expect(subtitle({ backgroundRestricted: true })).toBe(
      "Blocked: background usage is restricted",
    );
  });

  it("shows what the last run did and when", () => {
    expect(subtitle({ lastStartedAtMs: NOW - 12 * MINUTE - 2_000, record: record() })).toBe(
      "1 updated · 12 min ago",
    );
  });

  it("names the reason an environment was not refreshed", () => {
    const failed = record({
      environments: [
        {
          environmentId: "laptop",
          label: "Laptop",
          outcome: "skipped",
          reason: "no T3 Connect session",
        },
      ],
    });
    expect(subtitle({ lastStartedAtMs: NOW - 12 * MINUTE - 2_000, record: failed })).toBe(
      "Nothing it could refresh · 12 min ago · no T3 Connect session",
    );
  });

  it("reports the worker's own outcome when JS never wrote a record", () => {
    expect(
      subtitle({
        lastStartedAtMs: NOW - 3 * MINUTE,
        lastOutcome: "timed out",
        record: record(),
      }),
    ).toBe("Woke 3 min ago · timed out");
  });

  it("adds the deferral to a stale result", () => {
    expect(
      subtitle({
        lastStartedAtMs: NOW - 2 * 60 * MINUTE,
        record: record({ finishedAtMs: NOW - 2 * 60 * MINUTE + 1_000 }),
      }),
    ).toBe("1 updated · 1 h ago · Android is deferring it");
  });
});

describe("parseBackgroundRefreshRecord", () => {
  it("round-trips a summary and rejects anything else", () => {
    const raw = record({ error: "ran out of time", notified: 2 });
    expect(parseBackgroundRefreshRecord(raw)).toEqual(JSON.parse(raw));
    expect(parseBackgroundRefreshRecord("{")).toBeNull();
    expect(parseBackgroundRefreshRecord(JSON.stringify({ finishedAtMs: 1 }))).toBeNull();
    expect(parseBackgroundRefreshRecord(null)).toBeNull();
  });
});

describe("failures", () => {
  it("retries what a second later might fix, and nothing else", () => {
    expect(isRetryableBackgroundRefreshFailure({ _tag: "RemoteEnvironmentAuthTimeoutError" })).toBe(
      true,
    );
    expect(
      isRetryableBackgroundRefreshFailure({
        _tag: "RemoteEnvironmentAuthUndeclaredStatusError",
        status: 503,
      }),
    ).toBe(true);
    expect(
      isRetryableBackgroundRefreshFailure({
        _tag: "RemoteEnvironmentAuthUndeclaredStatusError",
        status: 401,
      }),
    ).toBe(false);
    expect(
      isRetryableBackgroundRefreshFailure({ _tag: "BackgroundRefreshMissingSession", reason: "x" }),
    ).toBe(false);
  });

  it("counts a missing credential or session as skipped, not unreachable", () => {
    const blocked = new ConnectionBlockedError({ reason: "authentication", detail: "no token" });
    expect(isNothingToTry(blocked)).toBe(true);
    expect(isNothingToTry({ _tag: "BackgroundRefreshMissingSession", reason: "x" })).toBe(true);
    expect(isNothingToTry({ _tag: "RemoteEnvironmentAuthTimeoutError" })).toBe(false);
  });

  it("fits the cause under a settings row", () => {
    expect(
      describeBackgroundRefreshFailure({
        _tag: "BackgroundRefreshMissingSession",
        reason: "T3 Connect sign-in timed out",
      }),
    ).toBe("T3 Connect sign-in timed out");
    expect(
      describeBackgroundRefreshFailure(
        new ConnectionBlockedError({ reason: "authentication", detail: "a long detail" }),
      ),
    ).toBe("sign-in needed");
    expect(
      describeBackgroundRefreshFailure({
        _tag: "RemoteEnvironmentAuthUndeclaredStatusError",
        status: 502,
      }),
    ).toBe("HTTP 502");
  });
});
