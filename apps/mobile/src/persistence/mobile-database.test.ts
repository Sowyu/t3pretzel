import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

const openDatabaseAsync = vi.hoisted(() => vi.fn());

vi.mock("expo-sqlite", () => ({ openDatabaseAsync }));

import * as MobileDatabase from "./mobile-database";

describe("mobile database legacy cache migration", () => {
  it.effect("keeps acquisition failures typed on database operations", () =>
    Effect.scoped(
      Effect.gen(function* () {
        openDatabaseAsync.mockRejectedValueOnce(new Error("SQLite unavailable"));

        const database = yield* MobileDatabase.make;
        const result = yield* Effect.result(database.loadPreferencesJson);

        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "MobileDatabaseError", operation: "open" },
        });
      }),
    ),
  );

  it("maps legacy thread records to their SQLite identity", () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      environmentId: "environment-1",
      threadId: "thread-1",
      snapshot: {},
    });

    expect(MobileDatabase.decodeLegacyCacheRecord("connection-thread-snapshots", payload)).toEqual({
      environmentId: "environment-1",
      kind: "thread",
      cacheKey: "thread-1",
      schemaVersion: 2,
      payload,
    });
  });

  it("preserves the old shell payload for schema decoding after migration", () => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      environmentId: "environment-1",
      snapshotReceivedAt: "2026-07-01T00:00:00.000Z",
      snapshot: {},
    });

    expect(MobileDatabase.decodeLegacyCacheRecord("shell-snapshots", payload)).toEqual({
      environmentId: "environment-1",
      kind: "shell",
      cacheKey: "snapshot",
      schemaVersion: 1,
      payload,
    });
  });

  it("skips malformed legacy records", () => {
    expect(MobileDatabase.decodeLegacyCacheRecord("connection-vcs-refs", "{not-json")).toBeNull();
    expect(
      MobileDatabase.decodeLegacyCacheRecord(
        "connection-vcs-refs",
        JSON.stringify({ schemaVersion: 1, environmentId: "environment-1" }),
      ),
    ).toBeNull();
  });
});

