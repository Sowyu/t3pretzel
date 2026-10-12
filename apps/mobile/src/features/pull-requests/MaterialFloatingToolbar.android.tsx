import type { ReactElement } from "react";

import { GlassSurface } from "../../components/GlassSurface";

/** The bottom toolbar on the composer's floating surface, like the iOS glass toolbar. */
export function MaterialFloatingToolbar(props: { readonly children: ReactElement }) {
  return (
    <GlassSurface className="self-center px-2 py-2" style={{ maxWidth: "100%" }}>
      {props.children}
    </GlassSurface>
  );
}
