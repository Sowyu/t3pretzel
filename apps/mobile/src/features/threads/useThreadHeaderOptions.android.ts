import type { useThreadHeaderOptions as useIosThreadHeaderOptions } from "./useThreadHeaderOptions";

const ANDROID_THREAD_HEADER_OPTIONS = {};

/** Android draws its own floating glass header over the feed, so no native header options. */
export function useThreadHeaderOptions(
  _props: Parameters<typeof useIosThreadHeaderOptions>[0],
): ReturnType<typeof useIosThreadHeaderOptions> {
  return {
    options: ANDROID_THREAD_HEADER_OPTIONS,
    sidebar: true,
    fallback: null,
  };
}
