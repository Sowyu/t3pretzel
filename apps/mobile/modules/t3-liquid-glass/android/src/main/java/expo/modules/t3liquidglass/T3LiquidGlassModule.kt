package expo.modules.t3liquidglass

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class T3LiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlass")

    /** The tier this device can draw, before the user setting. Fixed per device. */
    Function("getTier") { GlassTier.select(Build.VERSION.SDK_INT).jsValue }

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
