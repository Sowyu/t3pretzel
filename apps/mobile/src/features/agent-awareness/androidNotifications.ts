import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Linking, Platform } from "react-native";

interface AndroidAgentNotifications {
  configure(deviceId: string, userId: string, scheme: string, ongoingEnabled: boolean): void;
  clear(): void;
  setThreadOnScreen?(path: string | null): void;
  postLocalAlert?(scheme: string, data: Record<string, string>): void;
  openLiveUpdateSettings?(): boolean;
  showShowcaseActivity?(scheme: string, data: Record<string, string>): void;
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<AndroidAgentNotifications>("T3AgentNotifications")
    : null;

export function supportsAndroidAgentNotifications(): boolean {
  return typeof native?.configure === "function" && typeof native?.clear === "function";
}

function appScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  return (Array.isArray(scheme) ? scheme[0] : scheme) ?? "t3code";
}

export function configureAndroidAgentNotifications(
  deviceId: string,
  userId: string,
  ongoingEnabled: boolean,
): void {
  native?.configure?.(deviceId, userId, appScheme(), ongoingEnabled);
}

/** Posts a staged relay payload for the showcase capture; false when unsupported. */
export function showAndroidShowcaseAgentActivity(data: Record<string, string>): boolean {
  if (!native?.showShowcaseActivity) return false;
  native.showShowcaseActivity(appScheme(), data);
  return true;
}

/**
 * Posts an alert through the same native path as relay pushes: same channel,
 * same tap-to-open, and the same seen-alert history, so a repeated `alertId`
 * never posts twice. False when this build lacks the native function.
 */
export function postAndroidLocalAgentAlert(alert: {
  readonly alertId: string;
  readonly title: string;
  readonly body: string;
  readonly path: string;
}): boolean {
  if (!native?.postLocalAlert) return false;
  native.postLocalAlert(appScheme(), {
    alert_id: alert.alertId,
    alert_title: alert.title,
    alert_body: alert.body,
    alert_path: alert.path,
  });
  return true;
}

export function clearAndroidAgentNotifications(): void {
  native?.clear?.();
}

/** Tells the FCM handler which thread route is on screen so its alerts stay quiet. */
export function setAndroidThreadOnScreen(path: string | null): void {
  native?.setThreadOnScreen?.(path);
}

export function supportsAndroidLiveUpdateSettings(): boolean {
  return Platform.OS === "android" && Number(Platform.Version) >= 36;
}

export async function openAndroidLiveUpdateSettings(): Promise<void> {
  if (!native?.openLiveUpdateSettings?.()) {
    await Linking.openSettings();
  }
}
