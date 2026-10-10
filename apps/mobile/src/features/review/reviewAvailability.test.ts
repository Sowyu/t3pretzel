import { describe, expect, it } from "vite-plus/test";

import { resolveReviewAvailability, resolveReviewSectionError } from "./reviewAvailability";

describe("resolveReviewAvailability", () => {
  it("keeps section navigation available when another section is cached offline", () => {
    expect(
      resolveReviewAvailability({
        hasEnvironmentPresentation: true,
        isEnvironmentConnected: false,
        hasCachedSelectedDiff: false,
        hasAnyCachedDiff: true,
      }),
    ).toEqual({
      showConnectionNotice: true,
      showSectionToolbar: true,
    });
  });

  it("hides section navigation when no review section is available offline", () => {
    expect(
      resolveReviewAvailability({
        hasEnvironmentPresentation: true,
        isEnvironmentConnected: false,
        hasCachedSelectedDiff: false,
        hasAnyCachedDiff: false,
      }),
    ).toEqual({
      showConnectionNotice: true,
      showSectionToolbar: false,
    });
  });

  it("shows cached selected content and navigation while offline", () => {
    expect(
      resolveReviewAvailability({
        hasEnvironmentPresentation: true,
        isEnvironmentConnected: false,
        hasCachedSelectedDiff: true,
        hasAnyCachedDiff: true,
      }),
    ).toEqual({
      showConnectionNotice: false,
      showSectionToolbar: true,
    });
  });
});

describe("resolveReviewSectionError", () => {
  it("ignores a failed latest-turn diff while a git section is open", () => {
    const errors = {
      diffPreviewError: null,
      turnDiffError: "turn failed",
      stickyTurnError: "turn failed",
    };
    expect(resolveReviewSectionError({ ...errors, selectedKind: "working-tree" })).toBeNull();
    expect(resolveReviewSectionError({ ...errors, selectedKind: "turn" })).toBe("turn failed");
    expect(
      resolveReviewSectionError({
        selectedKind: "turn",
        diffPreviewError: "git failed",
        turnDiffError: null,
        stickyTurnError: null,
      }),
    ).toBeNull();
  });
});
