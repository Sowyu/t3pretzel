package expo.modules.t3liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.os.Build
import android.view.View
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * The backdrop source. Wrap the content that scrolls under glass in it. While
 * any glass samples it, each draw records the whole subtree (background
 * included) once into [content] and draws that node; every glass consumer
 * then draws the same node, translated, under its own RenderEffect.
 *
 * Recording only stores references to the children's existing RenderNodes, so
 * a frame costs a handful of display-list ops, not a second traversal. With no
 * consumers it draws exactly like a plain view.
 *
 * A glass element never samples a backdrop that contains it; see
 * LiquidGlassView.findSource.
 */
@SuppressLint("ViewConstructor")
class GlassBackdropView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val consumers = ArrayList<LiquidGlassView>(4)
  // Typed through our own API-31 class so API 24-28 never sees RenderNode in a signature.
  private var recording: BackdropRecording? = null

  /**
   * Marks every glass that samples this backdrop for a re-record when anything
   * inside changes. A descendant redraw updates its own RenderNode without
   * re-running this view's draw(), so the glass effect nodes are re-recorded
   * in their onPreDraw (a few display-list ops). Narrowing this to glass whose
   * area the change touches saved nothing measurable: HWUI redraws every glass
   * layer each frame anyway (see GlassRenderer).
   */
  override fun onDescendantInvalidated(child: View, target: View) {
    super.onDescendantInvalidated(child, target)
    for (index in consumers.indices) consumers[index].markContentDirty()
  }

  /** True once [content] holds a recording consumers can draw. */
  internal var hasContent = false
    private set

  internal val content: BackdropRecording?
    get() = recording

  init {
    // ViewGroups skip draw() by default; the background must be recorded too.
    setWillNotDraw(false)
  }

  // Fabric lays out the RN children. ExpoView is a LinearLayout, so letting
  // its measure/layout run would stack the children in a row and push all
  // but the first out of the bounds.
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      MeasureSpec.getSize(widthMeasureSpec),
      MeasureSpec.getSize(heightMeasureSpec),
    )
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit

  override fun draw(canvas: Canvas) {
    val recording = recording
    if (recording == null || consumers.isEmpty() || !canvas.isHardwareAccelerated ||
      Build.VERSION.SDK_INT < GlassTier.RENDER_EFFECT_SDK
    ) {
      super.draw(canvas)
      return
    }
    recordAndDraw(recording, canvas)
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun recordAndDraw(content: BackdropRecording, canvas: Canvas) {
    val node = content.node
    node.setPosition(0, 0, width, height)
    val recording = node.beginRecording(width, height)
    try {
      super.draw(recording)
    } finally {
      node.endRecording()
    }
    hasContent = true
    canvas.drawRenderNode(node)
    for (index in consumers.indices) consumers[index].onSourceRecorded()
  }

  internal fun addConsumer(consumer: LiquidGlassView) {
    if (Build.VERSION.SDK_INT < GlassTier.RENDER_EFFECT_SDK || consumers.contains(consumer)) return
    if (recording == null) recording = BackdropRecording()
    consumers.add(consumer)
    // The next frame records the content the new consumer needs.
    if (consumers.size == 1) invalidate()
  }

  internal fun removeConsumer(consumer: LiquidGlassView) {
    if (!consumers.remove(consumer) || consumers.isNotEmpty()) return
    releaseContent()
    // Back to drawing children directly.
    invalidate()
  }

  /** True if a glass sampling this backdrop sits inside `view`. */
  internal fun hasConsumerInside(view: View): Boolean {
    for (index in consumers.indices) {
      var parent = consumers[index].parent
      while (parent is View) {
        if (parent === view) return true
        parent = parent.parent
      }
    }
    return false
  }

  private fun releaseContent() {
    hasContent = false
    if (Build.VERSION.SDK_INT >= GlassTier.RENDER_EFFECT_SDK) recording?.node?.discardDisplayList()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    GlassSources.bumpGeneration()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    for (index in consumers.indices.reversed()) consumers[index].onSourceLost(this)
    consumers.clear()
    releaseContent()
    GlassSources.bumpGeneration()
  }
}

/**
 * Glass views re-run the source search only when a backdrop attached or
 * detached since their last search, so the tree walk never runs per frame.
 */
internal object GlassSources {
  var generation = 0
    private set

  fun bumpGeneration() {
    generation++
  }
}
