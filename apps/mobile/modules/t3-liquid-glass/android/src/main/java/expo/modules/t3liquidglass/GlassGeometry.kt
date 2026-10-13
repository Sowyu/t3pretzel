package expo.modules.t3liquidglass

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

// Pure math shared by the views and the unit tests. No android.* imports, so
// the tests run on the plain JVM.

/** What the device can draw. JS adds the user setting on top. */
enum class GlassTier(val jsValue: String) {
  /** Blur, AGSL lens, rim and saturation in one RenderEffect chain. */
  FULL("full"),

  /** RenderEffect blur and saturation with a tint; no RuntimeShader before API 33. */
  BLUR("blur"),

  /** Today's opaque fill. */
  NONE("none");

  companion object {
    const val RUNTIME_SHADER_SDK = 33
    const val RENDER_EFFECT_SDK = 31

    fun select(sdk: Int): GlassTier = when {
      sdk >= RUNTIME_SHADER_SDK -> FULL
      sdk >= RENDER_EFFECT_SDK -> BLUR
      else -> NONE
    }
  }
}

enum class GlassShape {
  CIRCLE,
  CAPSULE,
  ROUNDED_RECT;

  companion object {
    fun parse(value: String?): GlassShape = when (value) {
      "circle" -> CIRCLE
      "capsule" -> CAPSULE
      else -> ROUNDED_RECT
    }
  }
}

/**
 * One corner of the glass as a superellipse: |x/extent|^exponent + |y/extent|^exponent = 1.
 * `outlineRadius` is the circular radius used where only round rects exist
 * (Outline clips, the API 31-32 path).
 */
data class GlassCorner(val extent: Float, val exponent: Float, val outlineRadius: Float)

data class GlassLens(
  val refractionHeight: Float,
  val refractionAmount: Float,
  val blurRadius: Float,
  val rimWidth: Float,
)

object GlassGeometry {
  /** iOS continuous corners start curving about 1.6r from the corner (60% smoothing). */
  const val CONTINUOUS_EXTENT = 1.6f

  /** Where a circular corner of radius r crosses the diagonal, as a fraction of r. */
  private const val CIRCLE_DIAGONAL_INSET = 0.29289322f // 1 - 1/sqrt(2)

  fun corner(shape: GlassShape, cornerRadius: Float, width: Float, height: Float): GlassCorner {
    val half = min(width, height) / 2f
    if (half <= 0f) return GlassCorner(0f, 2f, 0f)
    val radius = when (shape) {
      GlassShape.CIRCLE, GlassShape.CAPSULE -> half
      GlassShape.ROUNDED_RECT -> cornerRadius.coerceIn(0f, half)
    }
    if (radius < 0.5f) return GlassCorner(0f, 2f, 0f)
    val extent = min(radius * CONTINUOUS_EXTENT, half)
    // Pick the exponent that keeps the diagonal point where a circular corner
    // of the same radius puts it: 2 when extent == radius (capsules), ~3.4
    // for a full continuous corner.
    val exponent = (ln(2.0) / -ln(1.0 - CIRCLE_DIAGONAL_INSET * radius / extent)).toFloat()
    return GlassCorner(extent, exponent, radius)
  }

  /**
   * iOS 26 "regular" glass: a 14dp lens band (narrower on small controls so
   * the middle stays undistorted), a light blur and a hairline rim.
   */
  fun lens(density: Float, width: Float, height: Float, blurDp: Float): GlassLens {
    val half = min(width, height) / 2f
    val refractionHeight = min(14f * density, half * 0.7f)
    return GlassLens(
      refractionHeight = refractionHeight,
      refractionAmount = min(refractionHeight * 1.5f, half),
      blurRadius = blurDp * density,
      rimWidth = 1.25f * density,
    )
  }

  /** Signed distance to the superellipse-cornered rect, negative inside. Mirrors the AGSL. */
  fun signedDistance(x: Float, y: Float, width: Float, height: Float, corner: GlassCorner): Float {
    val hx = width / 2f
    val hy = height / 2f
    val cx = abs(x - hx) - (hx - corner.extent)
    val cy = abs(y - hy) - (hy - corner.extent)
    val qx = cx.coerceAtLeast(0f)
    val qy = cy.coerceAtLeast(0f)
    val outside = superellipseNorm(qx, qy, corner.exponent) - corner.extent
    val inside = min(maxOf(cx, cy), 0f)
    return outside + inside
  }

