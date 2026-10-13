export function resolveReviewAvailability(input: {
  readonly hasEnvironmentPresentation: boolean;
  readonly isEnvironmentConnected: boolean;
  readonly hasCachedSelectedDiff: boolean;
  readonly hasAnyCachedDiff: boolean;
}): {
  readonly showConnectionNotice: boolean;
  readonly showSectionToolbar: boolean;
} {
  const showConnectionNotice =
    input.hasEnvironmentPresentation &&
    !input.isEnvironmentConnected &&
    !input.hasCachedSelectedDiff;

  return {
    showConnectionNotice,
    showSectionToolbar: !showConnectionNotice || input.hasAnyCachedDiff,
  };
}

/**
 * The latest turn diff is fetched even while a git section is open, so its error only
 * counts when a turn is selected. A git section shows only the git preview error.
 */
export function resolveReviewSectionError(input: {
  readonly selectedKind: "turn" | "working-tree" | "branch-range" | null;
  readonly diffPreviewError: string | null;
  readonly turnDiffError: string | null;
  readonly stickyTurnError: string | null;
}): string | null {
  return input.selectedKind === "turn"
    ? (input.turnDiffError ?? input.stickyTurnError)
    : input.diffPreviewError;
}
