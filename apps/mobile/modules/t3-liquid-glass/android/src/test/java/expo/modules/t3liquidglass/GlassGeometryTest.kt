package expo.modules.t3liquidglass

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sqrt

class GlassGeometryTest {
  @Test
  fun tierFollowsApiLevel() {
    assertEquals(GlassTier.FULL, GlassTier.select(36))
    assertEquals(GlassTier.FULL, GlassTier.select(33))
    assertEquals(GlassTier.BLUR, GlassTier.select(32))
    assertEquals(GlassTier.BLUR, GlassTier.select(31))
    assertEquals(GlassTier.NONE, GlassTier.select(30))
  }

  @Test
  fun capsulesAndCirclesUseCircularCorners() {
    val capsule = GlassGeometry.corner(GlassShape.CAPSULE, 0f, 300f, 60f)
    assertEquals(30f, capsule.extent, 1e-4f)
    assertEquals(2f, capsule.exponent, 1e-4f)
    // A rounded rect whose radius reaches half the short side is a capsule.
    val full = GlassGeometry.corner(GlassShape.ROUNDED_RECT, 999f, 300f, 60f)
    assertEquals(capsule, full)
  }

  @Test
  fun roundedRectGetsAContinuousCorner() {
    val corner = GlassGeometry.corner(GlassShape.ROUNDED_RECT, 24f, 300f, 400f)
    assertEquals(24f * GlassGeometry.CONTINUOUS_EXTENT, corner.extent, 1e-4f)
    assertEquals(3.43f, corner.exponent, 0.02f)
    assertEquals(24f, corner.outlineRadius, 1e-4f)
    // The diagonal point sits where a circular 24px corner puts it.
    val inset = 24f * (1f - 1f / sqrt(2f))
    assertEquals(0f, GlassGeometry.signedDistance(inset, inset, 300f, 400f, corner), 0.05f)
  }

  @Test
  fun exponentEasesFromContinuousToCircularNearCapsuleRadius() {
    val almost = GlassGeometry.corner(GlassShape.ROUNDED_RECT, 29f, 300f, 60f)
    assertEquals(30f, almost.extent, 1e-4f)
    assertTrue(almost.exponent in 2f..2.2f)
  }

  @Test
  fun signedDistanceIsNegativeInsideAndZeroOnEdges() {
    val corner = GlassGeometry.corner(GlassShape.CAPSULE, 0f, 200f, 40f)
    assertEquals(-20f, GlassGeometry.signedDistance(100f, 20f, 200f, 40f, corner), 1e-3f)
    assertEquals(0f, GlassGeometry.signedDistance(100f, 0f, 200f, 40f, corner), 1e-3f)
    assertEquals(0f, GlassGeometry.signedDistance(0f, 20f, 200f, 40f, corner), 1e-3f)
    assertTrue(GlassGeometry.signedDistance(1f, 1f, 200f, 40f, corner) > 0f)
  }

  @Test
  fun lensBandIsAbout14dpAndShrinksOnSmallControls() {
    val bar = GlassGeometry.lens(density = 3f, width = 1000f, height = 186f, blurDp = 4f)
    assertEquals(42f, bar.refractionHeight, 1e-4f)
    assertEquals(12f, bar.blurRadius, 1e-4f)
    val chip = GlassGeometry.lens(density = 3f, width = 60f, height = 60f, blurDp = 4f)
    assertTrue(chip.refractionHeight < 30f)
    assertTrue(chip.refractionAmount <= 30f)
  }

  @Test
  fun pressSwellsAndRubberBandsTowardTheFinger() {
    val out = PressTransform()
    GlassGeometry.pressTransform(out, 132f, 132f, 1f, 0f, 0f, 12f)
    assertEquals(1f + 12f / 132f, out.scaleX, 1e-4f)
    assertEquals(out.scaleX, out.scaleY, 1e-4f)
    assertTrue(out.isIdentity.not())
    GlassGeometry.pressTransform(out, 132f, 132f, 0f, 10_000f, 0f, 12f)
    assertTrue(out.translationX in 0f..132f)
    assertTrue(out.scaleX > out.scaleY)
    GlassGeometry.pressTransform(out, 132f, 132f, 0f, 0f, 0f, 12f)
    assertTrue(out.isIdentity)
  }

  @Test
  fun dragReleaseSnapsToNearestTab() {
    assertEquals(0, GlassGeometry.nearestTab(0.49f, 2))
    assertEquals(1, GlassGeometry.nearestTab(0.51f, 2))
    assertEquals(1, GlassGeometry.nearestTab(7f, 2))
    assertEquals(0, GlassGeometry.nearestTab(-3f, 2))
  }

  @Test
  fun springSettlesExactlyOnTargetAndStops() {
    val spring = GlassSpring(0.5f, 300f, 0.001f)
    spring.animateTo(1f)
    var frames = 0
    while (spring.step(1f / 60f)) {
      frames++
      assertTrue("spring never settled", frames < 600)
    }
    assertEquals(1f, spring.value)
    assertEquals(0f, spring.velocity)
    assertTrue(spring.isAtRest)
    assertFalse(spring.step(1f / 60f))
  }

  @Test
  fun stiffSpringIsStableAtLongFrames() {
    val spring = GlassSpring(1f, 1000f, 0.001f)
    spring.animateTo(3f)
    repeat(120) { spring.step(1f / 20f) }
    assertEquals(3f, spring.value)
  }

}
