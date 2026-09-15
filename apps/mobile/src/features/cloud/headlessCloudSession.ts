import { getClerkInstance } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  createManagedRelaySession,
  type ManagedRelaySession,
  managedRelaySessionAtom,
} from "@t3tools/client-runtime/relay";

import { appAtomRegistry } from "../../state/atom-registry";
import { resolveCloudPublicConfig, resolveRelayClerkTokenOptions } from "./publicConfig";

// One Clerk `load()` per JS context is enough, and a background launch gets a
// fresh context anyway. Only a resolved session is cached: caching "signed out"
// would outlive a sign-in that happens later in the same context.
let cachedSession: ManagedRelaySession | null = null;

/**
 * The T3 Connect session for code that runs without React.
 *
 * `CloudAuthProvider` owns the session while the UI is mounted, and that is the
 * one to prefer: the relay authorization service detects account switches by
 * comparing session objects by reference. A headless launch has no provider, so
 * this rebuilds the session from the same Clerk token cache (expo-secure-store)
 * the app signs in with. Returns null when T3 Connect is unconfigured or nobody
 * is signed in.
 */
export async function resolveHeadlessCloudSession(): Promise<ManagedRelaySession | null> {
  const live = appAtomRegistry.get(managedRelaySessionAtom);
  if (live !== null) return live;
  if (cachedSession !== null) return cachedSession;

  const publishableKey = resolveCloudPublicConfig().clerk.publishableKey;
  if (publishableKey === null) return null;

  const clerk = getClerkInstance({ publishableKey, tokenCache });
  if (!clerk.loaded) {
    // `standardBrowser: false` is what ClerkProvider passes on native: there is
    // no window to read cookies or a redirect result from.
    await clerk.load({ standardBrowser: false });
  }
  const session = clerk.session;
  const accountId = clerk.user?.id;
  if (!session || !accountId) return null;

  cachedSession = createManagedRelaySession({
    accountId,
    readClerkToken: () => session.getToken(resolveRelayClerkTokenOptions()),
  });
  return cachedSession;
}
