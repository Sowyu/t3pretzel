/*
   Portions of this file are ported from AndroidLiquidGlass (com.kyant.backdrop),
   https://github.com/Kyant0/AndroidLiquidGlass, backdrop/src/commonMain/kotlin/
   com/kyant/backdrop/internal/Shaders.kt and catalog/utils/InteractiveHighlight.kt.

   Copyright 2025 Kyant

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

   Changes from the original: rounded-rect SDF replaced by a superellipse
   corner (iOS continuous corners), lens, saturation, tint, specular rim and
   the anti-aliased shape mask merged into one pass so a glass element costs
   one offscreen layer.
 */

package expo.modules.t3liquidglass

// Shared SDF. `corner.x` is the superellipse extent, `corner.y` its exponent
// (2 = circular). Matches GlassGeometry.signedDistance.
private const val SHAPE_SDF = """
float superellipseNorm(float2 q, float n) {
    float m = max(q.x, q.y);
    if (m <= 0.0) return 0.0;
    float2 r = q / m;
    return m * pow(pow(r.x, n) + pow(r.y, n), 1.0 / n);
}

float sdShape(float2 p, float2 halfSize, float2 corner) {
    float2 cornerCoord = abs(p) - (halfSize - float2(corner.x));
    float outside = superellipseNorm(max(cornerCoord, 0.0), corner.y) - corner.x;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

// Kyant's normal: the gradient of a rounded rect whose radius is inflated so
// normals turn smoothly around the corner instead of snapping at its ends.
float2 shapeNormal(float2 p, float2 halfSize, float radius) {
    float2 cornerCoord = abs(p) - (halfSize - float2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        return sign(p) * normalize(max(cornerCoord, 0.0) + float2(0.0001));
    }
    float gradX = step(cornerCoord.y, cornerCoord.x);
    return sign(p) * float2(gradX, 1.0 - gradX);
}
"""

/**
 * The glass pass, run on the blurred backdrop: edge lens, saturation, tint,
 * specular rim, and the shape mask. Output is premultiplied.
 */
internal const val GLASS_SHADER = """
uniform shader content;

uniform float2 size;
uniform float2 corner;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float saturation;
uniform half4 tint;
uniform half4 rim;
uniform float rimWidth;
uniform float2 lightDirection;
uniform half4 shade;

$SHAPE_SDF

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 p = coord - halfSize;
    float sd = sdShape(p, halfSize, corner);
    float coverage = clamp(0.5 - sd, 0.0, 1.0);
    if (coverage <= 0.0) {
        return half4(0.0);
    }
    float depth = max(-sd, 0.0);
    float minHalf = min(halfSize.x, halfSize.y);
    float2 normal = shapeNormal(p, halfSize, min(corner.x * 1.5, minHalf));

    // Lens: inside the band, sample further in along the normal on a circular
    // profile, so the rim bends the backdrop and the middle stays flat.
    float2 sampleCoord = coord;
    if (depth < refractionHeight) {
        float x = 1.0 - depth / refractionHeight;
        float displacement = (1.0 - sqrt(1.0 - x * x)) * refractionAmount;
        sampleCoord = coord - displacement * normal;
    }
    half4 color = content.eval(sampleCoord);

    half luminance = dot(color.rgb, half3(0.2126, 0.7152, 0.0722));
    color.rgb = clamp(mix(half3(luminance), color.rgb, half(saturation)), half3(0.0), half3(color.a));

    half4 tintPremultiplied = half4(tint.rgb * tint.a, tint.a);
    color = tintPremultiplied + color * (1.0 - tintPremultiplied.a);

    // Specular rim: a hairline that is brightest where the edge faces the
    // light (top-left) and dimmer on the opposite edge.
    float rimMask = 1.0 - smoothstep(0.0, rimWidth, depth);
    float facing = dot(normal, lightDirection);
    float light = 0.22 + 0.78 * pow(max(facing, 0.0), 1.5) + 0.3 * pow(max(-facing, 0.0), 1.5);
    half k = half(rim.a * rimMask * light);
    color = min(color + half4(rim.rgb * k, k), half4(1.0));

    // Light mode: a faint dark hairline on the outer edge, so white glass
    // still reads against a white screen.
    half s = half(shade.a * (1.0 - smoothstep(0.0, rimWidth * 0.5, depth)));
    color = half4(shade.rgb * s, s) + color * (1.0 - s);

    return color * half(coverage);
}
"""

/** Kyant's InteractiveHighlight: a soft glow under the finger, masked to the shape. Drawn with BlendMode.PLUS. */
internal const val HIGHLIGHT_SHADER = """
uniform float2 size;
uniform float2 corner;
uniform float2 position;
uniform float radius;
uniform float progress;

$SHAPE_SDF

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float coverage = clamp(0.5 - sdShape(coord - halfSize, halfSize, corner), 0.0, 1.0);
    float intensity = smoothstep(radius, radius * 0.5, distance(coord, position));
    float alpha = (0.08 + 0.15 * intensity) * progress * coverage;
    return half4(alpha, alpha, alpha, alpha);
}
"""

/**
 * iOS 26's scroll-edge effect under a floating header (not from Kyant): the
 * blurred backdrop under a screen-colored tint that thickens toward the top,
 * fading out from `fadeStart` (a fraction of the height) to the bottom edge.
 */
internal const val EDGE_SHADER = """
uniform shader content;

uniform float2 size;
uniform half4 tint;
uniform float fadeStart;

half4 main(float2 coord) {
    float t = clamp(coord.y / size.y, 0.0, 1.0);
    half4 color = content.eval(coord);
    half a = half(tint.a * mix(1.0, 0.8, smoothstep(0.0, fadeStart, t)));
    color = half4(tint.rgb * a, a) + color * (1.0 - a);
    return color * half(1.0 - smoothstep(fadeStart, 1.0, t));
}
"""
