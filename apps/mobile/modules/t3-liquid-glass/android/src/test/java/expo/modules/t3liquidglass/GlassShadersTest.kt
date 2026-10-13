package expo.modules.t3liquidglass

import android.graphics.RuntimeShader
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** An AGSL compile error throws when the shader is created, which would crash every API 33+ glass view. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class GlassShadersTest {
  @Test
  fun glassShaderCompilesAndTakesItsUniforms() {
    RuntimeShader(GLASS_SHADER).apply {
      setFloatUniform("size", 100f, 40f)
      setFloatUniform("corner", 20f, 2f)
      setFloatUniform("refractionHeight", 14f)
      setFloatUniform("refractionAmount", 20f)
      setFloatUniform("saturation", 1.35f)
      setFloatUniform("tint", 1f, 1f, 1f, 0.5f)
      setFloatUniform("rim", 1f, 1f, 1f, 0.75f)
      setFloatUniform("rimWidth", 3f)
      setFloatUniform("lightDirection", -0.7f, -0.7f)
      setFloatUniform("shade", 0f, 0f, 0f, 0.14f)
    }
  }

  @Test
  fun highlightShaderCompilesAndTakesItsUniforms() {
    RuntimeShader(HIGHLIGHT_SHADER).apply {
      setFloatUniform("size", 100f, 40f)
      setFloatUniform("corner", 20f, 2f)
      setFloatUniform("position", 50f, 20f)
      setFloatUniform("radius", 60f)
      setFloatUniform("progress", 1f)
    }
  }

  @Test
  fun edgeShaderCompilesAndTakesItsUniforms() {
    RuntimeShader(EDGE_SHADER).apply {
      setFloatUniform("size", 1080f, 330f)
      setFloatUniform("tint", 0f, 0f, 0f, 0.85f)
      setFloatUniform("fadeStart", 0.7f)
    }
  }
}
