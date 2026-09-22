import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  normalizeProviderAccentColor,
  resolveProviderInstanceDisplayName,
  shouldShowInstanceBadge,
} from "@t3tools/client-runtime/state/provider-instance-display";
import type { EnvironmentId, ProviderDriverKind, ServerConfig } from "@t3tools/contracts";

/** What a thread row needs to draw the provider glyph and its account badge. */
export interface ThreadRowProviderInstance {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly accentColor?: string | undefined;
  readonly showBadge: boolean;
}

// Rows are memoized, so the same provider list must hand back the same object.
// A new server config brings a new providers array, which drops its cache entry.
const resolvedByProviders = new WeakMap<
  ServerConfig["providers"],
  Map<string, ThreadRowProviderInstance>
>();

/**
 * Resolve the provider instance a thread runs on, scoped to the thread's own
 * environment: default instance ids are the driver slug, so the same id
 * names a different account on every server. Returns the same object for the
 * same provider list and instance id.
 */
export function resolveThreadProviderInstance(
  serverConfigs: ReadonlyMap<EnvironmentId, ServerConfig>,
  thread: EnvironmentThreadShell,
): ThreadRowProviderInstance | null {
  const providers = serverConfigs.get(thread.environmentId)?.providers;
  if (!providers) return null;
  const instanceId = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
  let resolved = resolvedByProviders.get(providers);
  const cached = resolved?.get(instanceId);
  if (cached) return cached;
  const snapshot = providers.find((provider) => provider.instanceId === instanceId);
  if (!snapshot) return null;
  const entry = {
    driverKind: snapshot.driver,
    displayName: resolveProviderInstanceDisplayName(snapshot),
    accentColor: normalizeProviderAccentColor(snapshot.accentColor),
  };
  const instance = {
    ...entry,
    showBadge: shouldShowInstanceBadge(
      entry,
      providers.map((provider) => ({ driverKind: provider.driver })),
    ),
  };
  if (!resolved) {
    resolved = new Map();
    resolvedByProviders.set(providers, resolved);
  }
  resolved.set(instanceId, instance);
  return instance;
}
