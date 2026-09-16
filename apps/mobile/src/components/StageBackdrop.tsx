import { useWindowDimensions } from "react-native";
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import type { MobileStageLabel } from "../lib/mobileBranding";

/**
 * The desktop app paints per-channel art behind its sidebar brand
 * (apps/web SidebarStageBackdrop) instead of a stage pill. Only the nightly
 * sky is ported; Dev keeps its pill.
 */
export function stageBackdropVariant(stageLabel: MobileStageLabel): "nightly" | null {
  return stageLabel === "Nightly" ? "nightly" : null;
}

// Palette mirrors the desktop `--stage-night-*` variables and the nightly app icon.
const NIGHT = {
  top: "#32155B",
  mid: "#151443",
  bottom: "#07152F",
  highlight: "#4EA4FF",
  secondary: "#696FEA",
  tertiary: "#A85BEA",
  line: "#E4EAFF",
  glowHighlight: "#5165D8",
  glowSecondary: "#283075",
  sparkle: "#C8D7FF",
};

// The desktop scene is 96 units tall: brand text in the clear sky, clouds
// low, and the chrome fade starting 28% down. The scene bottom lands on the
// art bottom here and the sky extends upward to fill the status bar.
const SCENE_HEIGHT = 96;
const FADE_START = 0.28 * SCENE_HEIGHT;

const STARS: ReadonlyArray<{ cx: number; cy: number; r: number; opacity: number }> = [
  { cx: 14, cy: 10, r: 0.6, opacity: 0.85 },
  { cx: 38, cy: 22, r: 0.4, opacity: 0.55 },
  { cx: 58, cy: 8, r: 0.5, opacity: 0.7 },
  { cx: 84, cy: 16, r: 0.4, opacity: 0.5 },
  { cx: 104, cy: 7, r: 0.6, opacity: 0.8 },
  { cx: 126, cy: 20, r: 0.4, opacity: 0.55 },
  { cx: 148, cy: 11, r: 0.5, opacity: 0.7 },
  { cx: 170, cy: 24, r: 0.4, opacity: 0.5 },
  { cx: 192, cy: 9, r: 0.6, opacity: 0.8 },
  { cx: 214, cy: 18, r: 0.4, opacity: 0.55 },
  { cx: 236, cy: 8, r: 0.5, opacity: 0.7 },
  { cx: 258, cy: 20, r: 0.45, opacity: 0.6 },
  { cx: 278, cy: 11, r: 0.55, opacity: 0.75 },
  { cx: 26, cy: 34, r: 0.4, opacity: 0.45 },
  { cx: 118, cy: 34, r: 0.4, opacity: 0.45 },
  { cx: 202, cy: 32, r: 0.4, opacity: 0.5 },
  { cx: 268, cy: 34, r: 0.4, opacity: 0.45 },
];

const SPARKLES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 70, y: 28 },
  { x: 160, y: 36 },
  { x: 246, y: 26 },
];

// Desktop's `sidebar-stage-backdrop` fade, as fractions of the scene height.
const FADE_STOPS: ReadonlyArray<readonly [offset: number, opacity: number]> = [
  [0.28, 0],
  [0.4, 0.1],
  [0.52, 0.3],
  [0.64, 0.58],
  [0.75, 0.82],
  [0.85, 0.96],
  [0.93, 1],
];

/**
 * Night-sky header art, absolutely positioned at the top of its parent. The
 * status bar and brand row (`clearHeight` dp) sit in clear sky; below them
 * the scene fades into the header. The header tint is translucent, so the
 * fade paints the screen colour first and the bottom edge matches the pixels
 * below exactly.
 */
