import { useAtomValue } from "@effect/atom-react";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { environmentPresentations } from "../state/presentation";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import {
  createWidgetRefresher,
  WIDGET_REFRESH_INTERVAL,
  WIDGET_REFRESH_SETTLE_DELAY,
  widgetLimitsCheckedAt,
} from "./subscriptionUsageSnapshot";

export function useSubscriptionUsage(enabled = true) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const refresh = useMemo(
    () =>
      createWidgetRefresher(
        (environmentId: Parameters<typeof refreshProviders>[0]["environmentId"]) =>
          refreshProviders({ environmentId, input: {} }),
      ),
    [refreshProviders],
  );
  // Launch and foreground syncs run first. Probes start once this is true.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer = setTimeout(() => setSettled(true), WIDGET_REFRESH_SETTLE_DELAY);
    const subscription = AppState.addEventListener("change", (state) => {
      clearTimeout(timer);
      setSettled(false);
      if (state === "active") {
        timer = setTimeout(() => setSettled(true), WIDGET_REFRESH_SETTLE_DELAY);
      }
    });
    return () => {
      subscription.remove();
      clearTimeout(timer);
      setSettled(false);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !settled) return;
    const update = () => {
      if (AppState.currentState !== "active") return;
      const connected = [...presentations]
        .filter(([, presentation]) => presentation.connection.phase === "connected")
        .map(([id]) => id);
      void refresh(connected, Date.now(), (id) =>
        widgetLimitsCheckedAt(presentations.get(id)?.serverConfig?.providers),
      );
    };
    update();
    const timer = setInterval(update, WIDGET_REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [enabled, settled, presentations, refresh]);
}
