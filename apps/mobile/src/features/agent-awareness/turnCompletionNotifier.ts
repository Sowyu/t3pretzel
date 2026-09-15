import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import type { NavigationState } from "@react-navigation/native";

import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import { scopedProjectKey, scopedThreadKey } from "../../lib/scopedEntities";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentProjects } from "../../state/projects";
import { environmentThreadShells } from "../../state/threads";
import { activeThreadRef } from "../shortcuts/appShortcuts";
import { AGENT_ALERT_CHANNEL_ID } from "./notificationPermissions";
import {
  reconcileTurnCompletions,
  type TurnCompletionNotification,
  type TurnCompletionPhases,
} from "./turnCompletionNotifications";

/**
 * Marks the notifications this module posts. The foreground handler below
 * presents only these; everything else keeps the app's previous behaviour of
 * staying out of the way while the user is looking at the screen.
 */
const TURN_COMPLETION_KIND = "turn-completed";

const SILENT = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
} as const;

let phases: TurnCompletionPhases = new Map();
let openThreadKey: string | null = null;
let notificationsGranted = false;
let running = false;

function warn(message: string, error: unknown): void {
  console.warn(`[turn-notifications] ${message}`, error);
}

function refreshPermission(): void {
  Notifications.getPermissionsAsync().then(
    (permissions) => {
      notificationsGranted = permissions.granted;
    },
    (error: unknown) => warn("permission read failed", error),
  );
}

function post(notification: TurnCompletionNotification): void {
  Notifications.scheduleNotificationAsync({
    // One live notification per thread: a second completion replaces the first
    // instead of stacking a column of them.
    identifier: `${TURN_COMPLETION_KIND}:${notification.key}`,
    content: {
      title: notification.title,
      body: notification.body,
      data: { t3Kind: TURN_COMPLETION_KIND, deepLink: notification.deepLink },
    },
    trigger: Platform.OS === "android" ? { channelId: AGENT_ALERT_CHANNEL_ID } : null,
  }).catch((error: unknown) => warn("could not post a completion notification", error));
}

function reconcile(threads: ReadonlyArray<EnvironmentThreadShell>): void {
  const projectTitles = new Map<string, string>();
  for (const project of appAtomRegistry.get(environmentProjects.projectsAtom)) {
    projectTitles.set(scopedProjectKey(project.environmentId, project.id), project.title);
  }

  const result = reconcileTurnCompletions({
    phases,
    threads: threads.map((thread) => ({
      environmentId: thread.environmentId,
      projectTitle:
        projectTitles.get(scopedProjectKey(thread.environmentId, thread.projectId)) ?? "",
      thread,
    })),
    enabled: notificationsGranted,
    foreground: AppState.currentState === "active",
    openThreadKey,
  });

  phases = result.phases;
  for (const notification of result.notifications) {
    post(notification);
  }
}

/**
 * Watches every connected environment's thread shells and posts a local
 * notification when a turn stops running. Subscribes through the atom registry
 * rather than a React hook so a shell event never re-renders the navigation
 * tree. Relay pushes cover the app being killed; this covers the app being
 * alive, which is the only case that works without a Firebase configuration.
 */
export function startTurnCompletionNotifications(): () => void {
  if (running) return () => undefined;
  running = true;

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(AGENT_ALERT_CHANNEL_ID, {
      name: "Agent alerts",
      importance: Notifications.AndroidImportance.HIGH,
    }).catch((error: unknown) => warn("could not create the alert channel", error));
  }

  Notifications.setNotificationHandler({
    handleNotification: (notification) =>
      Promise.resolve(
        notification.request.content.data?.t3Kind === TURN_COMPLETION_KIND
          ? { ...SILENT, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true }
          : SILENT,
      ),
  });

  refreshPermission();
  const appStateSubscription = AppState.addEventListener("change", (state) => {
    // Permission can only change while the app is away, in system Settings.
    if (state === "active") refreshPermission();
  });

  // Seeds the phase map so already-finished threads never alert at launch.
  reconcile(appAtomRegistry.get(environmentThreadShells.threadShellsAtom));
  const unsubscribe = appAtomRegistry.subscribe(
    environmentThreadShells.threadShellsAtom,
    reconcile,
  );

  return () => {
    running = false;
    unsubscribe();
    appStateSubscription.remove();
    Notifications.setNotificationHandler(null);
    phases = new Map();
  };
}

/**
 * Thread the user is currently looking at. A turn finishing there needs no
 * notification while the app is in the foreground.
 */
export function useTurnCompletionNotifications(state: NavigationState): void {
  useEffect(() => startTurnCompletionNotifications(), []);

  useEffect(() => {
    const ref = activeThreadRef(state);
    openThreadKey = ref === null ? null : scopedThreadKey(ref.environmentId, ref.threadId);
  }, [state]);
}
