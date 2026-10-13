import type { ViewProps } from "react-native";

import { glassBackdropView } from "../../modules/t3-liquid-glass";

/**
 * Marks content that Android Liquid Glass samples: floating glass (headers,
 * tab bar, composer, menus) refracts whatever this wraps. Glass never samples
 * a source that contains it, so wrap the scrolling content, not the screen
 * that also holds its header.
 *
 * Always the same native view on Android, whatever the glass setting, so
 * toggling glass never remounts the content. With nothing sampling it, it
 * draws like a plain View.
 */
const Backdrop = glassBackdropView();

export function GlassBackdropSource(props: ViewProps) {
  // iOS (and anywhere the module is missing) keeps the tree exactly as it was.
  if (!Backdrop) return <>{props.children}</>;
  return <Backdrop collapsable={false} {...props} />;
}
