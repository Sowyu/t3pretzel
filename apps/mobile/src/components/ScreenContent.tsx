import type { ReactNode } from "react";
import { Platform, View } from "react-native";

/**
 * Android body below an in-flow header. Content sits flat on the screen's
 * own background, like iOS; the wrapper only keeps the flex layout the
 * screens were built against.
 */
export function ScreenContent({
  children,
  fitToContents = false,
}: {
  readonly children: ReactNode;
  /** Allow native form sheets to measure their content instead of filling a fixed detent. */
  readonly fitToContents?: boolean;
}) {
  if (Platform.OS !== "android") return children;

  return <View className={fitToContents ? "shrink" : "flex-1"}>{children}</View>;
}
