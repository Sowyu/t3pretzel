package expo.modules.t3liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.ViewTreeObserver
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs

/**
 * An iOS 26 Liquid Glass surface. Children render on top of the glass.
 *
 * It samples the nearest [GlassBackdropView] that does not contain it, and
 * draws that backdrop's recording through blur, an AGSL lens, saturation,
 * tint and a specular rim (API 33+), or blur, saturation and tint (API 31-32).
 * With no backdrop under it, it draws `fallbackColor` with the rim.
 *
 * `interactive` adds Kyant's LiquidButton press: the glass swells, leans
 * toward the finger, and a glow follows it; on release it springs back.
 * `tabCount` > 0 turns it into Kyant's LiquidBottomTabs bar with a sliding,
 * draggable selection lens. Animations run only while touched or settling.
 */
@SuppressLint("ViewConstructor")
class LiquidGlassView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext),
  ViewTreeObserver.OnPreDrawListener {

  private val density = resources.displayMetrics.density
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private val renderer: GlassRenderer? =
    if (Build.VERSION.SDK_INT >= GlassTier.RENDER_EFFECT_SDK) GlassRenderer() else null
  private val indicatorLens: IndicatorLens? =
    if (Build.VERSION.SDK_INT >= GlassTier.RUNTIME_SHADER_SDK) IndicatorLens() else null
  private val highlightShader: HighlightShader? =
    if (Build.VERSION.SDK_INT >= GlassTier.RUNTIME_SHADER_SDK) HighlightShader() else null

  private val onTabSelect by EventDispatcher()

  // Props. Setters only flag work; draw() rebuilds once.
  var shape = GlassShape.ROUNDED_RECT
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  var cornerRadiusDp = 32f
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  var tintColor = Color.argb(128, 255, 255, 255)
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  var fallbackColor = Color.WHITE
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  var dark = false
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  var blurRadiusDp = 4f
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  var interactive = false
  var tabCount = 0
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  /**
   * >= 0 turns this into iOS's scroll-edge band under a floating header: a
   * rectangle of blurred, tinted backdrop that fades out from this fraction
   * of its height. No rim, no fallback fill, no press response.
   */
  var edgeFadeStart = -1f
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  private val isEdge: Boolean get() = edgeFadeStart >= 0f
  private val edgeMaskPaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
  private val edgeTintPaint = Paint()
  var tabInsetDp = 4f
    set(value) {
      if (field != value) {
        field = value
        markGeometryDirty()
      }
    }
  private var hasSelection = false
  var selectedTab = 0
    set(value) {
      if (hasSelection && field == value) return
      field = value
      onSelectedTabChanged(value)
    }

  // Geometry, rebuilt when size or props change.
  private var geometryDirty = true
  private var configuredWidth = 0
  private var configuredHeight = 0
  private var corner = GlassCorner(0f, 2f, 0f)
  private val shapePath = Path()
  private val rimPath = Path()
  private val shapeRect = RectF()
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val shadePath = Path()
  private val shadePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val indicatorPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      blendMode = BlendMode.PLUS
    } else {
      xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
    }
  }

  // Backdrop source.
  private var source: GlassBackdropView? = null
  private var searchedGeneration = -1
  private var offsetX = Float.NaN
  private var offsetY = Float.NaN
  private val location = IntArray(2)
  private val searchLocation = IntArray(2)
  private var seenContentVersion = -1
  private var drewGlass = false

  // Press animation (Kyant InteractiveHighlight specs).
  private val pressProgress = GlassSpring(0.5f, 300f, 0.001f)
  private val pressX = GlassSpring(0.5f, 300f, 0.5f)
  private val pressY = GlassSpring(0.5f, 300f, 0.5f)
  private var pressStartX = 0f
  private var pressStartY = 0f
  private val pressTransform = PressTransform()

  // Tab indicator (Kyant DampedDragAnimation specs).
  private val indicatorValue = GlassSpring(1f, 1000f, 0.001f)
  private val indicatorPress = GlassSpring(1f, 1000f, 0.001f)
  private val indicatorScaleX = GlassSpring(0.6f, 250f, 0.001f, 1f)
  private val indicatorScaleY = GlassSpring(0.7f, 250f, 0.001f, 1f)
  private val indicatorTransform = PressTransform()
  private val indicatorRect = RectF()
  private var releaseIndicatorWhenSettled = false
  private var dragCandidate = false
  private var dragging = false
  private var dragDownX = 0f
  private var dragStartValue = 0f

  private var animating = false
  private var lastFrameNanos = 0L
  private val frameCallback = Runnable { onAnimationFrame() }

  init {
    setWillNotDraw(false)
    // The rim replaces the Material outline; no elevation shadow under glass.
    outlineProvider = null
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

  // region Lifecycle

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(this)
    searchedGeneration = -1
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(this)
    detachSource()
    stopAnimations()
    renderer?.release()
    indicatorLens?.release()
    super.onDetachedFromWindow()
  }

  override fun onVisibilityAggregated(isVisible: Boolean) {
    super.onVisibilityAggregated(isVisible)
    // A hidden glass stops the source from recording for it.
    if (!isVisible) {
      detachSource()
      stopAnimations()
    }
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility != VISIBLE) stopAnimations()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    markGeometryDirty()
    // A new size can mean a new place on screen; search again.
    if (source == null) searchedGeneration = -1
  }

  override fun onPreDraw(): Boolean {
    if (searchedGeneration != GlassSources.generation) resolveSource()
    val source = source ?: return true
    getLocationInWindow(location)
    val glassX = location[0]
    val glassY = location[1]
    source.getLocationInWindow(location)
    val x = (glassX - location[0]).toFloat()
    val y = (glassY - location[1]).toFloat()
    if (x != offsetX || y != offsetY || source.contentVersion != seenContentVersion) {
      offsetX = x
      offsetY = y
      seenContentVersion = source.contentVersion
      recordEffect()
    }
    return true
  }

  // endregion

  // region Source

  /** Called from the source's draw, after it re-recorded its content. */
  internal fun onSourceRecorded() {
    recordEffect()
    // The first frame may have drawn the fallback before content existed.
    if (!drewGlass) invalidate()
  }

  internal fun onSourceLost(lost: GlassBackdropView) {
    if (source !== lost) return
    source = null
    searchedGeneration = -1
    invalidate()
  }

  private fun detachSource() {
    source?.removeConsumer(this)
    source = null
    searchedGeneration = -1
    offsetX = Float.NaN
  }

  private fun resolveSource() {
    if (!isAttachedToWindow || width == 0 || height == 0 || !isShown) return
    searchedGeneration = GlassSources.generation
    val found = if (renderer == null) null else findSource()
    if (found === source) return
    source?.removeConsumer(this)
    source = found
    offsetX = Float.NaN
    found?.addConsumer(this)
    invalidate()
  }

  /**
   * Nearest backdrop that does not contain this view: walk up the ancestors
   * and search each one's other children (topmost first) for a visible
   * backdrop overlapping this view. Ancestor backdrops are never candidates,
   * so a glass never samples itself.
   */
  private fun findSource(): GlassBackdropView? {
    getLocationInWindow(location)
    val left = location[0]
    val top = location[1]
    val right = left + width
    val bottom = top + height
    var child: View = this
    var parent = child.parent
    while (parent is ViewGroup) {
      for (index in parent.childCount - 1 downTo 0) {
        val sibling = parent.getChildAt(index)
        if (sibling === child) continue
        val found = searchBackdrop(sibling, left, top, right, bottom)
        if (found != null && !wouldCycle(found)) return found
      }
      child = parent
      parent = parent.parent
    }
    return null
  }

  private fun searchBackdrop(view: View, left: Int, top: Int, right: Int, bottom: Int): GlassBackdropView? {
    if (view.visibility != VISIBLE || view is LiquidGlassView) return null
    view.getLocationInWindow(searchLocation)
    val viewLeft = searchLocation[0]
    val viewTop = searchLocation[1]
    if (viewLeft >= right || viewTop >= bottom ||
      viewLeft + view.width <= left || viewTop + view.height <= top
    ) {
      return null
    }
    if (view is GlassBackdropView) return view
    if (view is ViewGroup) {
      for (index in view.childCount - 1 downTo 0) {
        val found = searchBackdrop(view.getChildAt(index), left, top, right, bottom)
        if (found != null) return found
      }
    }
    return null
  }

  /**
   * True if sampling `candidate` closes a loop: some glass inside `candidate`
   * already samples a backdrop that contains this view.
   */
  private fun wouldCycle(candidate: GlassBackdropView): Boolean {
    var ancestor = parent
    while (ancestor is View) {
      if (ancestor is GlassBackdropView && ancestor.hasConsumerInside(candidate)) return true
      ancestor = ancestor.parent
    }
    return false
  }

  // endregion

  // region Geometry and effects

  private fun markGeometryDirty() {
    geometryDirty = true
    invalidate()
  }

  private fun ensureGeometry() {
    if (!geometryDirty && configuredWidth == width && configuredHeight == height) return
    geometryDirty = false
    configuredWidth = width
    configuredHeight = height
    val w = width.toFloat()
    val h = height.toFloat()
    corner = GlassGeometry.corner(shape, cornerRadiusDp * density, w, h)
    val rimWidth = 1.25f * density
    shapeRect.set(0f, 0f, w, h)
    shapePath.rewind()
    shapePath.addRoundRect(shapeRect, corner.outlineRadius, corner.outlineRadius, Path.Direction.CW)
    shapeRect.inset(rimWidth / 2f, rimWidth / 2f)
    val rimRadius = (corner.outlineRadius - rimWidth / 2f).coerceAtLeast(0f)
    rimPath.rewind()
    rimPath.addRoundRect(shapeRect, rimRadius, rimRadius, Path.Direction.CW)
    rimPaint.strokeWidth = rimWidth
    shadePaint.strokeWidth = 0.75f * density
    shadePaint.color = Color.argb((255 * shadeAlpha()).toInt(), 0, 0, 0)
    shapeRect.set(0f, 0f, w, h)
    shapeRect.inset(shadePaint.strokeWidth / 2f, shadePaint.strokeWidth / 2f)
    val shadeRadius = (corner.outlineRadius - shadePaint.strokeWidth / 2f).coerceAtLeast(0f)
    shadePath.rewind()
    shadePath.addRoundRect(shapeRect, shadeRadius, shadeRadius, Path.Direction.CW)
    rimPaint.shader =
      if (w > 0f && h > 0f) {
        val bright = Color.argb((255 * rimAlpha()).toInt(), 255, 255, 255)
        val dim = Color.argb((255 * rimAlpha() * 0.2f).toInt(), 255, 255, 255)
        val back = Color.argb((255 * rimAlpha() * 0.45f).toInt(), 255, 255, 255)
        LinearGradient(0f, 0f, w, h, intArrayOf(bright, dim, back), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
      } else {
        null
      }
    indicatorPaint.color = if (dark) Color.argb(26, 255, 255, 255) else Color.argb(26, 0, 0, 0)
    if (width > 0 && height > 0) {
      renderer?.configure(
        width,
        height,
        corner,
        GlassGeometry.lens(density, w, h, blurRadiusDp),
        tintColor,
        rimAlpha(),
        shadeAlpha = shadeAlpha(),
        edgeFadeStart = if (isEdge) edgeFadeStart else null,
      )
      if (isEdge) configureEdgePaints(h)
      if (tabCount > 0) {
        val inset = tabInsetDp * density
        val tabWidth = ((w - 2f * inset) / tabCount).toInt()
        indicatorLens?.configure(tabWidth, (h - 2f * inset).toInt(), density, rimAlpha())
      }
      offsetX = Float.NaN
    }
  }

  private fun rimAlpha() = if (dark) 0.42f else 0.75f

  private fun shadeAlpha() = if (dark) 0f else LIGHT_SHADE_ALPHA

  private fun recordEffect() {
    val renderer = renderer ?: return
    val source = source ?: return
    val content = source.content ?: return
    if (!source.hasContent || offsetX.isNaN()) return
    renderer.record(content, offsetX, offsetY, pressTransform)
  }

  // endregion

  // region Drawing

  override fun draw(canvas: Canvas) {
    ensureGeometry()
    if (offsetX.isNaN() && source != null) onPreDraw()
    val save = canvas.save()
    val transform = pressTransform
    if (!transform.isIdentity) {
      val cx = width / 2f
      val cy = height / 2f
      canvas.translate(cx + transform.translationX, cy + transform.translationY)
      canvas.scale(transform.scaleX, transform.scaleY)
      canvas.translate(-cx, -cy)
    }
    val lens = indicatorLens
    val lensAlpha = indicatorPress.value
    if (lens != null && tabCount > 0 && lensAlpha > 0f && canvas.isHardwareAccelerated) {
      updateIndicatorRect()
      val bar = lens.beginBar(width, height)
      super.draw(bar)
      lens.endBar(canvas, indicatorRect, indicatorTransform, lensAlpha)
    } else {
      super.draw(canvas)
    }
    canvas.restoreToCount(save)
  }

  /** API 31-32 has no shader for the band; a gradient tint and a DST_IN fade stand in. */
  private fun configureEdgePaints(h: Float) {
    val transparent = tintColor and 0x00FFFFFF
    val fadeY = h * edgeFadeStart.coerceIn(0f, 1f)
    val thinTint = Color.argb(
      (Color.alpha(tintColor) * 0.8f).toInt(),
      Color.red(tintColor),
      Color.green(tintColor),
      Color.blue(tintColor),
    )
    edgeTintPaint.shader = LinearGradient(0f, 0f, 0f, fadeY, tintColor, thinTint, Shader.TileMode.CLAMP)
    edgeMaskPaint.shader = LinearGradient(0f, fadeY, 0f, h, Color.BLACK, transparent, Shader.TileMode.CLAMP)
  }

  private fun drawEdge(canvas: Canvas, renderer: GlassRenderer) {
    if (renderer.isFull) {
      renderer.draw(canvas)
      return
    }
    val w = width.toFloat()
    val h = height.toFloat()
    val save = canvas.saveLayer(0f, 0f, w, h, null)
    renderer.draw(canvas)
    canvas.drawRect(0f, 0f, w, h, edgeTintPaint)
    canvas.drawRect(0f, 0f, w, h, edgeMaskPaint)
    canvas.restoreToCount(save)
  }

  override fun onDraw(canvas: Canvas) {
    val renderer = renderer
    val source = source
    drewGlass = renderer != null && source != null && source.hasContent && canvas.isHardwareAccelerated
    if (isEdge) {
      // Without a backdrop the header's own static scrim shows instead.
      if (drewGlass && renderer != null) drawEdge(canvas, renderer)
      return
    }
    // The source records its first frame right after this one; drawing the
    // opaque fallback meanwhile would flash.
    val waitingForSource = renderer != null && source != null && !source.hasContent
    if (drewGlass && renderer != null) {
      renderer.draw(canvas)
      if (!renderer.isFull) {
        fillPaint.color = tintColor
        canvas.drawPath(shapePath, fillPaint)
        canvas.drawPath(rimPath, rimPaint)
        if (!dark) canvas.drawPath(shadePath, shadePaint)
      }
    } else if (!waitingForSource) {
      fillPaint.color = fallbackColor
      canvas.drawPath(shapePath, fillPaint)
      canvas.drawPath(rimPath, rimPaint)
      if (!dark) canvas.drawPath(shadePath, shadePaint)
    }
    if (tabCount > 0) drawIndicatorRest(canvas)
    drawHighlight(canvas)
  }

  private fun updateIndicatorRect() {
    val inset = tabInsetDp * density
    val tabWidth = ((width - 2f * inset) / tabCount).toInt().toFloat()
    val left = inset + indicatorValue.value * tabWidth
    indicatorRect.set(left, inset, left + tabWidth, inset + (height - 2f * inset).toInt())
  }

  private fun drawIndicatorRest(canvas: Canvas) {
    updateIndicatorRect()
    val fade = if (indicatorLens != null) 1f - indicatorPress.value else 1f
    if (fade <= 0f) return
    val baseAlpha = Color.alpha(indicatorPaint.color)
    indicatorPaint.alpha = (baseAlpha * fade).toInt()
    val save = canvas.save()
    canvas.scale(indicatorTransform.scaleX, indicatorTransform.scaleY, indicatorRect.centerX(), indicatorRect.centerY())
    val radius = indicatorRect.height() / 2f
    canvas.drawRoundRect(indicatorRect, radius, radius, indicatorPaint)
    canvas.restoreToCount(save)
    indicatorPaint.alpha = baseAlpha
  }

  private fun drawHighlight(canvas: Canvas) {
    val progress = if (tabCount > 0) indicatorPress.value else pressProgress.value
    if (progress <= 0f) return
    val x: Float
    val y: Float
    if (tabCount > 0) {
      x = indicatorRect.centerX()
      y = height / 2f
    } else {
      x = pressX.value.coerceIn(0f, width.toFloat())
      y = pressY.value.coerceIn(0f, height.toFloat())
    }
    val shader = highlightShader
    if (shader != null && Build.VERSION.SDK_INT >= GlassTier.RUNTIME_SHADER_SDK) {
      shader.applyTo(highlightPaint, width, height, corner, x, y, progress)
      highlightPaint.color = Color.WHITE
      canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), highlightPaint)
    } else {
      highlightPaint.shader = null
      highlightPaint.color = Color.argb((0.2f * progress * 255).toInt(), 255, 255, 255)
      canvas.drawPath(shapePath, highlightPaint)
    }
  }

  // endregion

  // region Touch

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    // Observe only: RN children and the JS responder still get every event.
    if (renderer != null) {
      if (tabCount > 0) onTabTouch(event) else if (interactive) onPressTouch(event)
    }
    return super.dispatchTouchEvent(event)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean =
    // Keep receiving the gesture when the finger lands between children.
    (renderer != null && (interactive || tabCount > 0)) || super.onTouchEvent(event)

  private fun onPressTouch(event: MotionEvent) {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        pressStartX = event.x
        pressStartY = event.y
        pressX.snapTo(event.x)
        pressY.snapTo(event.y)
        pressProgress.animateTo(1f)
        startAnimating()
      }
      MotionEvent.ACTION_MOVE -> {
        pressX.snapTo(event.x)
        pressY.snapTo(event.y)
        startAnimating()
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        pressProgress.animateTo(0f)
        pressX.animateTo(pressStartX)
        pressY.animateTo(pressStartY)
        startAnimating()
      }
    }
  }

  private fun onTabTouch(event: MotionEvent) {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        updateIndicatorRect()
        dragCandidate = indicatorRect.contains(event.x, event.y)
        dragging = false
        if (dragCandidate) {
          dragDownX = event.x
          dragStartValue = indicatorValue.value
          pressIndicator()
        }
      }
      MotionEvent.ACTION_MOVE -> {
        if (!dragCandidate) return
        val dx = event.x - dragDownX
        if (!dragging && abs(dx) > touchSlop) {
          dragging = true
          parent?.requestDisallowInterceptTouchEvent(true)
        }
        if (dragging) {
          indicatorValue.animateTo((dragStartValue + dx / tabWidth()).coerceIn(0f, (tabCount - 1).toFloat()))
          startAnimating()
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (!dragCandidate) return
        dragCandidate = false
        val committed = dragging && event.actionMasked == MotionEvent.ACTION_UP
        dragging = false
        val index = if (committed) GlassGeometry.nearestTab(indicatorValue.target, tabCount) else selectedTab
        indicatorValue.animateTo(index.toFloat())
        releaseIndicatorWhenSettled = true
        startAnimating()
        if (committed && index != selectedTab) onTabSelect(mapOf("index" to index))
      }
    }
  }

  private fun tabWidth(): Float {
    val inset = tabInsetDp * density
    return ((width - 2f * inset) / tabCount).coerceAtLeast(1f)
  }

  private fun onSelectedTabChanged(index: Int) {
    if (!hasSelection || !isAttachedToWindow || width == 0) {
      hasSelection = true
      indicatorValue.snapTo(index.toFloat())
      invalidate()
      return
    }
    if (dragging) return
    // Kyant's animateToValue: press, slide, release once close.
    pressIndicator()
    indicatorValue.animateTo(index.toFloat())
    releaseIndicatorWhenSettled = true
    startAnimating()
  }

  private fun pressIndicator() {
    releaseIndicatorWhenSettled = false
    indicatorPress.animateTo(1f)
    indicatorScaleX.animateTo(INDICATOR_PRESSED_SCALE)
    indicatorScaleY.animateTo(INDICATOR_PRESSED_SCALE)
    startAnimating()
  }

  private fun releaseIndicator() {
    indicatorPress.animateTo(0f)
    indicatorScaleX.animateTo(1f)
    indicatorScaleY.animateTo(1f)
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
    val dt = ((now - lastFrameNanos) / 1e9f).coerceIn(0f, MAX_FRAME_SECONDS)
    lastFrameNanos = now
    var moving = pressProgress.step(dt)
    moving = pressX.step(dt) || moving
    moving = pressY.step(dt) || moving
    moving = indicatorValue.step(dt) || moving
    if (releaseIndicatorWhenSettled &&
      abs(indicatorValue.value - indicatorValue.target) < INDICATOR_RELEASE_DISTANCE
    ) {
      releaseIndicatorWhenSettled = false
      releaseIndicator()
    }
    moving = indicatorPress.step(dt) || moving
    moving = indicatorScaleX.step(dt) || moving
    moving = indicatorScaleY.step(dt) || moving
    applyAnimatedState()
    if (moving || releaseIndicatorWhenSettled) {
      postOnAnimation(frameCallback)
    } else {
      animating = false
    }
  }

  private fun applyAnimatedState() {
    if (tabCount > 0) {
      val scale = 1f + 16f * density / width.coerceAtLeast(1) * indicatorPress.value
      pressTransform.scaleX = scale
      pressTransform.scaleY = scale
      pressTransform.translationX = 0f
      pressTransform.translationY = 0f
      GlassGeometry.indicatorStretch(
        indicatorTransform,
        indicatorScaleX.value,
        indicatorScaleY.value,
        indicatorValue.velocity,
      )
    } else if (interactive) {
      GlassGeometry.pressTransform(
        pressTransform,
        width.toFloat(),
        height.toFloat(),
        pressProgress.value,
        pressX.value - pressStartX,
        pressY.value - pressStartY,
        4f * density,
      )
    } else {
      pressTransform.reset()
    }
    recordEffect()
    invalidate()
  }

  private fun stopAnimations() {
    if (animating) removeCallbacks(frameCallback)
    animating = false
    pressProgress.snapTo(0f)
    pressX.snapTo(pressStartX)
    pressY.snapTo(pressStartY)
    indicatorValue.snapTo(selectedTab.toFloat())
    indicatorPress.snapTo(0f)
    indicatorScaleX.snapTo(1f)
    indicatorScaleY.snapTo(1f)
    releaseIndicatorWhenSettled = false
    dragCandidate = false
    dragging = false
    pressTransform.reset()
    indicatorTransform.reset()
  }

  // endregion

  private companion object {
    const val INDICATOR_PRESSED_SCALE = 78f / 56f
    const val LIGHT_SHADE_ALPHA = 0.14f
    const val INDICATOR_RELEASE_DISTANCE = 0.05f
    const val MAX_FRAME_SECONDS = 1f / 20f
  }
}
