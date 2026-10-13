package expo.modules.t3backgroundrefresh

import android.app.ActivityManager
import android.app.usage.UsageStatsManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Owns the background refresh schedule. One unique periodic WorkManager job,
 * re-armed with KEEP on every app start, runs [BackgroundRefreshWorker], which
 * starts the JS refresh as a headless task and always reports success. The
 * schedule therefore never depends on how, or whether, the JS run settles.
 */
object BackgroundRefresh {
  /** The key `AppRegistry.registerHeadlessTask` uses in index.ts. */
  const val TASK_KEY = "T3BackgroundRefresh"
  private const val TAG = "T3BackgroundRefresh"
  private const val PERIODIC_WORK = "t3.background-refresh"
  private const val ONE_SHOT_WORK = "t3.background-refresh.now"
  private const val STORE = "t3-background-refresh"

  // WorkManager's floor for periodic work; Android picks the real cadence.
  private const val INTERVAL_MINUTES = 15L

  // React marks the JS task finished after this, settled or not.
  private const val JS_TIMEOUT_MS = 50_000L

  // The worker returns after this whatever JS is doing.
  const val HARD_TIMEOUT_MS = 60_000L

  private const val STATUS_TIMEOUT_MS = 2_000L

  fun setEnabled(context: Context, enabled: Boolean) {
    val prefs = prefs(context)
    val editor = prefs.edit().putBoolean("enabled", enabled)
    if (enabled && !prefs.getBoolean("enabled", false)) {
      editor.putLong("armedAt", System.currentTimeMillis())
    }
    editor.apply()
    if (enabled) {
      arm(context)
    } else {
      WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
    }
  }

  /** Called on every module creation, so a force stop or a crashed JS launch still re-arms. */
  fun rearm(context: Context) {
    if (prefs(context).getBoolean("enabled", false)) arm(context)
  }

  private fun arm(context: Context) {
    val request = PeriodicWorkRequest.Builder(
      BackgroundRefreshWorker::class.java,
      INTERVAL_MINUTES,
      TimeUnit.MINUTES
    ).setConstraints(constraints()).build()
    // KEEP leaves an armed schedule's next run where it is.
    WorkManager.getInstance(context)
      .enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
  }

  /** Runs the same worker once, so Diagnostics can prove the native path on a real phone. */
  fun runNow(context: Context) {
    val request = OneTimeWorkRequest.Builder(BackgroundRefreshWorker::class.java)
      .setConstraints(constraints())
      .build()
    WorkManager.getInstance(context)
      .enqueueUniqueWork(ONE_SHOT_WORK, ExistingWorkPolicy.REPLACE, request)
  }

  private fun constraints() = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .build()

  fun saveRecord(context: Context, json: String) {
    prefs(context).edit().putString("record", json).apply()
  }

  fun recordStart(context: Context) {
    prefs(context).edit().putLong("lastStartedAt", System.currentTimeMillis()).apply()
  }

  fun recordFinish(context: Context, outcome: String) {
    prefs(context).edit()
      .putLong("lastFinishedAt", System.currentTimeMillis())
      .putString("lastOutcome", outcome)
      .apply()
  }

  /** Everything the Settings row and Diagnostics need, read in one call off the JS thread. */
  fun status(context: Context): Map<String, Any?> {
    val prefs = prefs(context)
    val workState = try {
      WorkManager.getInstance(context)
        .getWorkInfosForUniqueWork(PERIODIC_WORK)
        .get(STATUS_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .firstOrNull()
        ?.state
        ?.name
    } catch (error: Exception) {
      Log.w(TAG, "Could not read the background refresh schedule", error)
      null
    }
    val power = context.getSystemService(PowerManager::class.java)
    return mapOf(
      "enabled" to prefs.getBoolean("enabled", false),
      "armedAtMs" to prefs.millis("armedAt"),
      "workState" to workState,
      "lastStartedAtMs" to prefs.millis("lastStartedAt"),
      "lastFinishedAtMs" to prefs.millis("lastFinishedAt"),
      "lastOutcome" to prefs.getString("lastOutcome", null),
      "record" to prefs.getString("record", null),
      "ignoringBatteryOptimizations" to
        (power?.isIgnoringBatteryOptimizations(context.packageName) ?: true),
      "backgroundRestricted" to isBackgroundRestricted(context),
      "standbyBucket" to standbyBucket(context)
    )
  }

  private fun isBackgroundRestricted(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      context.getSystemService(ActivityManager::class.java)?.isBackgroundRestricted == true

  private fun standbyBucket(context: Context): Int? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      context.getSystemService(UsageStatsManager::class.java)?.appStandbyBucket
    } else {
      null
    }

  /**
   * Opens the per-app exemption dialog. "Restricted" background usage is a
   * different switch on the app's own settings page, so that case goes there.
   * Some OEM builds hide the dialog; the optimisation list is the fallback.
   */
  fun requestUnrestrictedBattery(context: Context) {
    val packageUri = Uri.parse("package:${context.packageName}")
    val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
    val candidates = if (isBackgroundRestricted(context)) {
      listOf(appDetails)
    } else {
      listOf(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
        appDetails
      )
    }
    for (intent in candidates) {
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return
      } catch (error: ActivityNotFoundException) {
        Log.i(TAG, "No activity for ${intent.action}: ${error.message}")
      } catch (error: SecurityException) {
        Log.i(TAG, "Not allowed to open ${intent.action}: ${error.message}")
      }
    }
  }

