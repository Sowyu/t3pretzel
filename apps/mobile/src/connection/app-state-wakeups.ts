import type { Wakeups } from "@t3tools/client-runtime/connection";

// A long background resume replaces the connection and re-downloads the
// whole shell snapshot, which the user sees as "Syncing threads…". Ten seconds
// made every app switch pay that price. Within this window the resume only
// probes the socket (3 s timeout) and falls through to the full reconnect
// when the probe fails, so a socket the OS silently dropped still recovers.
export const MOBILE_BACKGROUND_RECONNECT_AFTER_MS = 5 * 60_000;

export type MobileApplicationActiveWakeup = Extract<
  Wakeups.ConnectionWakeup,
  "application-active-probe" | "application-active-reconnect"
>;

export function mobileApplicationActiveWakeup(
  backgroundedAtMs: number | null,
  activeAtMs: number,
): MobileApplicationActiveWakeup {
  return backgroundedAtMs !== null &&
    activeAtMs - backgroundedAtMs >= MOBILE_BACKGROUND_RECONNECT_AFTER_MS
    ? "application-active-reconnect"
    : "application-active-probe";
}
