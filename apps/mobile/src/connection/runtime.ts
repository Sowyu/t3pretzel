import { Connection } from "@t3tools/client-runtime/connection";
import { ShellSnapshotLoader } from "@t3tools/client-runtime/state/shell";
import { PullRequestDiffLoader } from "@t3tools/client-runtime/state/pull-requests";
import {
  BoundedThreadSnapshotLoader,
  ThreadHistoryController,
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

const layerSnapshotLoader = Layer.mergeAll(
  PullRequestDiffLoader.layer,
  BoundedThreadSnapshotLoader.layer,
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
