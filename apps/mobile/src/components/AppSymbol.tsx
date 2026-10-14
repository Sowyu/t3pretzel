import type { Icon } from "@tabler/icons-react-native/types";
/*
 * Keep these as per-icon exports. Importing the package root eagerly registers
 * the entire Tabler icon set in Metro.
 */
import IconAlignLeft from "@tabler/icons-react-native/IconAlignLeft";
import IconArrowUpRight from "@tabler/icons-react-native/IconArrowUpRight";
import IconArrowUpRightCircle from "@tabler/icons-react-native/IconArrowUpRightCircle";
import IconBrain from "@tabler/icons-react-native/IconBrain";
import IconCircleDashed from "@tabler/icons-react-native/IconCircleDashed";
import IconPlusMinus from "@tabler/icons-react-native/IconPlusMinus";
import IconFileDiff from "@tabler/icons-react-native/IconFileDiff";
import IconFolderPlus from "@tabler/icons-react-native/IconFolderPlus";
import IconGitPullRequestClosed from "@tabler/icons-react-native/IconGitPullRequestClosed";
import IconGitPullRequestDraft from "@tabler/icons-react-native/IconGitPullRequestDraft";
import IconGitCommit from "@tabler/icons-react-native/IconGitCommit";
import IconGitBranch from "@tabler/icons-react-native/IconGitBranch";
import IconGitMerge from "@tabler/icons-react-native/IconGitMerge";
import IconGitPullRequest from "@tabler/icons-react-native/IconGitPullRequest";
import IconKeyboard from "@tabler/icons-react-native/IconKeyboard";
import IconKeyboardHide from "@tabler/icons-react-native/IconKeyboardHide";
import IconLayoutColumns from "@tabler/icons-react-native/IconLayoutColumns";
import IconLayoutSidebar from "@tabler/icons-react-native/IconLayoutSidebar";
import IconLayoutSidebarRight from "@tabler/icons-react-native/IconLayoutSidebarRight";
import IconLetterSpacing from "@tabler/icons-react-native/IconLetterSpacing";
import IconMessageCircleQuestion from "@tabler/icons-react-native/IconMessageCircleQuestion";
import IconMessageCirclePlus from "@tabler/icons-react-native/IconMessageCirclePlus";
import IconPlug from "@tabler/icons-react-native/IconPlug";
import IconPinnedOff from "@tabler/icons-react-native/IconPinnedOff";
import IconStethoscope from "@tabler/icons-react-native/IconStethoscope";
import IconShieldExclamation from "@tabler/icons-react-native/IconShieldExclamation";
import IconTarget from "@tabler/icons-react-native/IconTarget";
import IconTextDecrease from "@tabler/icons-react-native/IconTextDecrease";
import IconTextIncrease from "@tabler/icons-react-native/IconTextIncrease";
import IconUserCheck from "@tabler/icons-react-native/IconUserCheck";
import IconUserQuestion from "@tabler/icons-react-native/IconUserQuestion";
import IconWifiOff from "@tabler/icons-react-native/IconWifiOff";
import type { AndroidSymbol, SFSymbol, SymbolViewProps } from "expo-symbols";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { withUniwind } from "uniwind";
import { IONICONS, type IoniconElement, type IoniconName } from "./ionicons";

// Android draws Ionicons, the closest open set to SF Symbols (outline for
// regular names, filled for `.fill`). Tabler fills the gaps Ionicons has no
// glyph for, and draws the git icons on both platforms like AppSymbol.ios.tsx.
type AndroidIcon = IoniconName | Icon;

