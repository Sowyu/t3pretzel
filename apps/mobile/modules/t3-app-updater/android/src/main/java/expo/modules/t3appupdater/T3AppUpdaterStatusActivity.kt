package expo.modules.t3appupdater

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Bundle

/**
 * Where PackageInstaller reports a session's outcome. Invisible on purpose: it
 * only forwards the system's install confirmation, then reopens the app so the
 * user lands back where they were instead of on an empty screen.
 *
 * `singleTop`, so the second status the installer sends after a confirmation
 * arrives through [onNewIntent] on this same instance.
 */
class T3AppUpdaterStatusActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleStatus(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleStatus(intent)
  }

  private fun handleStatus(intent: Intent?) {
    val status = intent?.getIntExtra(PackageInstaller.EXTRA_STATUS, STATUS_MISSING)
      ?: STATUS_MISSING
    when (status) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirmation = confirmationIntent(intent)
        if (confirmation == null) {
          // Nothing to show and nothing decided; treat it as a failure so the
          // app does not report a phantom success on the next launch.
          finishWithFailure(status, intent)
          return
        }
        // Stay alive: the installer delivers the real outcome to this instance
        // once the user accepts or dismisses the dialog.
        startActivity(confirmation)
      }
      PackageInstaller.STATUS_SUCCESS -> {
        // This runs in the freshly installed process; reopen the app for the user.
        relaunchApp()
        finish()
      }
      else -> finishWithFailure(status, intent)
    }
  }

  private fun finishWithFailure(status: Int, intent: Intent?) {
    AppUpdater.recordFailure(
      this,
      status,
      intent?.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
    )
    relaunchApp()
    finish()
  }

  private fun relaunchApp() {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  @Suppress("DEPRECATION")
  private fun confirmationIntent(intent: Intent?): Intent? = when {
    intent == null -> null
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
      intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
    else -> intent.getParcelableExtra(Intent.EXTRA_INTENT)
  }

  private companion object {
    /** No EXTRA_STATUS at all means something other than the installer started us. */
    const val STATUS_MISSING = Int.MIN_VALUE
  }
}
