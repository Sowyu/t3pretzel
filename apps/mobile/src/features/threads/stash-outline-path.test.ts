import { describe, expect, it } from "vite-plus/test";

import { stashOutlinePath } from "./stash-outline-path";

const base = { width: 300, height: 200, top: 40, tabRadius: 18, surfaceRadius: 26, fillet: 12 };

describe("stashOutlinePath", () => {
  it("draws one rounded rect when the panel spans the composer", () => {
    const paths = stashOutlinePath({ ...base, tabX: 0, tabWidth: 300 });
    expect(paths.fillet).toBeNull();
    expect(paths.outline.startsWith("M18.5,0.5 H281.5")).toBe(true);
    expect(paths.outline).not.toContain("Q");
  });

  it("curves the composer's top edge into the tab and fills the sliver under it", () => {
    const paths = stashOutlinePath({ ...base, tabX: 200, tabWidth: 100 });
    // The top edge runs to the fillet start, bends around the tab corner, then
    // climbs the tab's left edge.
    expect(paths.outline).toContain("H188 Q200,40 200,28 V18.5");
    // The right edge runs straight from the tab into the composer: no arc at y=40.
    expect(paths.outline).toContain("A18,18 0 0 1 299.5,18.5 V173.5");
    expect(paths.fillet).toBe("M188,40 Q200,40 200,28 L200,40 Z");
  });

  it("drops the fillet when the tab starts inside the composer's corner arc", () => {
    const paths = stashOutlinePath({ ...base, tabX: 20, tabWidth: 280 });
    expect(paths.fillet).toBeNull();
    expect(paths.outline).toContain("H20 Q20,40 20,40");
  });
});
