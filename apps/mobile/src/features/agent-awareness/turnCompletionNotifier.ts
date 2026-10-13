import { hasRelayRoute } from "@t3tools/client-runtime/connection";
import {
  enabledEnvironmentIds,
  type EnvironmentCatalogState,
} from "@t3tools/client-runtime/state/connections";
import type {
  EnvironmentId,
  OrchestrationProjectShell,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";

import { environmentCatalog } from "../../connection/catalog";
import { loadPreferences } from "../../persistence/imperative";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentSnapshotAtom } from "../../state/shell";
import {
  postAndroidLocalAgentAlert,
  supportsAndroidAgentNotifications,
} from "./androidNotifications";
import {
  agentAwarenessPushRegistered,
  getAgentAwarenessRegistrationStatus,
  subscribeAgentAwarenessRegistrationStatus,
} from "./remoteRegistration";
import { detectTurnCompletions } from "./turnCompletionNotifications";

// A headless background refresh has no relay registration of its own, so the
// UI records the last answer for it.
const PUSH_REGISTERED_KEY = "t3code.turn-notifications.push-registered";

async function pushRegistered(): Promise<boolean> {
  const status = getAgentAwarenessRegistrationStatus();
  if (status === "registered" || status === "failed") return agentAwarenessPushRegistered();
  return (await SecureStore.getItemAsync(PUSH_REGISTERED_KEY).catch(() => null)) === "1";
}

function rememberPushRegistered(): void {
  const status = getAgentAwarenessRegistrationStatus();
  if (status !== "registered" && status !== "failed") return;
  void SecureStore.setItemAsync(
    PUSH_REGISTERED_KEY,
    agentAwarenessPushRegistered() ? "1" : "0",
  ).catch(() => undefined);
}

/**
 * Posts a local alert for each turn that finished between two views of one
 * environment. Relay pushes reach this device only when it registered a push
 * token, and only for environments it reaches through T3 Connect, so those are
 * left to the push. Returns how many alerts went to the native poster, which
 * drops any it has already shown.
 */
export async function postTurnCompletions(input: {
  readonly environmentId: EnvironmentId;
  readonly hasRelayRoute: boolean;
  readonly previous: ReadonlyArray<OrchestrationV2ThreadShell> | null;
  readonly current: ReadonlyArray<OrchestrationV2ThreadShell>;
  readonly projects: ReadonlyArray<Pick<OrchestrationProjectShell, "id" | "title">>;
}): Promise<number> {
  if (Platform.OS !== "android" || !supportsAndroidAgentNotifications()) return 0;
  const alerts = detectTurnCompletions({ ...input, nowMs: Date.now() });
  if (alerts.length === 0) return 0;
  if (input.hasRelayRoute && (await pushRegistered())) return 0;
  const preferences = await loadPreferences().catch(() => null);
  if (preferences?.turnNotificationsEnabled === false) return 0;
  return alerts.filter(postAndroidLocalAgentAlert).length;
}

let started = false;
const previousSnapshots = new Map<EnvironmentId, OrchestrationV2ShellSnapshot | null>();
const unsubscribers = new Map<EnvironmentId, () => void>();

function onSnapshot(environmentId: EnvironmentId, snapshot: OrchestrationV2ShellSnapshot | null) {
  const hadPrevious = previousSnapshots.has(environmentId);
  const previous = previousSnapshots.get(environmentId) ?? null;
  previousSnapshots.set(environmentId, snapshot);
  // The open app shows the change itself.
  if (!hadPrevious || snapshot === null || AppState.currentState === "active") return;
  const entry = appAtomRegistry.get(environmentCatalog.catalogValueAtom).entries.get(environmentId);
  void postTurnCompletions({
    environmentId,
    hasRelayRoute: entry !== undefined && hasRelayRoute(entry),
    previous: previous?.threads ?? null,
    current: snapshot.threads,
    projects: snapshot.projects,
  }).catch((error: unknown) => {
    console.warn("[turn-notifications] could not post a finished turn", error);
  });
}

function followEnvironments(catalog: EnvironmentCatalogState) {
  const enabled = new Set(enabledEnvironmentIds(catalog));
  for (const [environmentId, unsubscribe] of unsubscribers) {
    if (enabled.has(environmentId)) continue;
    unsubscribe();
    unsubscribers.delete(environmentId);
    previousSnapshots.delete(environmentId);
  }
  for (const environmentId of enabled) {
    if (unsubscribers.has(environmentId)) continue;
    unsubscribers.set(
      environmentId,
      appAtomRegistry.subscribe(
        environmentSnapshotAtom(environmentId),
        (snapshot) => onSnapshot(environmentId, snapshot),
        { immediate: true },
      ),
    );
  }
}

/**
 * Watches the live shells while the app is alive and posts an alert when a
 * turn finishes with the app in the background. The home list already keeps
 * these shells subscribed, so following them opens no extra connection. Call
 * from UI code only: a headless launch must not start the live connection.
 */
export function startTurnCompletionNotifications(): void {
  if (started || Platform.OS !== "android" || !supportsAndroidAgentNotifications()) return;
  started = true;
  rememberPushRegistered();
  subscribeAgentAwarenessRegistrationStatus(rememberPushRegistered);
  appAtomRegistry.subscribe(environmentCatalog.catalogValueAtom, followEnvironments, {
    immediate: true,
  });
}