// Exercise the production SQL against SQLite, including the eviction window functions.
describe("offline pull request cache", () => {
  const environmentId = "cached-environment" as import("@t3tools/contracts").EnvironmentId;
  const otherEnvironment = "other-environment" as import("@t3tools/contracts").EnvironmentId;

  async function sqliteDatabase() {
    const { DatabaseSync } = await import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA user_version = 1");
    const database = {
      execAsync: async (sql: string) => {
        sqlite.exec(sql);
      },
      runAsync: async (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).run(...args),
      getFirstAsync: async (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).get(...args),
      getAllAsync: async (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).all(...args),
      getFirstSync: (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).get(...args) ?? null,
      getAllSync: (sql: string, ...args: Array<string | number>) =>
        sqlite.prepare(sql).all(...args),
      withExclusiveTransactionAsync: async (run: (transaction: unknown) => Promise<void>) => {
        await run(database);
      },
      closeAsync: async () => {
        sqlite.close();
      },
    };
    openDatabaseAsync.mockResolvedValueOnce(database);
    return sqlite;
  }

  it.effect("restores saved records and clears them with the environment", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.promise(sqliteDatabase);
        const database = yield* MobileDatabase.make;
        yield* database.saveCache(environmentId, "pull-request", "v1:list", 1, '{"entries":[]}');
        yield* database.saveCache(otherEnvironment, "pull-request", "v1:list", 1, "other");
        expect(yield* database.loadCache(environmentId, "pull-request", "v1:list")).toEqual(
          Option.some('{"entries":[]}'),
        );
        yield* database.clearEnvironmentCache(environmentId);
        expect((yield* database.loadCache(environmentId, "pull-request", "v1:list"))._tag).toBe(
          "None",
        );
        expect((yield* database.loadCache(otherEnvironment, "pull-request", "v1:list"))._tag).toBe(
          "Some",
        );
      }),
    ),
  );

  it.effect("skips rewriting unchanged payloads except where updated_at drives expiry", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const sqlite = yield* Effect.promise(sqliteDatabase);
        const database = yield* MobileDatabase.make;
        const updatedAt = (kind: string) =>
          (
            sqlite.prepare("SELECT updated_at FROM client_cache WHERE kind = ?").get(kind) as {
              updated_at: number;
            }
          ).updated_at;
        yield* database.saveCache(environmentId, "shell", "snapshot", 1, "same");
        yield* database.saveCache(environmentId, "pull-request", "v1:list", 1, "same");
        sqlite.prepare("UPDATE client_cache SET updated_at = 1").run();

        yield* database.saveCache(environmentId, "shell", "snapshot", 1, "same");
        yield* database.saveCache(environmentId, "pull-request", "v1:list", 1, "same");
        expect(updatedAt("shell")).toBe(1);
        expect(updatedAt("pull-request")).toBeGreaterThan(1);

        yield* database.saveCache(environmentId, "shell", "snapshot", 1, "changed");
        expect(updatedAt("shell")).toBeGreaterThan(1);
        expect(yield* database.loadCache(environmentId, "shell", "snapshot")).toEqual(
          Option.some("changed"),
        );
      }),
    ),
  );

  it.effect(
    "expires old records and bounds count and payload size without evicting other cache kinds",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const sqlite = yield* Effect.promise(sqliteDatabase);
          const database = yield* MobileDatabase.make;
          yield* database.saveCache(environmentId, "thread", "thread", 1, "thread");
          yield* database.saveCache(environmentId, "pull-request", "old", 1, "old");
          sqlite.prepare("UPDATE client_cache SET updated_at = 0 WHERE cache_key = 'old'").run();
          expect((yield* database.loadCache(environmentId, "pull-request", "old"))._tag).toBe(
            "None",
          );
          for (let i = 0; i < 260; i++)
            yield* database.saveCache(environmentId, "pull-request", `page-${i}`, 1, "page");
          expect((yield* database.listCache("pull-request")).length).toBe(256);
          const large = "x".repeat(4 * 1024 * 1024);
          for (let i = 0; i < 10; i++)
            yield* database.saveCache(environmentId, "pull-request", `diff-${i}`, 1, large);
          const summary = yield* database.inspectCaches;
          const prs = summary.find((row) => row.kind === "pull-request");
          expect(prs?.payloadBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
          expect(prs?.recordCount).toBeLessThanOrEqual(256);
          expect((yield* database.loadCache(environmentId, "thread", "thread"))._tag).toBe("Some");
          yield* database.saveCache(environmentId, "pull-request", "oversized", 1, large + "x");
          expect((yield* database.loadCache(environmentId, "pull-request", "oversized"))._tag).toBe(
            "None",
          );
        }),
      ),
  );
});

describe("synchronous reads", () => {
  const environmentId = "sync-environment" as import("@t3tools/contracts").EnvironmentId;

  // A read waits on no async round trip: the async API never answers here.
  it.effect("reads cache rows and preferences without the async API", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { DatabaseSync } = yield* Effect.promise(() => import("node:sqlite"));
        const sqlite = new DatabaseSync(":memory:");
        sqlite.exec("PRAGMA user_version = 1");
        const never = () => new Promise<never>(() => {});
        const database = {
          execAsync: async (sql: string) => {
            sqlite.exec(sql);
          },
          runAsync: async (sql: string, ...args: Array<string | number>) =>
            sqlite.prepare(sql).run(...args),
          getFirstAsync: never,
          getAllAsync: never,
          getFirstSync: (sql: string, ...args: Array<string | number>) =>
            sqlite.prepare(sql).get(...args) ?? null,
          getAllSync: (sql: string, ...args: Array<string | number>) =>
            sqlite.prepare(sql).all(...args),
          withExclusiveTransactionAsync: async (run: (transaction: unknown) => Promise<void>) => {
            await run(database);
          },
          closeAsync: async () => {
            sqlite.close();
          },
        };
        // Migration reads user_version through the async API before the service exists.
        database.getFirstAsync = (async (sql: string) =>
          sqlite.prepare(sql).get()) as unknown as typeof never;
        openDatabaseAsync.mockResolvedValueOnce(database);
        const service = yield* MobileDatabase.makeWith({ synchronousReads: true });
        database.getFirstAsync = never;

        yield* service.saveCache(environmentId, "thread", "thread-1", 1, "payload");
        expect(yield* service.loadCache(environmentId, "thread", "thread-1")).toEqual(
          Option.some("payload"),
        );
        expect((yield* service.loadCache(environmentId, "thread", "missing"))._tag).toBe("None");
        expect(yield* service.listCache("thread")).toEqual(["payload"]);
        expect((yield* service.loadPreferencesJson)._tag).toBe("None");
      }),
    ),
  );
});
