package expo.modules.t3appupdater

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.pm.PackageManager.PERMISSION_GRANTED
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.content.SharedPreferences
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.io.File
import java.security.MessageDigest

/**
 * Sideloads a nightly APK over the running install and remembers what it was
 * trying to install, because a successful commit kills this process before the
 * JavaScript side can hear about it. The record is read back on the next launch
 * (see [consumePendingUpdateResult]).
 */
internal object AppUpdater {
  private const val PREFERENCES = "t3-app-updater"
  private const val KEY_COMMIT = "pending.commit"
  private const val KEY_SHA256 = "pending.sha256"
  private const val KEY_STARTED_AT = "pending.startedAt"
  private const val KEY_FAILURE_STATUS = "pending.failureStatus"
  private const val KEY_FAILURE_MESSAGE = "pending.failureMessage"
  private const val WRITE_NAME = "t3code-update.apk"
  private const val BUFFER_BYTES = 1 shl 16
  private const val HEX_DIGITS = "0123456789abcdef"
  private const val NOTIFICATION_CHANNEL = "t3-app-updater"
  private const val NOTIFICATION_ID = 0x7431
  private const val SHORT_COMMIT_LENGTH = 7

  /** GET_SIGNING_CERTIFICATES arrived in API 28; below it only GET_SIGNATURES exists. */
  private val signingFlags: Int
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      PackageManager.GET_SIGNING_CERTIFICATES
    } else {
      @Suppress("DEPRECATION")
      PackageManager.GET_SIGNATURES
    }

  fun installInfo(context: Context): Map<String, Any?> {
    val installed = installedPackageInfo(context)
    return mapOf(
      "packageName" to context.packageName,
      "versionName" to installed?.versionName,
      "versionCode" to (installed?.let(::versionCodeOf) ?: 0L),
      "signerSha256" to signerSha256(installed),
      "installerPackageName" to installerPackageName(context),
      "canRequestPackageInstalls" to canRequestPackageInstalls(context),
      "supportedAbis" to Build.SUPPORTED_ABIS.toList()
    )
  }

  /**
   * Hashes and parses a downloaded APK. The hash streams so a 100 MB APK never
   * lands in a byte array.
   */
  fun inspectApk(context: Context, path: String): Map<String, Any?> {
    val file = File(localPath(path))
    require(file.isFile) { "The downloaded update is no longer at $path." }
    val sha256 = sha256OfFile(file)
    val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, signingFlags)
      ?: error("The downloaded file is not a readable Android package.")
    val signer = signerSha256(archive)
    val installedSigner = signerSha256(installedPackageInfo(context))
    return mapOf(
      "sha256" to sha256,
      "packageName" to archive.packageName,
      "versionName" to archive.versionName,
      "versionCode" to versionCodeOf(archive),
      "signerSha256" to signer,
      "signerMatchesInstalled" to (signer != null && signer == installedSigner)
    )
  }

  fun openInstallPermissionSettings(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
      .setData(Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      context.startActivity(intent)
      true
    } catch (_: ActivityNotFoundException) {
      false
    }
  }

  @Suppress("TooGenericExceptionCaught") // Abandon the session before rethrowing.
  fun install(context: Context, path: String, expected: Map<String, String>) {
    val file = File(localPath(path))
    require(file.isFile) { "The downloaded update is no longer at $path." }
    val commit = expected["commit"]?.takeIf { it.isNotBlank() }
      ?: error("install() needs the commit the APK was built from.")
    val sha256 = expected["sha256"]?.takeIf { it.isNotBlank() }
      ?: error("install() needs the verified SHA-256 of the APK.")

    // A successful commit replaces this process without warning, so the record
    // has to be on disk before the session is handed to the system.
    writePendingUpdate(context, commit, sha256)

    val installer = context.packageManager.packageInstaller
    val sessionId = installer.createSession(sessionParams(context))
    try {
      commitSession(context, installer, sessionId, file)
    } catch (error: Exception) {
      installer.abandonSession(sessionId)
      clearPendingUpdate(context)
      throw error
    }
  }

  private fun commitSession(
    context: Context,
    installer: PackageInstaller,
    sessionId: Int,
    file: File
  ) {
    installer.openSession(sessionId).use { session ->
      session.openWrite(WRITE_NAME, 0, file.length()).use { output ->
        file.inputStream().use { input -> input.copyTo(output, BUFFER_BYTES) }
        session.fsync(output)
      }
      session.commit(statusIntentSender(context, sessionId))
    }
  }

  /**
   * The install this app last set out to do, if any, plus when the package was
   * last updated so the caller can tell "still installing" from "installed
   * something else". Reading does not clear: only a concluded record is dropped.
   */
  fun readPendingUpdate(context: Context): Map<String, Any?>? {
    val preferences = preferences(context)
    val commit = preferences.getString(KEY_COMMIT, null) ?: return null
    return buildMap<String, Any?> {
      put("commit", commit)
      put("sha256", preferences.getString(KEY_SHA256, null))
      put("startedAt", preferences.getLong(KEY_STARTED_AT, 0L))
      put("lastUpdateTime", installedPackageInfo(context)?.lastUpdateTime ?: 0L)
      if (preferences.contains(KEY_FAILURE_STATUS)) {
        put("failureStatus", preferences.getInt(KEY_FAILURE_STATUS, 0))
        put("failureMessage", preferences.getString(KEY_FAILURE_MESSAGE, null))
      }
    }
  }

  fun clearPendingUpdate(context: Context) {
    preferences(context).edit().clear().apply()
  }

  /** Called from the status receiver, which may run without the app's UI. */
  fun recordFailure(context: Context, status: Int, message: String?) {
    preferences(context).edit()
      .putInt(KEY_FAILURE_STATUS, status)
      .putString(KEY_FAILURE_MESSAGE, message)
      .apply()
  }

  private fun sessionParams(context: Context) =
    PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(context.packageName)
      // Only honored when this app already owns the install; otherwise the
      // system falls back to STATUS_PENDING_USER_ACTION, which is handled.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
    }

  private fun statusIntentSender(context: Context, sessionId: Int): IntentSender {
    val intent = Intent(context, T3AppUpdaterStatusReceiver::class.java)
    // MUTABLE: the system fills in EXTRA_STATUS and the confirmation intent.
    val flags = PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    return PendingIntent.getBroadcast(context, sessionId, intent, flags).intentSender
  }

  /** Best effort: Android 14 and later ignore this once the process has been replaced. */
  fun relaunch(context: Context) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    try {
      context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
      // The launcher activity is always present; nothing sensible to do otherwise.
    }
  }

  /** "Updated, tap to open" for the case where the relaunch above is blocked. */
  fun notifyInstalled(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (!canPostNotifications(context) || manager == null || launch == null) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        NOTIFICATION_CHANNEL,
        "App updates",
        NotificationManager.IMPORTANCE_DEFAULT
      )
      manager.createNotificationChannel(channel)
    }
    val open = PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val commit = preferences(context).getString(KEY_COMMIT, null)?.take(SHORT_COMMIT_LENGTH)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, NOTIFICATION_CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }
    val notification = builder
      .setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentTitle(appLabel(context) + " updated")
      .setContentText(if (commit == null) "Tap to open." else "Updated to $commit. Tap to open.")
      .setContentIntent(open)
      .setAutoCancel(true)
      .build()
    manager.notify(NOTIFICATION_ID, notification)
  }

  /** Android 13 made notifications a runtime permission; posting without it is a silent drop. */
  private fun canPostNotifications(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
    val permission = android.Manifest.permission.POST_NOTIFICATIONS
    return context.checkSelfPermission(permission) == PERMISSION_GRANTED
  }

  private fun appLabel(context: Context): String =
    context.applicationInfo.loadLabel(context.packageManager).toString()

  private fun writePendingUpdate(context: Context, commit: String, sha256: String) {
    preferences(context).edit()
      .clear()
      .putString(KEY_COMMIT, commit)
      .putString(KEY_SHA256, sha256)
      .putLong(KEY_STARTED_AT, System.currentTimeMillis())
      .commit()
  }

  private fun preferences(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun installedPackageInfo(context: Context): PackageInfo? = try {
    context.packageManager.getPackageInfo(context.packageName, signingFlags)
  } catch (_: PackageManager.NameNotFoundException) {
    null
  }

  @Suppress("DEPRECATION")
  private fun signerSha256(packageInfo: PackageInfo?): String? {
    if (packageInfo == null) return null
    val signature = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageInfo.signingInfo?.apkContentsSigners?.firstOrNull()
    } else {
      packageInfo.signatures?.firstOrNull()
    }
    return signature?.let { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }
  }

  @Suppress("DEPRECATION")
  private fun versionCodeOf(packageInfo: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageInfo.longVersionCode
    } else {
      packageInfo.versionCode.toLong()
    }

  @Suppress("DEPRECATION")
  private fun installerPackageName(context: Context): String? = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
    } else {
      context.packageManager.getInstallerPackageName(context.packageName)
    }
  } catch (_: PackageManager.NameNotFoundException) {
    null
  }

  private fun canRequestPackageInstalls(context: Context): Boolean {
    // Before API 26 the install-unknown-apps grant was a global setting, not per app.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    return context.packageManager.canRequestPackageInstalls()
  }

  private fun sha256OfFile(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(BUFFER_BYTES)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return hex(digest.digest())
  }

  private fun hex(bytes: ByteArray): String = buildString(bytes.size * 2) {
    for (byte in bytes) {
      val value = byte.toInt() and 0xff
      append(HEX_DIGITS[value ushr 4])
      append(HEX_DIGITS[value and 0x0f])
    }
  }

  /** expo-file-system hands JavaScript `file://` URIs; PackageManager wants a path. */
  private fun localPath(path: String): String =
    if (path.startsWith("file://")) Uri.parse(path).path ?: path else path
}
