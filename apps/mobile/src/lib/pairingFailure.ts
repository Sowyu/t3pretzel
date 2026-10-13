/**
 * A pairing that never reached the server says so in one sentence. The raw
 * transport error ("HttpClientError: Transport error (GET ...)") goes to the
 * log instead of the banner.
 */
export function describePairingFailure(error: unknown, pairingUrl: string): string | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("_tag" in error) ||
    error._tag !== "ConnectionTransientError" ||
    !("reason" in error) ||
    (error.reason !== "network" && error.reason !== "timeout")
  ) {
    return null;
  }
  let host = pairingUrl.trim();
  try {
    host = new URL(pairingUrl).host || host;
  } catch {
    // Keep what the user typed.
  }
  return `Couldn't reach ${host}. Check the address and that the server is running.`;
}
