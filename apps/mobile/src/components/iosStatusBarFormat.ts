/** iOS status bar clock: no AM/PM in 12-hour time, a leading zero in 24-hour time. */
export function formatStatusBarTime(date: Date, use24Hour: boolean) {
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (use24Hour) return `${String(date.getHours()).padStart(2, "0")}:${minutes}`;
  return `${date.getHours() % 12 || 12}:${minutes}`;
}

/** Milliseconds to the next wall-clock minute, so the clock repaints once per minute on the boundary. */
export function msUntilNextMinute(now: number) {
  return 60_000 - (now % 60_000);
}

/** iOS battery fill: green while charging, red at 20% or below, otherwise the bar's foreground. */
export function batteryAppearance(level: number, charging: boolean) {
  const tone: "charging" | "low" | "normal" = charging
    ? "charging"
    : level <= 0.2
      ? "low"
      : "normal";
  // iOS keeps a sliver of fill visible at the bottom of the range.
  return { fill: Math.min(1, Math.max(0.06, level)), tone };
}
