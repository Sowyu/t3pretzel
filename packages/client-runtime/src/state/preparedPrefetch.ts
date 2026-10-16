import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import type { PreparedConnection } from "../connection/model.ts";

/**
 * Starts an HTTP snapshot load as soon as the supervisor publishes `prepared`,
 * which happens before the socket opens, so the download overlaps the socket
 * handshake and the server config sync instead of waiting for them.
 *
 * The subscription calls the returned `take` with its session's `prepared`
 * and gets that load's result, or a fresh load when none matches. Each load is
 * taken once. A load nobody took is interrupted when `prepared` changes or
 * clears, since its connection attempt failed. `wanted` is read when
 * `prepared` arrives, so a state that will resume over the socket skips it.
 */
export const prefetchOnPrepared = Effect.fnUntraced(function* <A>(
  prepared: SubscriptionRef.SubscriptionRef<Option.Option<PreparedConnection>>,
  load: (prepared: PreparedConnection) => Effect.Effect<A>,
  wanted: Effect.Effect<boolean>,
) {
  const scope = yield* Effect.scope;
  let pending:
    | { readonly prepared: PreparedConnection; readonly fiber: Fiber.Fiber<A>; taken: boolean }
    | undefined;
  const replace = Effect.fnUntraced(function* (next: typeof pending) {
    const previous = pending;
    pending = next;
    if (previous !== undefined && !previous.taken) yield* Fiber.interrupt(previous.fiber);
  });
  const start = Effect.fnUntraced(function* (connection: PreparedConnection, taken: boolean) {
    const started = {
      prepared: connection,
      fiber: yield* load(connection).pipe(Effect.forkIn(scope)),
      taken,
    };
    yield* replace(started);
    return started;
  });

  yield* SubscriptionRef.changes(prepared).pipe(
    Stream.runForEach((next) =>
      Effect.gen(function* () {
        if (Option.isSome(next) && pending?.prepared === next.value) return;
        if (Option.isSome(next) && (yield* wanted)) {
          yield* start(next.value, false);
          return;
        }
        yield* replace(undefined);
      }),
    ),
    Effect.forkScoped,
  );

  return Effect.fnUntraced(function* (connection: PreparedConnection) {
    const match = pending;
    let fiber: Fiber.Fiber<A>;
    if (match !== undefined && match.prepared === connection && !match.taken) {
      match.taken = true;
      fiber = match.fiber;
    } else {
      fiber = (yield* start(connection, true)).fiber;
    }
    // A taken load belongs to this caller, so only its interruption stops the load.
    return yield* Fiber.join(fiber).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber)));
  });
});
