import * as Layer from "effect/Layer";
import { Platform } from "react-native";

import * as PullRequestCacheStore from "../connection/pull-request-cache-store";
import * as EnvironmentCacheStore from "../connection/environment-cache-store";
import * as MobileDatabase from "./mobile-database";
import * as MobilePreferences from "./mobile-preferences";
import * as MobileSecureStorage from "./mobile-secure-storage";
import * as MobileStorage from "./mobile-storage";

// Android reads cache rows synchronously; see MobileDatabaseOptions.
const layerBase = Layer.merge(
  MobileDatabase.layerWith({ synchronousReads: Platform.OS === "android" }),
  MobileSecureStorage.layer,
);
const layerDependent = Layer.mergeAll(
  MobilePreferences.layer,
  MobileStorage.layer,
  EnvironmentCacheStore.layer,
  PullRequestCacheStore.layer,
).pipe(Layer.provide(layerBase));

export const layer = Layer.merge(layerBase, layerDependent);