  /**
   * Starts the JS refresh in this process's React instance, booting one
   * without UI when the app is not running. [onFinish] gets null when the task
   * finished (or React timed it out) and a reason when it never started.
   */
  fun startHeadlessTask(context: Context, onFinish: (String?) -> Unit) {
    Handler(Looper.getMainLooper()).post {
      try {
        val host = (context.applicationContext as? ReactApplication)?.reactHost
        if (host == null) {
          onFinish("no React host")
          return@post
        }
        val current = host.currentReactContext
        if (current != null) {
          startTask(current, onFinish)
          return@post
        }
        host.addReactInstanceEventListener(object : ReactInstanceEventListener {
          override fun onReactContextInitialized(context: ReactContext) {
            host.removeReactInstanceEventListener(this)
            startTask(context, onFinish)
          }
        })
        host.start()
      } catch (error: Exception) {
        Log.w(TAG, "Could not start the React host", error)
        onFinish("could not start React: ${error.message}")
      }
    }
  }

  private fun startTask(reactContext: ReactContext, onFinish: (String?) -> Unit) {
    try {
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      val data = Arguments.createMap().apply { putString("trigger", "worker") }
      // Allowed in the foreground: a run that lands while the app is open joins
      // the open app's run instead of failing.
      val config = HeadlessJsTaskConfig(TASK_KEY, data, JS_TIMEOUT_MS, true)
      var startedTaskId = -1
      tasks.addTaskEventListener(object : HeadlessJsTaskEventListener {
        override fun onHeadlessJsTaskStart(taskId: Int) = Unit

        override fun onHeadlessJsTaskFinish(taskId: Int) {
          // Finish events are posted to the UI thread, so startedTaskId is set by now.
          if (taskId != startedTaskId) return
          tasks.removeTaskEventListener(this)
          onFinish(null)
        }
      })
      startedTaskId = tasks.startTask(config)
    } catch (error: Exception) {
      Log.w(TAG, "Could not start the headless refresh task", error)
      onFinish("could not start the task: ${error.message}")
    }
  }

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  private fun SharedPreferences.millis(key: String): Double? =
    getLong(key, 0L).takeIf { it > 0L }?.toDouble()
}

class BackgroundRefreshWorker(
  context: Context,
  params: WorkerParameters
) : Worker(context, params) {
  @Volatile private var finished: CountDownLatch? = null

  override fun doWork(): Result {
    val latch = CountDownLatch(1)
    finished = latch
    BackgroundRefresh.recordStart(applicationContext)
    var failure: String? = null
    val outcome = try {
      BackgroundRefresh.startHeadlessTask(applicationContext) { reason ->
        failure = reason
        latch.countDown()
      }
      when {
        !latch.await(BackgroundRefresh.HARD_TIMEOUT_MS, TimeUnit.MILLISECONDS) -> "timed out"
        isStopped -> "stopped by Android"
        else -> failure ?: "finished"
      }
    } catch (error: InterruptedException) {
      "interrupted: ${error.message}"
    }
    BackgroundRefresh.recordFinish(applicationContext, outcome)
    // Always success: a failed or retried result would only delay the next
    // periodic run, and the JS run has already recorded what went wrong.
    return Result.success()
  }

  override fun onStopped() {
    finished?.countDown()
  }
}
