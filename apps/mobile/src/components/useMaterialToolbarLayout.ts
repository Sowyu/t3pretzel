import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useScaledTextRole } from "../features/settings/appearance/useScaledTextRole";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

/**
 * Shared Android header geometry, sized like the iOS navigation bar. Embedded
 * (sheet) headers leave room above for the sheet grabber.
 */
export function useMaterialToolbarLayout(embedded = false) {
  const insets = useSafeAreaInsets();
  const title = useScaledTextRole("title");
  const subtitle = useScaledTextRole("label");
  const { scale } = useAndroidControlSizing();
  const { fontScale } = useWindowDimensions();
  return {
    height: Math.ceil(
      Math.max(48, 52 * scale, (title.lineHeight + subtitle.lineHeight) * fontScale + 1),
    ),
    paddingTop: embedded ? 14 * scale : Math.max(insets.top, 8 * scale),
    paddingBottom: 4 * scale,
  };
}
