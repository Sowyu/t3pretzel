package expo.modules.t3liquidglass

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class T3LiquidGlassModule : Module() {
  private var powerSaveReceiver: BroadcastReceiver? = null

  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  private fun systemState(): Map<String, Any> {
    val powerSave =
      (context?.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true
    return mapOf(
      "tier" to GlassTier.select(Build.VERSION.SDK_INT, powerSave).jsValue,
      "powerSaveMode" to powerSave,
    )
  }

  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlass")

    Events("onSystemStateChange")

    /** The tier the device allows right now, before the user setting. */
    Function("getSystemState") { systemState() }

    OnStartObserving("onSystemStateChange") {
      val context = context ?: return@OnStartObserving
      if (powerSaveReceiver != null) return@OnStartObserving
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          sendEvent("onSystemStateChange", systemState())
        }
      }
      val filter = IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
      powerSaveReceiver = receiver
    }

    OnStopObserving("onSystemStateChange") {
      powerSaveReceiver?.let { context?.unregisterReceiver(it) }
      powerSaveReceiver = null
    }

    View(GlassBackdropView::class) {
      Name("T3GlassBackdrop")
    }

    View(LiquidGlassView::class) {
      Name("T3LiquidGlassView")
      Events("onTabSelect")
      Prop("shape") { view: LiquidGlassView, value: String ->
        view.shape = GlassShape.parse(value)
      }
      Prop("cornerRadius") { view: LiquidGlassView, value: Double ->
        view.cornerRadiusDp = value.toFloat()
      }
      Prop("tintColor") { view: LiquidGlassView, value: Double ->
        view.tintColor = value.toLong().toInt()
      }
      Prop("fallbackColor") { view: LiquidGlassView, value: Double ->
        view.fallbackColor = value.toLong().toInt()
      }
      Prop("dark") { view: LiquidGlassView, value: Boolean ->
        view.dark = value
      }
      Prop("blurRadius") { view: LiquidGlassView, value: Double ->
        view.blurRadiusDp = value.toFloat()
      }
      Prop("interactive") { view: LiquidGlassView, value: Boolean ->
        view.interactive = value
      }
      Prop("tabCount") { view: LiquidGlassView, value: Int ->
        view.tabCount = value
      }
      Prop("selectedTab") { view: LiquidGlassView, value: Int ->
        view.selectedTab = value
      }
      Prop("edgeFadeStart") { view: LiquidGlassView, value: Double ->
        view.edgeFadeStart = value.toFloat()
      }
      Prop("tabInset") { view: LiquidGlassView, value: Double ->
        view.tabInsetDp = value.toFloat()
      }
    }

    View(LiquidToggleView::class) {
      Name("T3LiquidToggle")
      Events("onValueChange")
      Prop("value") { view: LiquidToggleView, value: Boolean ->
        view.value = value
      }
      Prop("enabled") { view: LiquidToggleView, value: Boolean ->
        view.toggleEnabled = value
      }
      Prop("onTrackColor") { view: LiquidToggleView, value: Double ->
        view.onTrackColor = value.toLong().toInt()
      }
      Prop("offTrackColor") { view: LiquidToggleView, value: Double ->
        view.offTrackColor = value.toLong().toInt()
      }
      Prop("dark") { view: LiquidToggleView, value: Boolean ->
        view.dark = value
      }
    }
  }
}
