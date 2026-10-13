import type { NativeReviewDiffHighlightScheme } from "../diffs/nativeReviewDiffHighlighter";

// Pure key-derivation helpers for the native review diff bridge. Kept free of
// react-native / hook imports so they stay unit-testable in node.

function hashReviewDiffKey(diff: string | null | undefined): string {
  if (!diff) {
    return "empty";
  }

  let hash = 5381;
  for (let index = 0; index < diff.length; index += 1) {
    hash = (hash * 33) ^ diff.charCodeAt(index);
  }

  return `${diff.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * A new key makes the native view drop every token, so it only covers what changes token
 * meaning. Row counts are left out on purpose. A lazily loaded file patch or a new comment
 * adds rows whose IDs embed their file's cache key, so the tokens already drawn stay valid
 * and the diff doesn't flash back to plain text.
 */
export function buildNativeReviewTokensResetKey(input: {
  readonly threadKey: string | null;
  readonly sectionId: string | null;
  readonly scheme: NativeReviewDiffHighlightScheme;
  readonly diff: string | null | undefined;
}): string {
  return [
    input.threadKey ?? "none",
    input.sectionId ?? "none",
    input.scheme,
    hashReviewDiffKey(input.diff),
  ].join(":");
}
