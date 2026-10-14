package expo.modules.t3statusbar

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusBarSignalsTest {
  @Test
  fun batteryLevelIsAFractionAndDefaultsToFull() {
    assertEquals(0.2, StatusBarSignals.batteryLevel(20, 100), 1e-9)
    assertEquals(0.5, StatusBarSignals.batteryLevel(50, 100), 1e-9)
    assertEquals(1.0, StatusBarSignals.batteryLevel(-1, 100), 1e-9)
    assertEquals(1.0, StatusBarSignals.batteryLevel(50, 0), 1e-9)
    assertEquals(1.0, StatusBarSignals.batteryLevel(120, 100), 1e-9)
  }

  @Test
  fun wifiBarsFollowRssi() {
    assertEquals(3, StatusBarSignals.wifiBars(StatusBarSignals.RSSI_UNSPECIFIED))
    assertEquals(3, StatusBarSignals.wifiBars(-50))
    assertEquals(2, StatusBarSignals.wifiBars(-70))
    assertEquals(1, StatusBarSignals.wifiBars(-90))
  }

  @Test
  fun cellularBarsClampToFour() {
    assertEquals(0, StatusBarSignals.cellularBars(-1))
    assertEquals(2, StatusBarSignals.cellularBars(2))
    assertEquals(4, StatusBarSignals.cellularBars(9))
  }
}