const ANDROID_ICON_BY_SF_SYMBOL = {
  plusminus: IconPlusMinus,
  "git.pull-request.closed": IconGitPullRequestClosed,
  "git.pull-request.draft": IconGitPullRequestDraft,
  "git.commit": IconGitCommit,
  "arrow.branch": IconGitBranch,
  "arrow.left": "arrow-back-outline",
  "arrow.right": "arrow-forward-outline",
  "arrow.left.arrow.right": "swap-horizontal-outline",
  "arrow.clockwise": "refresh-outline",
  "arrow.down": "arrow-down-outline",
  "arrow.down.circle": "arrow-down-circle-outline",
  "arrow.right.circle": "arrow-forward-circle-outline",
  "arrow.triangle.branch": IconGitBranch,
  "arrow.triangle.merge": IconGitMerge,
  "arrow.triangle.pull": IconGitPullRequest,
  "square.3.layers.3d": "layers-outline",
  "arrow.turn.left.up": "return-up-back-outline",
  "arrow.up": "arrow-up-outline",
  "arrow.up.circle": "arrow-up-circle-outline",
  "arrow.up.left.and.arrow.down.right": "expand-outline",
  "arrow.down.right.and.arrow.up.left": "contract-outline",
  "arrow.up.right": IconArrowUpRight,
  "arrow.up.right.circle": IconArrowUpRightCircle,
  "arrow.uturn.backward": "arrow-undo-outline",
  "arrow.uturn.forward": "arrow-redo-outline",
  archivebox: "archive-outline",
  "archivebox.fill": "archive",
  "bell.badge": "notifications-outline",
  "bolt.circle": "flash-outline",
  "bolt.horizontal.circle": "flash-outline",
  brain: IconBrain,
  "cable.connector": IconPlug,
  camera: "camera-outline",
  car: "car-outline",
  "chart.bar.xaxis": "stats-chart-outline",
  checkmark: "checkmark-outline",
  "checkmark.circle": "checkmark-circle-outline",
  "checkmark.circle.fill": "checkmark-circle",
  circle: "ellipse-outline",
  "circle.dashed": IconCircleDashed,
  "circle.inset.filled": "radio-button-on-outline",
  clock: "time-outline",
  timer: "timer-outline",
  ticket: "ticket-outline",
  cloud: "cloud-outline",
  cube: "cube-outline",
  "chevron.down": "chevron-down-outline",
  "chevron.left": "chevron-back-outline",
  "chevron.left.forwardslash.chevron.right": "code-slash-outline",
  "chevron.right": "chevron-forward-outline",
  "chevron.up": "chevron-up-outline",
  desktopcomputer: "desktop-outline",
  doc: "document-outline",
  "doc.on.doc": "copy-outline",
  "doc.text": "document-text-outline",
  "file.diff": IconFileDiff,
  ellipsis: "ellipsis-horizontal",
  moon: "moon-outline",
  "ellipsis.circle": "ellipsis-horizontal-circle-outline",
  "exclamationmark.triangle": "warning-outline",
  "exclamationmark.circle": "alert-circle-outline",
  eye: "eye-outline",
  "eye.slash": "eye-off-outline",
  folder: "folder-outline",
  "folder.badge.plus": IconFolderPlus,
  "folder.fill": "folder",
  gearshape: "settings-outline",
  globe: "globe-outline",
  hammer: "hammer-outline",
  headphones: "headset-outline",
  house: "home-outline",
  "info.circle": "information-circle-outline",
  internaldrive: "server-outline",
  iphone: "phone-portrait-outline",
  keyboard: IconKeyboard,
  laptopcomputer: "laptop-outline",
  link: "link-outline",
  "list.number": "list-outline",
  "line.3.horizontal": "menu-outline",
  "line.3.horizontal.decrease": "filter-outline",
  "line.3.horizontal.decrease.circle": "filter-circle-outline",
  "line.3.horizontal.decrease.circle.fill": "filter-circle",
  // Tabler has no Apple desktops; the closest silhouettes stand in on Android.
  macmini: "server-outline",
  macstudio: "desktop-outline",
  magnifyingglass: "search-outline",
  mic: "mic-outline",
  paintbrush: "brush-outline",
  pencil: "pencil-outline",
  "person.crop.circle": "person-circle-outline",
  "person.2": "people-outline",
  "person.fill.checkmark": IconUserCheck,
  "person.fill.xmark": "person-remove",
  "person.badge.clock": IconUserQuestion,
  "person.badge.plus": "person-add-outline",
  photo: "image-outline",
  pin: "pin-outline",
  "pin.slash": IconPinnedOff,
  play: "play-outline",
  plus: "add-outline",
  minus: "remove-outline",
  "qrcode.viewfinder": "qr-code-outline",
  "point.3.connected.trianglepath.dotted": "share-social-outline",
  "point.topleft.down.curvedto.point.bottomright.up": "git-merge-outline",
  safari: "compass-outline",
  "server.rack": "server-outline",
  stethoscope: IconStethoscope,
  "sidebar.left": IconLayoutSidebar,
  "sidebar.right": IconLayoutSidebarRight,
  "slider.horizontal.3": "options-outline",
  "square.and.arrow.up": "share-outline",
  "square.and.pencil": "create-outline",
  "square.on.square": "copy-outline",
  "square.grid.2x2": "grid-outline",
  "square.split.2x1": IconLayoutColumns,
  star: "star-outline",
  "star.fill": "star",
  "sun.max": "sunny-outline",
  "stop.fill": "stop",
  target: IconTarget,
  terminal: "terminal-outline",
  "text.alignleft": IconAlignLeft,
  "text.bubble": "chatbubble-ellipses-outline",
  "text.bubble.fill": "chatbubble-ellipses",
  "questionmark.bubble": IconMessageCircleQuestion,
  "exclamationmark.shield": IconShieldExclamation,
  "bubble.left.and.bubble.right": "chatbubbles-outline",
  "bubble.left": "chatbubble-outline",
  sparkles: "sparkles-outline",
  "plus.bubble": IconMessageCirclePlus,
  "text.word.spacing": IconLetterSpacing,
  "textformat.size": "text-outline",
  "textformat.size.larger": IconTextIncrease,
  "textformat.size.smaller": IconTextDecrease,
  "tray.and.arrow.up": "push-outline",
  "tray.and.arrow.down": "download-outline",
  "tray.full": "file-tray-full-outline",
  trash: "trash-outline",
  wifi: "wifi-outline",
  "wifi.slash": IconWifiOff,
  xmark: "close-outline",
  "xmark.circle.fill": "close-circle",
} satisfies Partial<
  Record<
    SFSymbol | "git.pull-request.closed" | "git.pull-request.draft" | "git.commit" | "file.diff",
    AndroidIcon
  >
