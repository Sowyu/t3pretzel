import type { EnvironmentId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { SQLiteBindValue, SQLiteDatabase } from "expo-sqlite";

const DATABASE_NAME = "t3code-client.db";
const DATABASE_SCHEMA_VERSION = 1;
const WAL_SIZE_LIMIT_BYTES = 32 * 1024 * 1024;
const LEGACY_CACHE_DIRECTORIES = [
  "connection-shell-snapshots",
  "shell-snapshots",
  "connection-thread-snapshots",
  "connection-server-configs",
  "connection-vcs-refs",
] as const;

export const ClientCacheKind = Schema.Literals([
  "shell",
  "thread",
  "server-config",
  "vcs-refs",
  "project-favicon",
  "pull-request",
]);
export type ClientCacheKind = typeof ClientCacheKind.Type;

export interface ClientCacheSummaryRow {
  readonly environmentId: EnvironmentId;
  readonly kind: ClientCacheKind;
  readonly recordCount: number;
  readonly payloadBytes: number;
}

export interface StoredPreferencesJson {
  readonly payload: string;
  readonly updatedAt: number;
}

const ClientCacheSummaryRows = Schema.Array(
  Schema.Struct({
    environmentId: Schema.String,
    kind: ClientCacheKind,
    recordCount: Schema.Number,
    payloadBytes: Schema.Number,
  }),
);

const MobileDatabaseOperation = Schema.Literals([
  "open",
  "migrate",
  "load-cache",
  "list-cache",
  "save-cache",
  "remove-cache",
  "clear-cache-kind",
  "clear-environment-cache",
  "clear-all-caches",
  "inspect-caches",
  "load-preferences",
  "save-preferences",
]);

export class MobileDatabaseError extends Schema.TaggedError<MobileDatabaseError>()(
  "MobileDatabaseError",
  {
    operation: MobileDatabaseOperation,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Mobile database operation failed: ${this.operation}.`;
  }
}

function databaseError(operation: typeof MobileDatabaseOperation.Type) {
  return (cause: unknown) => new MobileDatabaseError({ operation, cause });
}

export interface MobileDatabaseOptions {
  /**
   * Run reads synchronously on the JS thread. An async expo-sqlite query is four
   * native round trips (prepare, execute, read, finalize), and each one waits
   * for its turn on the JS thread. While environments sync that queue is long,
   * so one cache read can take seconds. A synchronous read of one indexed row
   * costs milliseconds. SQLite serializes it against async writes on the same
   * connection.
   */
  readonly synchronousReads: boolean;
}

function readFirst<T>(
  database: SQLiteDatabase,
  options: MobileDatabaseOptions,
  operation: typeof MobileDatabaseOperation.Type,
  source: string,
  ...params: ReadonlyArray<SQLiteBindValue>
): Effect.Effect<T | null, MobileDatabaseError> {
  return options.synchronousReads
    ? Effect.try({
        try: () => database.getFirstSync<T>(source, ...params),
        catch: databaseError(operation),
      })
    : Effect.tryPromise({
        try: () => database.getFirstAsync<T>(source, ...params),
        catch: databaseError(operation),
      });
}

function readAll<T>(
  database: SQLiteDatabase,
  options: MobileDatabaseOptions,
  operation: typeof MobileDatabaseOperation.Type,
  source: string,
  ...params: ReadonlyArray<SQLiteBindValue>
): Effect.Effect<Array<T>, MobileDatabaseError> {
  return options.synchronousReads
    ? Effect.try({
        try: () => database.getAllSync<T>(source, ...params),
        catch: databaseError(operation),
      })
    : Effect.tryPromise({
        try: () => database.getAllAsync<T>(source, ...params),
        catch: databaseError(operation),
      });
}

interface LegacyCacheRecord {
  readonly environmentId: string;
  readonly kind: ClientCacheKind;
  readonly cacheKey: string;
  readonly schemaVersion: number;
  readonly payload: string;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function decodeLegacyCacheRecord(
  directoryName: (typeof LEGACY_CACHE_DIRECTORIES)[number],
  payload: string,
): LegacyCacheRecord | null {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = objectRecord(JSON.parse(payload));
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed.environmentId !== "string" ||
    typeof parsed.schemaVersion !== "number"
  ) {
    return null;
  }

  switch (directoryName) {
    case "connection-shell-snapshots":
    case "shell-snapshots":
      return {
        environmentId: parsed.environmentId,
        kind: "shell",
        cacheKey: "snapshot",
        schemaVersion: parsed.schemaVersion,
        payload,
      };
    case "connection-thread-snapshots":
      return typeof parsed.threadId === "string"
        ? {
            environmentId: parsed.environmentId,
            kind: "thread",
            cacheKey: parsed.threadId,
            schemaVersion: parsed.schemaVersion,
            payload,
          }
        : null;
    case "connection-server-configs":
      return {
        environmentId: parsed.environmentId,
        kind: "server-config",
        cacheKey: "config",
        schemaVersion: parsed.schemaVersion,
        payload,
      };
    case "connection-vcs-refs":
      return typeof parsed.cwd === "string"
        ? {
            environmentId: parsed.environmentId,
            kind: "vcs-refs",
            cacheKey: parsed.cwd,
            schemaVersion: parsed.schemaVersion,
            payload,
          }
        : null;
  }
}

async function migrateLegacyFileCaches(database: SQLiteDatabase): Promise<boolean> {
  try {
    const { Directory, File, Paths } = await import("expo-file-system");
    let complete = true;
    const listFiles = (
      directory: InstanceType<typeof Directory>,
    ): Array<InstanceType<typeof File>> =>
      directory.list().flatMap((entry) => (entry instanceof File ? [entry] : listFiles(entry)));

    for (const directoryName of LEGACY_CACHE_DIRECTORIES) {
      try {
        const directory = new Directory(Paths.document, directoryName);
        if (!directory.exists) continue;
        for (const file of listFiles(directory)) {
          const payload = await file.text();
          const record = decodeLegacyCacheRecord(directoryName, payload);
          if (record === null) continue;
          await database.runAsync(
            `INSERT INTO client_cache
              (environment_id, kind, cache_key, schema_version, payload, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (environment_id, kind, cache_key) DO NOTHING`,
            record.environmentId,
            record.kind,
            record.cacheKey,
            record.schemaVersion,
            record.payload,
            Date.now(),
          );
        }
        directory.delete();
      } catch (cause) {
        complete = false;
        console.warn(`[mobile-database] could not migrate legacy cache ${directoryName}`, cause);
      }
    }
    return complete;
  } catch (cause) {
    console.warn("[mobile-database] could not load legacy cache migration", cause);
    return false;
  }
}

export class MobileDatabase extends Context.Service<
  MobileDatabase,
  {
    readonly loadCache: (
      environmentId: EnvironmentId,
      kind: ClientCacheKind,
      cacheKey: string,
    ) => Effect.Effect<Option.Option<string>, MobileDatabaseError>;
    readonly listCache: (
      kind: ClientCacheKind,
    ) => Effect.Effect<ReadonlyArray<string>, MobileDatabaseError>;
    readonly saveCache: (
      environmentId: EnvironmentId,
      kind: ClientCacheKind,
      cacheKey: string,
      schemaVersion: number,
      payload: string,
    ) => Effect.Effect<void, MobileDatabaseError>;
    readonly removeCache: (
      environmentId: EnvironmentId,
      kind: ClientCacheKind,
      cacheKey: string,
    ) => Effect.Effect<void, MobileDatabaseError>;
    readonly clearCacheKind: (
      environmentId: EnvironmentId,
      kind: ClientCacheKind,
    ) => Effect.Effect<void, MobileDatabaseError>;
    readonly clearEnvironmentCache: (
      environmentId: EnvironmentId,
    ) => Effect.Effect<void, MobileDatabaseError>;
    readonly clearAllCaches: Effect.Effect<void, MobileDatabaseError>;
    readonly inspectCaches: Effect.Effect<
      ReadonlyArray<ClientCacheSummaryRow>,
      MobileDatabaseError
    >;
    readonly loadPreferencesJson: Effect.Effect<
      Option.Option<StoredPreferencesJson>,
      MobileDatabaseError
    >;
    readonly savePreferencesJson: (
      payload: string,
      updatedAt: number,
    ) => Effect.Effect<void, MobileDatabaseError>;
  }
>()("@t3tools/mobile/persistence/MobileDatabase") {}

const makeAvailable = Effect.fnUntraced(function* (options: MobileDatabaseOptions) {
  const database = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const SQLite = await import("expo-sqlite");
        return SQLite.openDatabaseAsync(DATABASE_NAME);
      },
      catch: databaseError("open"),
    }),
    (openDatabase) => Effect.promise(() => openDatabase.closeAsync()).pipe(Effect.ignore),
  );

  yield* Effect.tryPromise({
    try: async () => {
      // In WAL mode NORMAL fsyncs only at checkpoints instead of on every cache
      // save, so slow flash stops stalling the connection reads queue behind. A
      // crash cannot corrupt the cache; power loss can drop the latest saves.
      // checkpoint_fullfsync makes those checkpoints durable on iOS, and the size
      // limit stops the -wal file keeping its largest size after a big PR diff.
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA checkpoint_fullfsync = ON;
        PRAGMA journal_size_limit = ${WAL_SIZE_LIMIT_BYTES};
        PRAGMA foreign_keys = ON;
      `);
      const schema = await database.getFirstAsync<{ readonly user_version: number }>(
        "PRAGMA user_version",
      );
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(`
              CREATE TABLE IF NOT EXISTS client_cache (
                environment_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                cache_key TEXT NOT NULL,
                schema_version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (environment_id, kind, cache_key)
              ) WITHOUT ROWID;

              CREATE INDEX IF NOT EXISTS client_cache_environment_updated
                ON client_cache (environment_id, updated_at DESC);

              CREATE TABLE IF NOT EXISTS client_preferences (
                singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
                payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL
              );
            `);
      });
      if ((schema?.user_version ?? 0) < DATABASE_SCHEMA_VERSION) {
        const migrated = await migrateLegacyFileCaches(database);
        if (migrated) {
          await database.execAsync(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION};`);
        }
      }
    },
    catch: databaseError("migrate"),
  });

  return MobileDatabase.of({
    loadCache: Effect.fn("MobileDatabase.loadCache")((environmentId, kind, cacheKey) =>
      readFirst<{ readonly payload: string }>(
        database,
        options,
        "load-cache",
        `SELECT payload
                 FROM client_cache
                 WHERE environment_id = ? AND kind = ? AND cache_key = ?
                   AND (kind != 'pull-request' OR updated_at >= ?)`,
        environmentId,
        kind,
        cacheKey,
        Date.now() - 30 * 24 * 60 * 60_000,
      ).pipe(Effect.map((row) => Option.fromNullishOr(row?.payload))),
    ),
    listCache: Effect.fn("MobileDatabase.listCache")((kind) =>
      readAll<{ readonly payload: string }>(
        database,
        options,
        "list-cache",
        "SELECT payload FROM client_cache WHERE kind = ? ORDER BY updated_at",
        kind,
      ).pipe(Effect.map((rows) => rows.map((row) => row.payload))),
    ),
    saveCache: Effect.fn("MobileDatabase.saveCache")(
      (environmentId, kind, cacheKey, schemaVersion, payload) =>
        Effect.tryPromise({
          try: async () => {
            // Diffs can be large. Keep the offline PR cache within 32 MiB and 256
            // responses per environment, and don't let one huge diff evict it all.
            if (
              kind === "pull-request" &&
              new TextEncoder().encode(payload).length > 4 * 1024 * 1024
            )
              return;
            const save = async (transaction: SQLiteDatabase) => {
              await transaction.runAsync(
                `INSERT INTO client_cache
                  (environment_id, kind, cache_key, schema_version, payload, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT (environment_id, kind, cache_key) DO UPDATE SET
                   schema_version = excluded.schema_version,
                   payload = excluded.payload,
                   updated_at = excluded.updated_at
                 -- An unchanged payload writes nothing. Pull requests and favicons
                 -- still bump updated_at, which drives their expiry and order.
                 WHERE excluded.kind IN ('pull-request', 'project-favicon')
                   OR client_cache.payload IS NOT excluded.payload
                   OR client_cache.schema_version IS NOT excluded.schema_version`,
                environmentId,
                kind,
                cacheKey,
                schemaVersion,
                payload,
                Date.now(),
              );
              if (kind === "pull-request") {
                await transaction.runAsync(
                  `DELETE FROM client_cache WHERE environment_id = ? AND kind = 'pull-request'
                   AND cache_key IN (
                     SELECT cache_key FROM (
                       SELECT cache_key, updated_at,
                         ROW_NUMBER() OVER (ORDER BY updated_at DESC, cache_key) AS position,
                         SUM(LENGTH(CAST(payload AS BLOB))) OVER (
                           ORDER BY updated_at DESC, cache_key
                         ) AS total_bytes
                       FROM client_cache WHERE environment_id = ? AND kind = 'pull-request'
                     ) WHERE position > 256 OR total_bytes > 33554432 OR updated_at < ?
                   )`,
                  environmentId,
                  environmentId,
                  Date.now() - 30 * 24 * 60 * 60_000,
                );
              }
            };
            await save(database);
          },
          catch: databaseError("save-cache"),
        }).pipe(Effect.asVoid),
    ),
    removeCache: Effect.fn("MobileDatabase.removeCache")((environmentId, kind, cacheKey) =>
      Effect.tryPromise({
        try: () =>
          database.runAsync(
            `DELETE FROM client_cache
                     WHERE environment_id = ? AND kind = ? AND cache_key = ?`,
            environmentId,
            kind,
            cacheKey,
          ),
        catch: databaseError("remove-cache"),
      }).pipe(Effect.asVoid),
    ),
    clearCacheKind: Effect.fn("MobileDatabase.clearCacheKind")((environmentId, kind) =>
      Effect.tryPromise({
        try: () =>
          database.runAsync(
            "DELETE FROM client_cache WHERE environment_id = ? AND kind = ?",
            environmentId,
            kind,
          ),
        catch: databaseError("clear-cache-kind"),
      }).pipe(Effect.asVoid),
    ),
    clearEnvironmentCache: Effect.fn("MobileDatabase.clearEnvironmentCache")((environmentId) =>
      Effect.tryPromise({
        try: () =>
          database.runAsync("DELETE FROM client_cache WHERE environment_id = ?", environmentId),
        catch: databaseError("clear-environment-cache"),
      }).pipe(Effect.asVoid),
    ),
    clearAllCaches: Effect.tryPromise({
      try: () => database.runAsync("DELETE FROM client_cache"),
      catch: databaseError("clear-all-caches"),
    }).pipe(Effect.asVoid),
    inspectCaches: Effect.tryPromise({
      try: () =>
        database.getAllAsync<unknown>(`
                SELECT
                  environment_id AS environmentId,
                  kind,
                  COUNT(*) AS recordCount,
                  COALESCE(SUM(LENGTH(CAST(payload AS BLOB))), 0) AS payloadBytes
                FROM client_cache
                GROUP BY environment_id, kind
                ORDER BY environment_id, kind
              `),
      catch: databaseError("inspect-caches"),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ClientCacheSummaryRows)),
      Effect.mapError(databaseError("inspect-caches")),
      Effect.map((rows): ReadonlyArray<ClientCacheSummaryRow> =>
        rows.map((row) => ({
          environmentId: row.environmentId as EnvironmentId,
          kind: row.kind,
          recordCount: row.recordCount,
          payloadBytes: row.payloadBytes,
        })),
      ),
    ),
    loadPreferencesJson: readFirst<StoredPreferencesJson>(
      database,
      options,
      "load-preferences",
      `SELECT payload, updated_at AS updatedAt
             FROM client_preferences
             WHERE singleton = 1`,
    ).pipe(Effect.map(Option.fromNullishOr)),
    savePreferencesJson: Effect.fn("MobileDatabase.savePreferencesJson")((payload, updatedAt) =>
      Effect.tryPromise({
        try: () =>
          database.runAsync(
            `INSERT INTO client_preferences (singleton, payload, updated_at)
                   VALUES (1, ?, ?)
                   ON CONFLICT (singleton) DO UPDATE SET
                     payload = excluded.payload,
                     updated_at = excluded.updated_at`,
            payload,
            updatedAt,
          ),
        catch: databaseError("save-preferences"),
      }).pipe(Effect.asVoid),
    ),
  });
});

function makeUnavailable(error: MobileDatabaseError): MobileDatabase["Service"] {
  const fail = Effect.fail(error);
  return MobileDatabase.of({
    loadCache: () => fail,
    listCache: () => fail,
    saveCache: () => fail,
    removeCache: () => fail,
    clearCacheKind: () => fail,
    clearEnvironmentCache: () => fail,
    clearAllCaches: fail,
    inspectCaches: fail,
    loadPreferencesJson: fail,
    savePreferencesJson: () => fail,
  });
}

export const makeWith = (options: MobileDatabaseOptions) =>
  Effect.result(makeAvailable(options)).pipe(
    Effect.map((result) =>
      result._tag === "Success" ? result.success : makeUnavailable(result.failure),
    ),
  );

export const make = makeWith({ synchronousReads: false });

export const layerWith = (options: MobileDatabaseOptions) =>
  Layer.effect(MobileDatabase, makeWith(options));