  private fun superellipseNorm(x: Float, y: Float, n: Float): Float {
    val m = maxOf(x, y)
    if (m <= 0f) return 0f
    val a = Math.pow((x / m).toDouble(), n.toDouble())
    val b = Math.pow((y / m).toDouble(), n.toDouble())
    return (m * Math.pow(a + b, 1.0 / n)).toFloat()
  }

  /** Kyant's rubber-band pull: linear near the start, capped at `maxOffset`. */
  fun dragTranslation(offset: Float, maxOffset: Float): Float =
    if (maxOffset <= 0f) 0f else maxOffset * tanh(0.05f * offset / maxOffset)

  /**
   * The press swell from Kyant's LiquidButton: grows by `swell` px on the short
   * side, and stretches along the drag direction by up to `swell` more.
   */
  fun pressTransform(
    out: PressTransform,
    width: Float,
    height: Float,
    progress: Float,
    offsetX: Float,
    offsetY: Float,
    swell: Float,
  ) {
    if (width <= 0f || height <= 0f) {
      out.reset()
      return
    }
    val minDimension = min(width, height)
    val maxDimension = maxOf(width, height)
    val scale = 1f + swell / minDimension * progress
    val maxDragScale = swell / minDimension
    val angle = atan2(offsetY, offsetX)
    out.translationX = dragTranslation(offsetX, minDimension)
    out.translationY = dragTranslation(offsetY, minDimension)
    out.scaleX = scale +
      maxDragScale * abs(cos(angle) * offsetX / maxDimension) * min(width / height, 1f)
    out.scaleY = scale +
      maxDragScale * abs(sin(angle) * offsetY / maxDimension) * min(height / width, 1f)
  }

  /** Squash-and-stretch of the tab indicator from its spring velocity (tabs per second). */
  fun indicatorStretch(out: PressTransform, scaleX: Float, scaleY: Float, velocity: Float) {
    val v = velocity / 10f
    out.scaleX = scaleX / (1f - (v * 0.75f).coerceIn(-0.2f, 0.2f))
    out.scaleY = scaleY * (1f - (v * 0.25f).coerceIn(-0.2f, 0.2f))
    out.translationX = 0f
    out.translationY = 0f
  }

  fun nearestTab(value: Float, count: Int): Int =
    if (count <= 0) 0 else value.roundToInt().coerceIn(0, count - 1)
}

class PressTransform {
  var scaleX = 1f
  var scaleY = 1f
  var translationX = 0f
  var translationY = 0f

  val isIdentity: Boolean
    get() = scaleX == 1f && scaleY == 1f && translationX == 0f && translationY == 0f

  fun reset() {
    scaleX = 1f
    scaleY = 1f
    translationX = 0f
    translationY = 0f
  }
}

/**
 * A damped spring with Compose's spring(dampingRatio, stiffness, threshold)
 * semantics, stepped by frame time. Settles exactly on the target so the
 * frame loop can stop.
 */
class GlassSpring(
  private val dampingRatio: Float,
  private val stiffness: Float,
  private val threshold: Float,
  initial: Float = 0f,
) {
  var value = initial
    private set
  var velocity = 0f
    private set
  var target = initial
    private set

  val isAtRest: Boolean get() = value == target && velocity == 0f

  fun animateTo(target: Float) {
    this.target = target
  }

  fun snapTo(value: Float) {
    this.value = value
    target = value
    velocity = 0f
  }

  /** Advances by `dt` seconds. Returns true while the spring still moves. */
  fun step(dt: Float): Boolean {
    if (isAtRest) return false
    val damping = 2f * dampingRatio * sqrt(stiffness)
    var remaining = dt
    while (remaining > 0f) {
      val h = min(remaining, MAX_SUBSTEP)
      val acceleration = -stiffness * (value - target) - damping * velocity
      velocity += acceleration * h
      value += velocity * h
      remaining -= h
    }
    if (abs(value - target) < threshold && abs(velocity) < threshold * 10f) {
      value = target
      velocity = 0f
      return false
    }
    return true
  }

  private companion object {
    const val MAX_SUBSTEP = 1f / 240f
  }
}
