import { fetch as expoFetch } from "expo/fetch";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Socket from "effect/socket/Socket";
import { Platform } from "react-native";

import { layerRemoteHttpClient } from "@t3tools/client-runtime/rpc";

import * as Dpop from "../features/cloud/dpop";
import * as ManagedRelayLayer from "../features/cloud/managedRelayLayer";
import { resolveCloudPublicConfig } from "../features/cloud/publicConfig";
import * as Tracing from "../features/observability/tracing";
import * as Persistence from "../persistence/layer";
import { disposeOnFoundationReplace, type FoundationHotModule } from "./foundation-fast-refresh";

declare const module: { readonly hot?: FoundationHotModule } | undefined;

function configuredRelayUrl(): string {
  return resolveCloudPublicConfig().relay.url ?? "http://relay.invalid";
}

// Environment requests on Android use Expo's fetch. React Native's fetch passes
// each response body to JS as a base64 data URL through several native round
// trips, and every one of them waits behind the sync work on the JS thread.
// Expo's fetch hands the body over as one ArrayBuffer. Its init type differs
// from the DOM one only in fields the Effect client never sets.
const environmentFetch: typeof fetch =
  Platform.OS === "android" ? (expoFetch as unknown as typeof fetch) : fetch;
const layerHttpClient = layerRemoteHttpClient(environmentFetch);

type RuntimeLayerSource =
  | ReturnType<typeof ManagedRelayLayer.layer>
  | typeof Socket.layerWebSocketConstructorGlobal
  | typeof Dpop.layer
  | typeof layerHttpClient
  | typeof Persistence.layer
  | typeof Tracing.layer;

const layerRuntime = Layer.merge(
  ManagedRelayLayer.layer(configuredRelayUrl()),
  Socket.layerWebSocketConstructorGlobal,
).pipe(
  Layer.provideMerge(Dpop.layer),
  Layer.provideMerge(layerHttpClient),
  Layer.provideMerge(Tracing.layer.pipe(Layer.provide(layerHttpClient))),
  Layer.provideMerge(Persistence.layer),
);

export const runtime: ManagedRuntime.ManagedRuntime<
  Layer.Success<RuntimeLayerSource>,
  Layer.Error<RuntimeLayerSource>
> = ManagedRuntime.make(layerRuntime);

export const layer: Layer.Layer<
  Layer.Success<RuntimeLayerSource>,
  Layer.Error<RuntimeLayerSource>
> = Layer.effectContext(runtime.contextEffect);

disposeOnFoundationReplace(typeof module === "undefined" ? undefined : module.hot, () =>
  runtime.dispose(),
);
