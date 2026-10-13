package expo.modules.t3liquidglass

import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Outline
import android.graphics.RecordingCanvas
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi

/** Saturation boost applied to the backdrop, like iOS glass's vibrancy. */
internal const val GLASS_SATURATION = 1.35f

/**
 * One glass element's offscreen layer. [node] holds the backdrop recording,
 * translated so the glass shows what lies under it, and carries the whole
 * effect chain as one RenderEffect. Effects are rebuilt only in [configure]
 * (size, shape, or params changed); per-frame work is re-recording a
 * translate plus one drawRenderNode.
 */
@RequiresApi(Build.VERSION_CODES.S)
internal class GlassRenderer {
  private val node = RenderNode("T3LiquidGlass")
  private val lens: LensShader? =
    if (Build.VERSION.SDK_INT >= GlassTier.RUNTIME_SHADER_SDK) LensShader() else null
  private val edgeShader: EdgeShader? =
    if (Build.VERSION.SDK_INT >= GlassTier.RUNTIME_SHADER_SDK) EdgeShader() else null
  private val outline = Outline()
  private var width = 0
  private var height = 0

  /**
   * The scroll-edge band has no crisp features (no rim, no shape edge), so it
   * renders at a quarter of the resolution and is scaled up: 1/16 the fill
   * for a full-width blurred band, with no visible difference.
   */
  private var scale = 1f

  /** FULL draws tint and rim in the shader; BLUR leaves them to the view's canvas. */
  val isFull: Boolean get() = lens != null

  fun configure(
    width: Int,
    height: Int,
    corner: GlassCorner,
    params: GlassLens,
    tintColor: Int,
    rimAlpha: Float,
    /** Alpha of the dark outer hairline (light mode). */
    shadeAlpha: Float = 0f,
    /** Scroll-edge band: fraction of the height where the fade-out starts, or null for glass. */
    edgeFadeStart: Float? = null,
  ) {
    scale = if (edgeFadeStart != null) EDGE_SCALE else 1f
    val scaledWidth = maxOf(1, kotlin.math.ceil(width * scale).toInt())
    val scaledHeight = maxOf(1, kotlin.math.ceil(height * scale).toInt())
    this.width = scaledWidth
    this.height = scaledHeight
    node.setPosition(0, 0, scaledWidth, scaledHeight)
    node.pivotX = 0f
    node.pivotY = 0f
    node.scaleX = width.toFloat() / scaledWidth
    node.scaleY = height.toFloat() / scaledHeight
    val blurRadius = params.blurRadius * scale
    val blur =
      if (blurRadius > 0f) {
        RenderEffect.createBlurEffect(blurRadius, blurRadius, Shader.TileMode.CLAMP)
      } else {
        null
      }
    val lens = lens
    val edgeShader = edgeShader
    if (edgeFadeStart != null && edgeShader != null) {
      node.setRenderEffect(edgeShader.effect(scaledWidth, scaledHeight, tintColor, edgeFadeStart, blur))
      node.setClipToOutline(false)
    } else if (edgeFadeStart != null) {
      // API 31-32: the view masks the fade and draws the tint gradient.
      node.setRenderEffect(blur)
      node.setClipToOutline(false)
    } else if (lens != null) {
      lens.configure(width, height, corner, params, GLASS_SATURATION, tintColor, rimAlpha, shadeAlpha)
      node.setRenderEffect(lens.effect(blur))
      node.setClipToOutline(false)
    } else {
      val saturation = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(GLASS_SATURATION) })
      node.setRenderEffect(
        if (blur != null) RenderEffect.createColorFilterEffect(saturation, blur)
        else RenderEffect.createColorFilterEffect(saturation),
      )
      outline.setRoundRect(0, 0, width, height, corner.outlineRadius)
      node.setOutline(outline)
      node.setClipToOutline(true)
    }
  }

  /**
   * Records the backdrop so local point p shows the backdrop at the screen
   * point the press transform moves p to. `offsetX/Y` is the glass's window
   * position minus the source's.
   */
  fun record(source: BackdropRecording, offsetX: Float, offsetY: Float, transform: PressTransform) {
    if (width == 0 || height == 0) return
    val canvas = node.beginRecording(width, height)
    try {
      if (scale != 1f) canvas.scale(scale, scale)
      val fullWidth = width / scale
      val fullHeight = height / scale
      transformToSource(canvas, fullWidth / 2f, fullHeight / 2f, transform, offsetX, offsetY)
      canvas.drawRenderNode(source.node)
    } finally {
      node.endRecording()
    }
  }

  fun draw(canvas: Canvas) {
    canvas.drawRenderNode(node)
  }

  fun release() {
    node.discardDisplayList()
  }

  private companion object {
    const val EDGE_SCALE = 0.25f
  }
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private class EdgeShader {
  private val shader = RuntimeShader(EDGE_SHADER)

  fun effect(width: Int, height: Int, tintColor: Int, fadeStart: Float, blur: RenderEffect?): RenderEffect {
    shader.setFloatUniform("size", width.toFloat(), height.toFloat())
    shader.setFloatUniform(
      "tint",
      android.graphics.Color.red(tintColor) / 255f,
      android.graphics.Color.green(tintColor) / 255f,
      android.graphics.Color.blue(tintColor) / 255f,
      android.graphics.Color.alpha(tintColor) / 255f,
    )
    shader.setFloatUniform("fadeStart", fadeStart.coerceIn(0.01f, 0.99f))
    val edge = RenderEffect.createRuntimeShaderEffect(shader, "content")
    return if (blur != null) RenderEffect.createChainEffect(edge, blur) else edge
  }
}

