package expo.modules.t3terminal

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TerminalInputTest {
  @Test
  fun appendsOnlyTheUnfedTail() {
    // Fed 0..10, window still starts at 0: feed from index 10.
    assertEquals(10, terminalFeedStart(10, "0:0", 0, 15, "0:0"))
    // Front trimmed: window now starts at 4, so the tail starts at index 6.
    assertEquals(6, terminalFeedStart(10, "0:0", 4, 11, "0:0"))
    // Nothing new.
    assertEquals(11, terminalFeedStart(15, "0:0", 4, 11, "0:0"))
  }

  @Test
  fun rebuildsOnResetOrGap() {
    assertNull(terminalFeedStart(10, "0:0", 0, 20, "0:1"))
    // Trimmed past what was fed: output was lost.
    assertNull(terminalFeedStart(10, "0:0", 12, 5, "0:0"))
    // Window ends before what was fed.
    assertNull(terminalFeedStart(10, "0:0", 0, 5, "0:0"))
  }

  @Test
  fun mapsHardwareKeys() {
    assertEquals("\u001B", terminalKeySequence(KeyEvent.KEYCODE_ESCAPE, false, false))
    assertEquals("\t", terminalKeySequence(KeyEvent.KEYCODE_TAB, false, false))
    assertEquals("\u001B[Z", terminalKeySequence(KeyEvent.KEYCODE_TAB, false, true))
    assertEquals("\u001B[A", terminalKeySequence(KeyEvent.KEYCODE_DPAD_UP, false, false))
    assertEquals("\u001B[D", terminalKeySequence(KeyEvent.KEYCODE_DPAD_LEFT, false, false))
    assertEquals("\u001B[H", terminalKeySequence(KeyEvent.KEYCODE_MOVE_HOME, false, false))
    assertEquals("\u001B[6~", terminalKeySequence(KeyEvent.KEYCODE_PAGE_DOWN, false, false))
    assertEquals("\u0003", terminalKeySequence(KeyEvent.KEYCODE_C, true, false))
    assertNull(terminalKeySequence(KeyEvent.KEYCODE_C, false, false))
  }
}