export function NightlySkyBackdrop(props: {
  readonly height: number;
  readonly clearHeight: number;
  readonly screenColor: string;
  readonly headerColor: string;
}) {
  const { width } = useWindowDimensions();
  // Brand row bottom maps onto the desktop fade start; the rest of the scene
  // fills the fade zone.
  const scale = (props.height - props.clearHeight) / (SCENE_HEIGHT - FADE_START);
  const unitsWide = Math.ceil(width / scale);
  const unitsTall = Math.ceil(props.height / scale);
  const top = SCENE_HEIGHT - unitsTall;

  return (
    <Svg
      aria-hidden
      height={props.height}
      pointerEvents="none"
      style={{ left: 0, position: "absolute", top: 0 }}
      viewBox={`0 ${top} ${unitsWide} ${unitsTall}`}
      width={width}
    >
      <Defs>
        <LinearGradient
          gradientUnits="userSpaceOnUse"
          id="sky"
          x1="24"
          x2={unitsWide}
          y1="0"
          y2={SCENE_HEIGHT}
        >
          <Stop offset="0" stopColor={NIGHT.bottom} />
          <Stop offset="0.5" stopColor={NIGHT.mid} />
          <Stop offset="1" stopColor={NIGHT.top} />
        </LinearGradient>
        <RadialGradient
          cx="0"
          cy="0"
          gradientTransform="translate(216 18) rotate(137) scale(120 84)"
          gradientUnits="userSpaceOnUse"
          id="glow"
          r="1"
        >
          <Stop offset="0" stopColor={NIGHT.glowHighlight} stopOpacity="0.4" />
          <Stop offset="0.5" stopColor={NIGHT.glowSecondary} stopOpacity="0.16" />
          <Stop offset="1" stopColor={NIGHT.bottom} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient gradientUnits="userSpaceOnUse" id="cloud" x1="0" x2="288" y1="60" y2="96">
          <Stop offset="0" stopColor={NIGHT.highlight} stopOpacity="0.5" />
          <Stop offset="0.52" stopColor={NIGHT.secondary} stopOpacity="0.62" />
          <Stop offset="1" stopColor={NIGHT.tertiary} stopOpacity="0.5" />
        </LinearGradient>
        {/* Android resolves userSpaceOnUse filter regions in device pixels,
            ignoring the viewBox, so size the region from the cloud's own box. */}
        <Filter filterUnits="objectBoundingBox" height="1.6" id="soft" width="1.6" x="-0.3" y="-0.3">
          <FeGaussianBlur stdDeviation="4" />
        </Filter>
        <Pattern height={SCENE_HEIGHT} id="stars" patternUnits="userSpaceOnUse" width="288">
          <G fill={NIGHT.line}>
            {STARS.map((star) => (
              <Circle
                cx={star.cx}
                cy={star.cy}
                fillOpacity={star.opacity}
                key={`${star.cx}-${star.cy}`}
                r={star.r}
              />
            ))}
          </G>
          <G stroke={NIGHT.sparkle} strokeLinecap="round" strokeOpacity="0.7" strokeWidth="0.6">
            {SPARKLES.map((sparkle) => (
              <G key={`${sparkle.x}-${sparkle.y}`}>
                <Path d={`M${sparkle.x - 1.5} ${sparkle.y}H${sparkle.x + 1.5}`} />
                <Path d={`M${sparkle.x} ${sparkle.y - 1.5}V${sparkle.y + 1.5}`} />
              </G>
            ))}
          </G>
        </Pattern>
        <FadeGradient color={props.screenColor} id="fade-screen" />
        <FadeGradient color={props.headerColor} id="fade-header" />
      </Defs>

      <Rect fill="url(#sky)" height={unitsTall} width={unitsWide} y={top} />
      {/* ponytail: one glow, not desktop's 640-unit repeat; tile it when a
          header wider than ~520dp needs a second one. */}
      <Rect fill="url(#glow)" height={unitsTall} width={unitsWide} y={top} />
      <Rect fill="url(#stars)" height={unitsTall} width={unitsWide} y={top} />
      <G filter="url(#soft)">
        <Path
          d="M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z"
          fill="url(#cloud)"
        />
      </G>
      <G filter="url(#soft)">
        <Path
          d="M150 96C151 84 161 75 173 75C176 64 186 57 198 57C210 57 220 64 223 75C231 75 238 80 241 87C250 87 257 91 260 96H150Z"
          fill="url(#cloud)"
          fillOpacity="0.8"
        />
      </G>
      <Rect fill="url(#fade-screen)" height={unitsTall} width={unitsWide} y={top} />
      <Rect fill="url(#fade-header)" height={unitsTall} width={unitsWide} y={top} />
    </Svg>
  );
}

function FadeGradient(props: { readonly color: string; readonly id: string }) {
  return (
    <LinearGradient
      gradientUnits="userSpaceOnUse"
      id={props.id}
      x1="0"
      x2="0"
      y1="0"
      y2={SCENE_HEIGHT}
    >
      {FADE_STOPS.map(([offset, opacity]) => (
        <Stop key={offset} offset={offset} stopColor={props.color} stopOpacity={opacity} />
      ))}
    </LinearGradient>
  );
}
