import { Platform, RefreshControl, type RefreshControlProps } from "react-native";

/** UIRefreshControl's default tint (systemGray). */
const IOS_SPINNER_GRAY = "#8E8E93";

/**
 * Pull to refresh. Android's SwipeRefreshLayout draws a Material disc with a
 * shadow; a transparent disc and the iOS gray leave only a bare spinner, like
 * UIRefreshControl. ScrollView clones this element and passes the list as its
 * child, so every prop is forwarded.
 */
// ponytail: still Android's arc, not iOS spokes; replace with a gesture-driven JS control if users notice.
export function AppRefreshControl(props: RefreshControlProps) {
  if (Platform.OS !== "android") return <RefreshControl {...props} />;
  return (
    <RefreshControl progressBackgroundColor="transparent" colors={[IOS_SPINNER_GRAY]} {...props} />
  );
}
