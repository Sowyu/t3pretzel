package expo.modules.t3appupdater

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/**
 * Where PackageInstaller reports a session's outcome. A receiver rather than an
 * activity because a finished install has already killed the app: Android 14
 * refuses to start an activity for a process that has no visible window, but it
 * still delivers broadcasts and lets them post a notification.
 */
class T3AppUpdaterStatusReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, STATUS_MISSING)) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirmation = confirmationIntent(intent)
        if (confirmation == null) {
          // Nothing to show and nothing decided; treat it as a failure so the
          // app does not report a phantom success on the next launch.
          AppUpdater.recordFailure(context, status, "The system offered no install confirmation.")
          return
        }
        // The app is still in the foreground here: it just committed the session.
        context.startActivity(confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      PackageInstaller.STATUS_SUCCESS -> {
        // Runs in the freshly installed process. The notification is the path
        // that always works; the direct relaunch only succeeds where the
        // platform still allows a background start.
        AppUpdater.notifyInstalled(context)
        AppUpdater.relaunch(context)
      }
      else -> AppUpdater.recordFailure(
        context,
        status,
        intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
      )
    }
  }

  @Suppress("DEPRECATION")
  private fun confirmationIntent(intent: Intent): Intent? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_INTENT)
    }

  private companion object {
    /** No EXTRA_STATUS at all means something other than the installer sent this. */
    const val STATUS_MISSING = Int.MIN_VALUE
  }
}
