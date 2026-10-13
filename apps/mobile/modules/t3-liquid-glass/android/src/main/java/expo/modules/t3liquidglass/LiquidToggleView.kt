package expo.modules.t3liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.view.MotionEvent
import android.view.ViewConfiguration
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs

/**
 * Kyant's LiquidToggle as an iOS 26 switch: a 63x28dp track with a 37x24dp
 * thumb. Pressing swells the thumb into a clear lens over the track (API 33+);
 * it can be dragged, and a tap toggles. The view is larger than the track so
 * the touch target reaches 48dp; the track is centered in it.
 *
 * Animates only while touched or settling. The JS wrapper owns accessibility.
 */
@SuppressLint("ViewConstructor")
class LiquidToggleView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val density = resources.displayMetrics.density
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private val lens: IndicatorLens? =
    if (Build.VERSION.SDK_INT >= GlassTier.RUNTIME_SHADER_SDK) IndicatorLens() else null

  private val onValueChange by EventDispatcher()

  private var hasValue = false
  var value = false
    set(next) {
      if (hasValue && field == next) return
      field = next
      val target = if (next) 1f else 0f
      if (!hasValue || !isAttachedToWindow) {
        hasValue = true
        fraction.snapTo(target)
        invalidate()
      } else if (!touching && fraction.target != target) {
        // Kyant's animateToValue: press, slide, release once close.
        press()
        fraction.animateTo(target)
        releaseWhenSettled = true
        startAnimating()
      }
    }
  var toggleEnabled = true
  var onTrackColor = Color.rgb(52, 199, 89)
    set(next) {
      field = next
      invalidate()
    }
  var offTrackColor = Color.argb(41, 120, 120, 128)
    set(next) {
      field = next
      invalidate()
    }
  var dark = false
    set(next) {
      if (field != next) {
        field = next
        lensConfigured = false
        invalidate()
      }
    }

  // Kyant DampedDragAnimation specs.
  private val fraction = GlassSpring(1f, 1000f, 0.001f)
  private val pressProgress = GlassSpring(1f, 1000f, 0.001f)
  private val scaleX = GlassSpring(0.6f, 250f, 0.001f, 1f)
  private val scaleY = GlassSpring(0.7f, 250f, 0.001f, 1f)
  private val thumbTransform = PressTransform()
  private var releaseWhenSettled = false

  private var touching = false
  private var dragged = false
  private var downX = 0f
  private var downFraction = 0f

  private val trackRect = RectF()
  private val thumbRect = RectF()
  private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
  private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var lensConfigured = false

  private var animating = false
  private var lastFrameNanos = 0L
  private val frameCallback = Runnable { onAnimationFrame() }

  init {
    setWillNotDraw(false)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    lensConfigured = false
  }

  override fun onDetachedFromWindow() {
    stopAnimations()
    lens?.release()
    super.onDetachedFromWindow()
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility != VISIBLE) stopAnimations()
  }

  // region Drawing

  private fun layoutTrack() {
    val trackWidth = TRACK_WIDTH * density
    val trackHeight = TRACK_HEIGHT * density
    val left = (width - trackWidth) / 2f
    val top = (height - trackHeight) / 2f
    trackRect.set(left, top, left + trackWidth, top + trackHeight)
    val inset = (TRACK_HEIGHT - THUMB_HEIGHT) / 2f * density
    val travel = trackWidth - THUMB_WIDTH * density - inset * 2f
    val thumbLeft = left + inset + fraction.value.coerceIn(0f, 1f) * travel
    thumbRect.set(thumbLeft, top + inset, thumbLeft + THUMB_WIDTH * density, top + inset + THUMB_HEIGHT * density)
  }

  override fun onDraw(canvas: Canvas) {
    layoutTrack()
    val lens = lens
    val progress = pressProgress.value
    if (lens != null && progress > 0f && canvas.isHardwareAccelerated) {
      if (!lensConfigured) {
        lens.configure(
          thumbRect.width().toInt(),
          thumbRect.height().toInt(),
          density,
          if (dark) 0.42f else 0.75f,
          refractionHeightDp = 5f,
          refractionAmountDp = 10f,
        )
        lensConfigured = true
      }
      val track = lens.beginBar(width, height)
      drawTrack(track)
      drawThumbShadow(track, 1f - progress)
      lens.endBar(canvas, thumbRect, thumbTransform, progress)
    } else {
      drawTrack(canvas)
      drawThumbShadow(canvas, 1f - progress)
    }
    drawThumb(canvas, 1f - progress)
  }

  private fun drawTrack(canvas: Canvas) {
    trackPaint.color = lerpColor(offTrackColor, onTrackColor, fraction.value.coerceIn(0f, 1f))
    val radius = trackRect.height() / 2f
    canvas.drawRoundRect(trackRect, radius, radius, trackPaint)
  }

  private fun drawThumbShadow(canvas: Canvas, alpha: Float) {
    if (alpha <= 0f) return
    shadowPaint.color = Color.TRANSPARENT
    shadowPaint.setShadowLayer(3f * density, 0f, 1.5f * density, Color.argb((40 * alpha).toInt(), 0, 0, 0))
    withThumbTransform(canvas) {
      val radius = thumbRect.height() / 2f
      canvas.drawRoundRect(thumbRect, radius, radius, shadowPaint)
    }
  }

  private fun drawThumb(canvas: Canvas, alpha: Float) {
    if (alpha <= 0f) return
    thumbPaint.alpha = (255 * alpha).toInt()
    withThumbTransform(canvas) {
      val radius = thumbRect.height() / 2f
      canvas.drawRoundRect(thumbRect, radius, radius, thumbPaint)
    }
  }

  private inline fun withThumbTransform(canvas: Canvas, block: () -> Unit) {
    val save = canvas.save()
    canvas.scale(thumbTransform.scaleX, thumbTransform.scaleY, thumbRect.centerX(), thumbRect.centerY())
    block()
    canvas.restoreToCount(save)
  }

  // endregion

  // region Touch

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!toggleEnabled) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        touching = true
        dragged = false
        downX = event.x
        downFraction = fraction.target
        press()
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.x - downX
        if (!dragged && abs(dx) > touchSlop) {
          dragged = true
          parent?.requestDisallowInterceptTouchEvent(true)
        }
        if (dragged) {
          fraction.animateTo((downFraction + dx / (DRAG_WIDTH * density)).coerceIn(0f, 1f))
          startAnimating()
        }
      }
      MotionEvent.ACTION_UP -> {
        touching = false
        val next = if (dragged) fraction.target >= 0.5f else !value
        fraction.animateTo(if (next) 1f else 0f)
        releaseWhenSettled = true
        startAnimating()
        if (next != value) onValueChange(mapOf("value" to next))
      }
      MotionEvent.ACTION_CANCEL -> {
        touching = false
        fraction.animateTo(if (value) 1f else 0f)
        releaseWhenSettled = true
        startAnimating()
      }
    }
    return true
  }

  private fun press() {
    releaseWhenSettled = false
    pressProgress.animateTo(1f)
    scaleX.animateTo(PRESSED_SCALE)
    scaleY.animateTo(PRESSED_SCALE)
    startAnimating()
  }

  private fun release() {
    pressProgress.animateTo(0f)
    scaleX.animateTo(1f)
    scaleY.animateTo(1f)
  }

  // endregion

  // region Animation

  private fun startAnimating() {
    if (animating || !isAttachedToWindow) return
    animating = true
    lastFrameNanos = System.nanoTime()
    postOnAnimation(frameCallback)
  }

  private fun onAnimationFrame() {
    if (!animating) return
    val now = System.nanoTime()
    val dt = ((now - lastFrameNanos) / 1e9f).coerceIn(0f, 1f / 20f)
    lastFrameNanos = now
    var moving = fraction.step(dt)
    if (releaseWhenSettled && !touching && abs(fraction.value - fraction.target) < 0.025f) {
      releaseWhenSettled = false
      release()
    }
    moving = pressProgress.step(dt) || moving
    moving = scaleX.step(dt) || moving
    moving = scaleY.step(dt) || moving
    GlassGeometry.indicatorStretch(thumbTransform, scaleX.value, scaleY.value, fraction.velocity / 5f)
    invalidate()
    if (moving || releaseWhenSettled) {
      postOnAnimation(frameCallback)
    } else {
      animating = false
    }
  }

  private fun stopAnimations() {
    if (animating) removeCallbacks(frameCallback)
    animating = false
    touching = false
    releaseWhenSettled = false
    fraction.snapTo(if (value) 1f else 0f)
    pressProgress.snapTo(0f)
    scaleX.snapTo(1f)
    scaleY.snapTo(1f)
    thumbTransform.reset()
  }

  // endregion

  private companion object {
    const val TRACK_WIDTH = 63f
    const val TRACK_HEIGHT = 28f
    const val THUMB_WIDTH = 37f
    const val THUMB_HEIGHT = 24f
    const val DRAG_WIDTH = 22f
    const val PRESSED_SCALE = 1.5f

    fun lerpColor(from: Int, to: Int, fraction: Float): Int = Color.argb(
      (Color.alpha(from) + (Color.alpha(to) - Color.alpha(from)) * fraction).toInt(),
      (Color.red(from) + (Color.red(to) - Color.red(from)) * fraction).toInt(),
      (Color.green(from) + (Color.green(to) - Color.green(from)) * fraction).toInt(),
      (Color.blue(from) + (Color.blue(to) - Color.blue(from)) * fraction).toInt(),
    )
  }
}