>;
const SF_ICON_LOOKUP: Partial<
  Record<
    SFSymbol | "git.pull-request.closed" | "git.pull-request.draft" | "git.commit" | "file.diff",
    AndroidIcon
  >
> = ANDROID_ICON_BY_SF_SYMBOL;

// Callers can pass `{ ios, android }` names where `android` is a Material
// icon name (the raw expo-symbols contract). Resolve those here too so the
// android key keeps working through this wrapper — it wins over the SF map
// when both match (e.g. folder vs folder_open for expanded project groups).
const ANDROID_ICON_BY_MATERIAL_NAME = {
  auto_awesome: "sparkles-outline",
  bolt: "flash-outline",
  build: "build-outline",
  chat: "chatbubble-outline",
  chat_bubble: "chatbubble-outline",
  check: "checkmark-outline",
  close: "close-outline",
  construction: "hammer-outline",
  content_copy: "copy-outline",
  desktop_windows: "desktop-outline",
  edit: "create-outline",
  error: "alert-circle-outline",
  folder: "folder-outline",
  folder_open: "folder-open-outline",
  keyboard: IconKeyboard,
  keyboard_arrow_down: "chevron-down-outline",
  keyboard_arrow_up: "chevron-up-outline",
  keyboard_hide: IconKeyboardHide,
  lock: "lock-closed-outline",
  more_vert: "ellipsis-vertical",
  merge: IconGitMerge,
  psychology: IconBrain,
  public: "globe-outline",
  remove: "remove-outline",
  smartphone: "phone-portrait-outline",
  terminal: "terminal-outline",
  visibility: "eye-outline",
} satisfies Partial<Record<AndroidSymbol, AndroidIcon>>;

