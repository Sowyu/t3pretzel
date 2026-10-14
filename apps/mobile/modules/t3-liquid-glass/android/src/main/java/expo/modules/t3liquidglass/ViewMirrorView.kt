package expo.modules.t3liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Draws another on-screen view in place, like the lifted row of an iOS
 * long-press context menu. The source is a React view tag.
 *
 * It records the source once. The source's children draw as references to
 * their own RenderNodes, so when a child redraws (a pressed highlight fading)
 * the mirror shows it without re-recording. The source must not draw anything
 * itself that changes; an anchor wrapper without a background is ideal.
 */
@SuppressLint("ViewConstructor")
class ViewMirrorView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var source: View? = null

  var sourceTag = -1
    set(value) {
      if (field != value) {
        field = value
        source = null
        invalidate()
      }
    }

  init {
    setWillNotDraw(false)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      MeasureSpec.getSize(widthMeasureSpec),
      MeasureSpec.getSize(heightMeasureSpec),
    )
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit

  private fun resolveSource(): View? {
    source?.let { return it }
    if (sourceTag < 0) return null
    val view = runCatching { appContext.findView<View>(sourceTag) }.getOrNull()
    source = view
    return view
  }

  override fun onDraw(canvas: Canvas) {
    val view = resolveSource() ?: return
    if (!view.isAttachedToWindow || view === this) return
    view.draw(canvas)
  }
}
