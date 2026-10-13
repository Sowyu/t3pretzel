import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { ListRowLayout } from "../../components/ListRowLayout";
import { backgroundRefreshNative } from "../../connection/background-refresh-native";
import {
  backgroundRefreshStatusSnapshot,
  refreshBackgroundRefreshStatus,
  subscribeBackgroundRefreshStatus,
} from "../../connection/background-refresh";
import {
  backgroundRefreshSummaryLabel,
  formatAgo,
  formatRefreshDuration,
  parseBackgroundRefreshRecord,
} from "../../connection/background-refresh-plan";
import { SettingsActionRow } from "../settings/components/SettingsActionRow";
import { SettingsSection } from "../settings/components/SettingsSection";

const WORK_STATES: Readonly<Record<string, string>> = {
  ENQUEUED: "Scheduled",
  RUNNING: "Running now",
  BLOCKED: "Waiting for a network",
  SUCCEEDED: "Finished",
  FAILED: "Failed",
  CANCELLED: "Not scheduled",
};

const STANDBY_BUCKETS: Readonly<Record<number, string>> = {
  5: "Exempted",
  10: "Active",
  20: "Working set",
  30: "Frequent",
  40: "Rare",
  45: "Restricted",
  50: "Never",
};

/** What the worker and Android reported, so a "never refreshes" report has evidence. */
export function BackgroundRefreshDiagnostics() {
  const { status, readAtMs: nowMs } = useSyncExternalStore(
    subscribeBackgroundRefreshStatus,
    backgroundRefreshStatusSnapshot,
  );
  const refresh = useCallback(() => {
    void refreshBackgroundRefreshStatus();
  }, []);
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  if (backgroundRefreshNative === null) return null;
  const record = parseBackgroundRefreshRecord(status?.record ?? null);
  const lastWake =
    status?.lastStartedAtMs == null
      ? "Never"
      : [formatAgo(status.lastStartedAtMs, nowMs), status.lastOutcome ?? "running"].join(" · ");

  return (
    <>
      <SettingsSection title="Background refresh">
        <ListRowLayout
          label="Schedule"
          detail={
            status === null
              ? "Unknown"
              : !status.enabled
                ? "Off"
                : (WORK_STATES[status.workState ?? "CANCELLED"] ?? status.workState ?? "")
          }
        />
        <ListRowLayout label="Last woken by Android" description={lastWake} />
        <ListRowLayout
          label="Last run"
          description={
            record === null
              ? "None yet"
              : `${backgroundRefreshSummaryLabel(record)} in ${formatRefreshDuration(record.durationMs)} · ${formatAgo(record.finishedAtMs, nowMs)}${record.notified > 0 ? ` · ${record.notified} alerts` : ""}${record.error ? ` · ${record.error}` : ""}`
          }
        />
        {record?.environments.map((environment) => (
          <ListRowLayout
            key={environment.environmentId}
            label={environment.label}
            description={[environment.outcome, environment.reason].filter(Boolean).join(" · ")}
          />
        ))}
        <ListRowLayout
          label="Battery"
          detail={
            status === null
              ? "Unknown"
              : status.backgroundRestricted
                ? "Restricted"
                : status.ignoringBatteryOptimizations
                  ? "Unrestricted"
                  : "Optimized"
          }
        />
        <ListRowLayout
          label="Standby bucket"
          detail={
            status?.standbyBucket == null
              ? "Unknown"
              : (STANDBY_BUCKETS[status.standbyBucket] ?? String(status.standbyBucket))
          }
        />
      </SettingsSection>
      <SettingsSection>
        <SettingsActionRow
          icon="arrow.clockwise"
          label="Run background refresh now"
          disabled={status?.enabled !== true}
          onPress={() => backgroundRefreshNative?.runNow()}
        />
      </SettingsSection>
    </>
  );
}
