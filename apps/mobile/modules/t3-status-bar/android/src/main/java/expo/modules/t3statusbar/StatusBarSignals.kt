package expo.modules.t3statusbar

/** What the drawn iOS status bar shows. JS formats and draws it; equal states are not re-sent. */
internal data class StatusBarState(
  val batteryLevel: Double,
  val charging: Boolean,
  val wifi: Boolean,
  val wifiBars: Int,
  val cellular: Boolean,
  val cellularBars: Int,
  val use24Hour: Boolean,
  /** Bumps when the system clock or time zone changes, so JS re-reads the time. */
  val clockRevision: Int,
) {
  fun toMap() =
    mapOf(
      "batteryLevel" to batteryLevel,
      "charging" to charging,
      "wifi" to wifi,
      "wifiBars" to wifiBars,
      "cellular" to cellular,
      "cellularBars" to cellularBars,
      "use24Hour" to use24Hour,
      "clockRevision" to clockRevision,
    )
}

internal object StatusBarSignals {
  /** NetworkCapabilities.SIGNAL_STRENGTH_UNSPECIFIED. */
  const val RSSI_UNSPECIFIED = Int.MIN_VALUE

  /** ACTION_BATTERY_CHANGED level and scale as 0..1. A missing reading draws a full battery. */
  fun batteryLevel(level: Int, scale: Int): Double =
    if (level < 0 || scale <= 0) 1.0 else (level.toDouble() / scale).coerceIn(0.0, 1.0)

  /** The iOS Wi-Fi fan has three arcs. Unknown strength draws all three. */
  fun wifiBars(rssi: Int): Int =
    when {
      rssi == RSSI_UNSPECIFIED -> 3
      rssi >= -65 -> 3
      rssi >= -75 -> 2
      else -> 1
    }

  /** SignalStrength.getLevel() is 0..4, the same as the four iOS bars. */
  fun cellularBars(level: Int): Int = level.coerceIn(0, 4)
}
