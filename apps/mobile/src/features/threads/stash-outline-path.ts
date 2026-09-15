/**
 * SVG path data for the outline around the stash tab and the composer as one
 * shape, in the overlay's coordinates (origin at the tab row's top-left).
 * `top` is the composer's top edge. The tab is flush with the right edge, so
 * the outline runs straight down from the tab into the composer on that side;
 * on the left it curves back into the composer with a concave fillet, and the
 * sliver under that curve is returned separately so it can be filled.
 */
export function stashOutlinePath(input: {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly tabX: number;
  readonly tabWidth: number;
  readonly tabRadius: number;
  readonly surfaceRadius: number;
  readonly fillet: number;
}): { readonly outline: string; readonly fillet: string | null } {
  const i = 0.5; // stroke centred on the pixel grid
  const W = input.width - i;
  const H = input.height - i;
  const rt = Math.min(input.tabRadius, input.top / 2);
  const r = Math.min(input.surfaceRadius, (H - input.top) / 2);
  const bottom = `V${H - r} A${r},${r} 0 0 1 ${W - r},${H} H${i + r} A${r},${r} 0 0 1 ${i},${H - r}`;
  if (input.tabX <= i) {
    return {
      outline: `M${i + rt},${i} H${W - rt} A${rt},${rt} 0 0 1 ${W},${i + rt} ${bottom} V${i + rt} A${rt},${rt} 0 0 1 ${i + rt},${i} Z`,
      fillet: null,
    };
  }
  const y0 = input.top;
  const tx = input.tabX;
  const f = Math.max(0, Math.min(input.fillet, tx - i - r, y0 - rt));
  return {
    outline: `M${i + r},${y0} H${tx - f} Q${tx},${y0} ${tx},${y0 - f} V${i + rt} A${rt},${rt} 0 0 1 ${tx + rt},${i} H${W - rt} A${rt},${rt} 0 0 1 ${W},${i + rt} ${bottom} V${y0 + r} A${r},${r} 0 0 1 ${i + r},${y0} Z`,
    fillet: f > 0 ? `M${tx - f},${y0} Q${tx},${y0} ${tx},${y0 - f} L${tx},${y0} Z` : null,
  };
}
