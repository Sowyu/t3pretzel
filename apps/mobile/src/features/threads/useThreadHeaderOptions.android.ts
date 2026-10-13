import type { useThreadHeaderOptions as useIosThreadHeaderOptions } from "./useThreadHeaderOptions";

export function useThreadHeaderOptions(
  _props: Parameters<typeof useIosThreadHeaderOptions>[0],
): ReturnType<typeof useIosThreadHeaderOptions> {
  return {
    // The feed scrolls under the bar and its scrim, as under iOS's glass header.
    options: { headerTransparent: true },
    // Android renders header actions as children, not native item factories.
    optionsVersion: [],
    sidebar: true,
    fallback: null,
  };
}
