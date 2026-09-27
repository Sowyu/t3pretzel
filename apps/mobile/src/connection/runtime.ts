import { Connection } from "@t3tools/client-runtime/connection";
import { ShellSnapshotLoader, shellSnapshotLoaderLayer } from "@t3tools/client-runtime/state/shell";
import { threadSnapshotLoaderLayer } from "@t3tools/client-runtime/state/threads";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Atom } from "effect/unstable/reactivity";

import type { FoundationHotModule } from "../lib/foundation-fast-refresh";
import { hotSwappableAtomRuntime } from "../lib/hot-swappable-atom-runtime";
import { runtimeContextLayer } from "../lib/runtime";
import { appAtomRegistry } from "../state/atom-registry";
import {
  mobileBackgroundActivityObserverLayer,
  mobileBackgroundActivityReporterLayer,
} from "./background-activity";
import { connectionPlatformLayer } from "./platform";
import { takeShell } from "./shell-handoff";

declare const module: { readonly hot?: FoundationHotModule } | undefined;

const providedConnectionPlatformLayer = connectionPlatformLayer.pipe(
  Layer.provide(runtimeContextLayer),
);

// A reconnect takes the shell background refresh just fetched (see
// shell-handoff.ts) and only downloads one itself when there is none.
const handoffShellSnapshotLoaderLayer = Layer.effect(
  ShellSnapshotLoader,
  Effect.gen(function* () {
    const http = yield* ShellSnapshotLoader;
    return ShellSnapshotLoader.of({
      load: (prepared) =>
        Effect.promise(() => takeShell(prepared.environmentId)).pipe(
          Effect.flatMap((snapshot) =>
            snapshot === null ? http.load(prepared) : Effect.succeed(Option.some(snapshot)),
          ),
        ),
    });
  }),
).pipe(Layer.provide(shellSnapshotLoaderLayer));

const snapshotLoaderLayer = Layer.merge(threadSnapshotLoaderLayer, handoffShellSnapshotLoaderLayer);

type ConnectionLayerSource =
  | typeof Connection.layer
  | typeof snapshotLoaderLayer
  | typeof runtimeContextLayer
  | typeof connectionPlatformLayer
  | typeof mobileBackgroundActivityObserverLayer
  | typeof mobileBackgroundActivityReporterLayer;

const providedClientConnectionLayer = snapshotLoaderLayer.pipe(
  Layer.provideMerge(
    Connection.layerWithOptions({ usageLimitSources: true, usageLimitsCommand: true }),
  ),
  Layer.provideMerge(
    Layer.mergeAll(
      runtimeContextLayer,
      providedConnectionPlatformLayer,
      mobileBackgroundActivityObserverLayer,
    ),
  ),
);

const connectionLayer = mobileBackgroundActivityReporterLayer.pipe(
  Layer.provideMerge(providedClientConnectionLayer),
);

export const connectionAtomRuntime: Atom.AtomRuntime<
  Layer.Success<ConnectionLayerSource>,
  Layer.Error<ConnectionLayerSource>
> = hotSwappableAtomRuntime({
  id: "t3.mobile.connection-runtime",
  hotModule: typeof module === "undefined" ? undefined : module.hot,
  registry: appAtomRegistry,
  layer: connectionLayer,
});
