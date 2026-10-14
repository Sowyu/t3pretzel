package expo.modules.t3statusbar

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.SignalStrength
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.text.format.DateFormat
import android.view.View
import android.view.ViewTreeObserver
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.max

/**
 * Feeds the iOS status bar JS draws on Android: battery, Wi-Fi, cellular and
 * the clock format. Listeners run only while JS observes `onChange` and the
 * activity is in the foreground, and every change event re-reads the whole
 * state, so there is no polling.
 *
 * `setHidden(true)` keeps the system status bar hidden (a swipe still shows it
 * for a moment) and re-hides it on resume and window focus.
 */
class T3StatusBarModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // Main thread only.
  private var observing = false
  private var foreground = true
  private var listening = false
  private var hidden = false
  private var lastState: StatusBarState? = null
  private var clockRevision = 0
  private var focusView: View? = null
  private var telephonyCallback: Any? = null

  override fun definition() =
    ModuleDefinition {
      Name("T3StatusBar")
      Events("onChange")

      Function("getState") { readState().toMap() }

      /** Top strip height and the camera cutout's left and right edge, in dp. */
      Function("getMetrics") { readMetrics() }

      Function("setHidden") { value: Boolean ->
        main.post {
          hidden = value
          applyHidden()
        }
      }

      OnStartObserving("onChange") {
        main.post {
          observing = true
          updateListening()
        }
      }
      OnStopObserving("onChange") {
        main.post {
          observing = false
          updateListening()
        }
      }
      OnActivityEntersForeground {
        main.post {
          foreground = true
          updateListening()
          applyHidden()
        }
      }
      OnActivityEntersBackground {
        main.post {
          foreground = false
          updateListening()
        }
      }
      OnDestroy {
        main.post {
          observing = false
          hidden = false
          updateListening()
          applyHidden()
        }
      }
    }

  private fun readState(): StatusBarState {
    val ctx = context
    val battery = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val level =
      StatusBarSignals.batteryLevel(
        battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1,
        battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1,
      )
    // iOS draws the bolt whenever power is connected, full or not.
    val charging = (battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0

    var wifi = false
    var wifiRssi = StatusBarSignals.RSSI_UNSPECIFIED
    var cellularNetwork = false
    val connectivity = ctx.getSystemService(ConnectivityManager::class.java)
    try {
      @Suppress("DEPRECATION")
      for (network in connectivity?.allNetworks.orEmpty()) {
        val caps = connectivity?.getNetworkCapabilities(network) ?: continue
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
          wifi = true
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            wifiRssi = max(wifiRssi, caps.signalStrength)
          }
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) cellularNetwork = true
      }
    } catch (_: SecurityException) {
      // ACCESS_NETWORK_STATE is in the manifest; a missing grant draws no Wi-Fi.
    }

    // Phones drop mobile data on Wi-Fi, so a registered radio also counts as cellular, like iOS.
    var cellular = cellularNetwork
    var cellularBars = 4
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val signal =
        try {
          ctx.getSystemService(TelephonyManager::class.java)?.signalStrength
        } catch (_: SecurityException) {
          null
        }
      if (signal != null && signal.cellSignalStrengths.isNotEmpty()) {
        cellular = true
        cellularBars = StatusBarSignals.cellularBars(signal.level)
      }
    }

    return StatusBarState(
      batteryLevel = level,
      charging = charging,
      wifi = wifi,
      wifiBars = StatusBarSignals.wifiBars(wifiRssi),
      cellular = cellular,
      cellularBars = cellularBars,
      use24Hour = DateFormat.is24HourFormat(ctx),
      clockRevision = clockRevision,
    )
  }

  private fun readMetrics(): Map<String, Any?> {
    val window = appContext.currentActivity?.window
    val decor = window?.decorView
    val raw = decor?.rootWindowInsets
    val density = context.resources.displayMetrics.density
    if (decor == null || raw == null) return mapOf("top" to 0.0, "cutoutLeft" to null, "cutoutRight" to null)
    val insets = WindowInsetsCompat.toWindowInsetsCompat(raw, decor)
    val top =
      max(
        insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.statusBars()).top,
        insets.getInsets(WindowInsetsCompat.Type.displayCutout()).top,
      )
    // A cutout touching the top edge but narrower than the screen is the camera hole.
    val cutout =
      insets.displayCutout?.boundingRects?.firstOrNull {
        it.top <= 0 && it.width() < decor.width / 2
      }
    return mapOf(
      "top" to top / density.toDouble(),
      "cutoutLeft" to cutout?.let { it.left / density.toDouble() },
      "cutoutRight" to cutout?.let { it.right / density.toDouble() },
    )
  }

  private fun emitIfChanged() {
    if (!listening) return
    val next =
      try {
        readState()
      } catch (_: Exception) {
        return
      }
    if (next == lastState) return
    lastState = next
    sendEvent("onChange", next.toMap())
  }

  private val receiver =
    object : BroadcastReceiver() {
      override fun onReceive(
        context: Context,
        intent: Intent,
      ) {
        if (intent.action != Intent.ACTION_BATTERY_CHANGED) clockRevision += 1
        emitIfChanged()
      }
    }

  private val networkCallback =
    object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) = post()

      override fun onLost(network: Network) = post()

      override fun onCapabilitiesChanged(
        network: Network,
        networkCapabilities: NetworkCapabilities,
      ) = post()

      private fun post() {
        main.post { emitIfChanged() }
      }
    }

  // Created on the main thread, which is where it delivers.
  @Suppress("DEPRECATION")
  private val phoneStateListener by lazy {
    object : PhoneStateListener() {
      @Deprecated("Deprecated in Java")
      override fun onSignalStrengthsChanged(signalStrength: SignalStrength?) = emitIfChanged()
    }
  }

  @SuppressLint("MissingPermission")
  private fun updateListening() {
    val ctx = appContext.reactContext ?: return
    val shouldListen = observing && foreground
    if (shouldListen == listening) return
    listening = shouldListen
    val connectivity = ctx.getSystemService(ConnectivityManager::class.java)
    val telephony = ctx.getSystemService(TelephonyManager::class.java)
    if (shouldListen) {
      val filter =
        IntentFilter().apply {
          addAction(Intent.ACTION_BATTERY_CHANGED)
          addAction(Intent.ACTION_TIME_CHANGED)
          addAction(Intent.ACTION_TIMEZONE_CHANGED)
        }
      ContextCompat.registerReceiver(ctx, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
      val request =
        NetworkRequest
          .Builder()
          .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
          .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
          .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
          .build()
      runCatching { connectivity?.registerNetworkCallback(request, networkCallback) }
      runCatching { registerSignalListener(telephony) }
      // Anything may have changed while nothing listened.
      emitIfChanged()
    } else {
      runCatching { ctx.unregisterReceiver(receiver) }
      runCatching { connectivity?.unregisterNetworkCallback(networkCallback) }
      runCatching { unregisterSignalListener(telephony) }
      lastState = null
    }
  }

  private fun registerSignalListener(telephony: TelephonyManager?) {
    telephony ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val callback =
        object : TelephonyCallback(), TelephonyCallback.SignalStrengthsListener {
          override fun onSignalStrengthsChanged(signalStrength: SignalStrength) = emitIfChanged()
        }
      telephony.registerTelephonyCallback(ContextCompat.getMainExecutor(context), callback)
      telephonyCallback = callback
    } else {
      @Suppress("DEPRECATION")
      telephony.listen(phoneStateListener, PhoneStateListener.LISTEN_SIGNAL_STRENGTHS)
    }
  }

  private fun unregisterSignalListener(telephony: TelephonyManager?) {
    telephony ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (telephonyCallback as? TelephonyCallback)?.let { telephony.unregisterTelephonyCallback(it) }
      telephonyCallback = null
    } else {
      @Suppress("DEPRECATION")
      telephony.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE)
    }
  }

  private val focusListener =
    ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
      if (hasFocus) applyHidden()
    }

  private fun applyHidden() {
    val window = appContext.currentActivity?.window
    val decor = window?.decorView
    if (focusView !== decor || !hidden) {
      focusView?.viewTreeObserver?.takeIf { it.isAlive }?.removeOnWindowFocusChangeListener(focusListener)
      focusView = null
    }
    if (!hidden || window == null || decor == null) return
    if (focusView == null) {
      decor.viewTreeObserver.addOnWindowFocusChangeListener(focusListener)
      focusView = decor
    }
    WindowInsetsControllerCompat(window, decor).run {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.statusBars())
    }
  }
}