/** A backdrop's recording of its subtree, drawn by every glass that samples it. */
@RequiresApi(Build.VERSION_CODES.S)
internal class BackdropRecording {
  val node = RenderNode("T3GlassBackdrop")
}

/** Kyant's press glow under the finger, as a Paint shader masked to the glass shape. */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal class HighlightShader {
  private val shader = RuntimeShader(HIGHLIGHT_SHADER)

  fun applyTo(
    paint: android.graphics.Paint,
    width: Int,
    height: Int,
    corner: GlassCorner,
    x: Float,
    y: Float,
    progress: Float,
  ) {
    shader.setFloatUniform("size", width.toFloat(), height.toFloat())
    shader.setFloatUniform("corner", corner.extent, corner.exponent)
    shader.setFloatUniform("position", x, y)
    shader.setFloatUniform("radius", minOf(width, height) * 1.5f)
    shader.setFloatUniform("progress", progress)
    paint.shader = shader
  }
}

/** Inverse of the draw-time press transform, then into source coordinates. */
private fun transformToSource(
  canvas: RecordingCanvas,
  centerX: Float,
  centerY: Float,
  transform: PressTransform,
  offsetX: Float,
  offsetY: Float,
) {
  if (transform.isIdentity) {
    canvas.translate(-offsetX, -offsetY)
    return
  }
  canvas.translate(centerX, centerY)
  canvas.scale(1f / transform.scaleX, 1f / transform.scaleY)
  canvas.translate(
    -(centerX + transform.translationX + offsetX),
    -(centerY + transform.translationY + offsetY),
  )
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private class LensShader {
  private val shader = RuntimeShader(GLASS_SHADER)

  fun configure(
    width: Int,
    height: Int,
    corner: GlassCorner,
    params: GlassLens,
    saturation: Float,
    tintColor: Int,
    rimAlpha: Float,
    shadeAlpha: Float,
  ) {
    shader.setFloatUniform("shade", 0f, 0f, 0f, shadeAlpha)
    shader.setFloatUniform("size", width.toFloat(), height.toFloat())
    shader.setFloatUniform("corner", corner.extent, corner.exponent)
    shader.setFloatUniform("refractionHeight", params.refractionHeight)
    shader.setFloatUniform("refractionAmount", params.refractionAmount)
    shader.setFloatUniform("saturation", saturation)
    shader.setFloatUniform(
      "tint",
      android.graphics.Color.red(tintColor) / 255f,
      android.graphics.Color.green(tintColor) / 255f,
      android.graphics.Color.blue(tintColor) / 255f,
      android.graphics.Color.alpha(tintColor) / 255f,
    )
    shader.setFloatUniform("rim", 1f, 1f, 1f, rimAlpha)
    shader.setFloatUniform("rimWidth", params.rimWidth)
    // Light from the top-left, in view coordinates (y down).
    shader.setFloatUniform("lightDirection", -0.70710677f, -0.70710677f)
  }

  /** Blur first, then the glass pass on the blurred backdrop. */
  fun effect(blur: RenderEffect?): RenderEffect {
    val glass = RenderEffect.createRuntimeShaderEffect(shader, "content")
    return if (blur != null) RenderEffect.createChainEffect(glass, blur) else glass
  }
}

/**
 * A clear lens over a view's own drawing, from Kyant's LiquidBottomTabs and
 * LiquidToggle: while pressed, the tab indicator refracts the bar (glass plus
 * tab icons) and the switch thumb refracts its track. The view's drawing is
 * recorded into [barNode]; [node] samples it, so neither contains the other.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal class IndicatorLens {
  private val barNode = RenderNode("T3GlassBar")
  private val node = RenderNode("T3GlassIndicator")
  private val shader = RuntimeShader(GLASS_SHADER)
  private var width = 0
  private var height = 0

  fun configure(
    width: Int,
    height: Int,
    density: Float,
    rimAlpha: Float,
    refractionHeightDp: Float = 10f,
    refractionAmountDp: Float = 14f,
  ) {
    if (width <= 0 || height <= 0) return
    this.width = width
    this.height = height
    val corner = GlassGeometry.corner(GlassShape.CAPSULE, 0f, width.toFloat(), height.toFloat())
    shader.setFloatUniform("size", width.toFloat(), height.toFloat())
    shader.setFloatUniform("corner", corner.extent, corner.exponent)
    shader.setFloatUniform("refractionHeight", minOf(refractionHeightDp * density, height / 2f))
    shader.setFloatUniform("refractionAmount", minOf(refractionAmountDp * density, height / 2f))
    shader.setFloatUniform("saturation", 1f)
    shader.setFloatUniform("tint", 0f, 0f, 0f, 0f)
    shader.setFloatUniform("shade", 0f, 0f, 0f, 0f)
    shader.setFloatUniform("rim", 1f, 1f, 1f, rimAlpha)
    shader.setFloatUniform("rimWidth", 1.25f * density)
    shader.setFloatUniform("lightDirection", -0.70710677f, -0.70710677f)
    node.setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "content"))
  }

  fun beginBar(barWidth: Int, barHeight: Int): RecordingCanvas {
    barNode.setPosition(0, 0, barWidth, barHeight)
    return barNode.beginRecording(barWidth, barHeight)
  }

  fun endBar(canvas: Canvas, rect: RectF, transform: PressTransform, alpha: Float) {
    barNode.endRecording()
    canvas.drawRenderNode(barNode)
    if (width == 0 || alpha <= 0f) return
    val left = rect.left
    val top = rect.top
    node.setPosition(left.toInt(), top.toInt(), left.toInt() + width, top.toInt() + height)
    node.pivotX = width / 2f
    node.pivotY = height / 2f
    node.scaleX = transform.scaleX
    node.scaleY = transform.scaleY
    node.alpha = alpha
    val recording = node.beginRecording(width, height)
    try {
      transformToSource(
        recording,
        width / 2f,
        height / 2f,
        transform,
        left.toInt().toFloat(),
        top.toInt().toFloat(),
      )
      recording.drawRenderNode(barNode)
    } finally {
      node.endRecording()
    }
    canvas.drawRenderNode(node)
  }

  fun release() {
    barNode.discardDisplayList()
    node.discardDisplayList()
  }
}
