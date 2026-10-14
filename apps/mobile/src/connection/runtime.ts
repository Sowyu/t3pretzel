import { Connection } from "@t3tools/client-runtime/connection";
import { SubscriptionDefectRetry } from "@t3tools/client-runtime/rpc";
import { ShellSnapshotLoader } from "@t3tools/client-runtime/state/shell";
import { PullRequestDiffLoader } from "@t3tools/client-runtime/state/pull-requests";
import {
  BoundedThreadSnapshotLoader,
  ThreadHistoryController,
  ThreadSnapshotLoader,
} from "@t3tools/client-runtime/state/threads";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import type { FoundationHotModule } from "../lib/foundation-fast-refresh";
import { hotSwappableAtomRuntime } from "../lib/hot-swappable-atom-runtime";
import * as Runtime from "../lib/runtime";
import { appAtomRegistry } from "../state/atom-registry";
import * as BackgroundActivity from "./background-activity";
import * as ConnectionPlatform from "./platform";
import { takeShell } from "./shell-handoff";
import { awaitShellThreadPresence, confirmThreadMisses } from "./thread-miss-confirmation";

declare const module: { readonly hot?: FoundationHotModule } | undefined;

const layerProvidedConnectionPlatform = ConnectionPlatform.layer.pipe(Layer.provide(Runtime.layer));

/**
 * The upstream loader, except a reconnect first takes a snapshot background
 * refresh just fetched or is still fetching (see shell-handoff.ts).
 */
const layerShellSnapshotLoader = Layer.effect(
  ShellSnapshotLoader.ShellSnapshotLoader,
  Effect.gen(function* () {
    const loader = yield* ShellSnapshotLoader.ShellSnapshotLoader;
    return ShellSnapshotLoader.ShellSnapshotLoader.of({
      load: (prepared) =>
        Effect.promise(() => takeShell(prepared.environmentId)).pipe(
          Effect.flatMap((snapshot) =>
            snapshot === null ? loader.load(prepared) : Effect.succeed(Option.some(snapshot)),
          ),
        ),
    });
  }),
).pipe(Layer.provide(ShellSnapshotLoader.layer));

// A busy phone can take more than the default 6 s to receive and decode a
// bounded snapshot while environments sync, and the socket fallback then has
// the server build it again. 20 s matches the full snapshot deadline.
const layerThreadSnapshotLoader = Layer.effect(
  ThreadSnapshotLoader,
  Effect.gen(function* () {
    const loader = yield* ThreadSnapshotLoader;
    return ThreadSnapshotLoader.of(confirmThreadMisses(loader, awaitShellThreadPresence));
  }),
).pipe(Layer.provide(BoundedThreadSnapshotLoader.layerWithOptions({ boundedTimeoutMs: 20_000 })));

const layerSnapshotLoader = Layer.mergeAll(
  PullRequestDiffLoader.layer,
  layerThreadSnapshotLoader,
  // A shell or thread stream that dies on a defect (for example a server chunk
  // this build cannot decode) subscribes again with backoff instead of leaving
  // the list or the thread frozen.
  Layer.succeed(SubscriptionDefectRetry, Option.some("1 second")),
  layerShellSnapshotLoader,
  ThreadHistoryController.layer,
);

type ConnectionLayerSource =
  | typeof Connection.layer
  | typeof layerSnapshotLoader
  | typeof Runtime.layer
  | typeof ConnectionPlatform.layer
  | typeof BackgroundActivity.layerObserver
  | typeof BackgroundActivity.layerReporter;

const layerProvidedClientConnection = layerSnapshotLoader.pipe(
  Layer.provideMerge(
    Connection.layerWithOptions({ usageLimitSources: true, usageLimitsCommand: true }),
  ),
  Layer.provideMerge(
    Layer.mergeAll(
      Runtime.layer,
      layerProvidedConnectionPlatform,
      BackgroundActivity.layerObserver,
    ),
  ),
);

const layerConnection = BackgroundActivity.layerReporter.pipe(
  Layer.provideMerge(layerProvidedClientConnection),
);

export const connectionAtomRuntime: Atom.AtomRuntime<
  Layer.Success<ConnectionLayerSource>,
  Layer.Error<ConnectionLayerSource>
> = hotSwappableAtomRuntime({
  id: "t3.mobile.connection-runtime",
  hotModule: typeof module === "undefined" ? undefined : module.hot,
  registry: appAtomRegistry,
  layer: layerConnection,
});