export type { SFSymbol } from "expo-symbols";
export type AppSymbolName =
  | keyof typeof ANDROID_ICON_BY_SF_SYMBOL
  | {
      ios: SFSymbol;
      android: keyof typeof ANDROID_ICON_BY_MATERIAL_NAME;
    };

export type AppSymbolViewProps = Omit<SymbolViewProps, "name"> & { name: AppSymbolName };

export function isAppSymbolName(name: string): name is Extract<AppSymbolName, string> {
  return Object.prototype.hasOwnProperty.call(ANDROID_ICON_BY_SF_SYMBOL, name);
}

// Scales stroke widths so Android icons get lighter or heavier where SF
// Symbols do. 1 is SF regular: Ionicons strokes 32 on 512, Tabler 1.75 on 24.
function strokeScaleForWeight(weight: SymbolViewProps["weight"]) {
  switch (typeof weight === "object" ? weight.ios : weight) {
    case "ultraLight":
    case "thin":
    case "light":
      return 0.85;
    case "medium":
      return 1.15;
    case "semibold":
    case "bold":
    case "heavy":
    case "black":
      return 1.3;
    default:
      return 1;
  }
}

function IoniconElementView(props: {
  readonly element: IoniconElement;
  readonly color: SymbolViewProps["tintColor"];
  readonly strokeScale: number;
}) {
  const { element: el, color } = props;
  const paint = el.w
    ? {
        fill: el.fill ? color : "none",
        stroke: color,
        strokeWidth: el.w * props.strokeScale,
        strokeLinecap: el.cap as "round" | "butt" | "square" | undefined,
        strokeLinejoin: el.join as "round" | "miter" | "bevel" | undefined,
      }
    : { fill: color, fillRule: el.evenOdd ? ("evenodd" as const) : undefined };
  switch (el.t) {
    case "path":
      return <Path d={el.d} {...paint} />;
    case "circle":
      return <Circle cx={el.cx} cy={el.cy} r={el.r} {...paint} />;
    case "ellipse":
      return <Ellipse cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} {...paint} />;
    case "rect":
      return (
        <Rect
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={el.rx}
          ry={el.ry}
          {...paint}
        />
      );
  }
}

function AppSymbolView(props: AppSymbolViewProps) {
  const materialName = typeof props.name === "string" ? undefined : props.name.android;
  const sfSymbol = typeof props.name === "string" ? props.name : props.name.ios;
  const androidIcon =
    (materialName ? ANDROID_ICON_BY_MATERIAL_NAME[materialName] : undefined) ??
    (sfSymbol ? SF_ICON_LOOKUP[sfSymbol] : undefined);

  if (!androidIcon) {
    return props.fallback ?? null;
  }

  const strokeScale = strokeScaleForWeight(props.weight);
  const color = props.tintColor ?? "black";
  if (typeof androidIcon === "string") {
    const size = props.size ?? 24;
    return (
      <Svg
        accessibilityLabel={props.accessibilityLabel}
        height={size}
        style={props.style}
        testID={props.testID}
        viewBox="0 0 512 512"
        width={size}
      >
        {IONICONS[androidIcon].map((element: IoniconElement) => (
          <IoniconElementView
            key={element.d ?? JSON.stringify(element)}
            color={color}
            element={element}
            strokeScale={strokeScale}
          />
        ))}
      </Svg>
    );
  }

  const TablerIcon = androidIcon;
  return (
    <TablerIcon
      accessibilityLabel={props.accessibilityLabel}
      color={props.tintColor}
      size={props.size}
      strokeWidth={1.75 * strokeScale}
      style={props.style}
      testID={props.testID}
    />
  );
}

/**
 * expo-symbols and the Android icon fallback both expose tint as a native
 * prop rather than a React Native style. Keep that third-party boundary here
 * so callers can use Uniwind's `tintColorClassName` instead of subscribing to
 * theme variables in every parent component.
 */
export const SymbolView = withUniwind(AppSymbolView);
