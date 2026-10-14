import type { useReviewHeaderPresentation as useIosReviewHeaderPresentation } from "./useReviewHeaderPresentation";
import { useReviewGitMenu } from "./useReviewGitMenu";

export function useReviewHeaderPresentation(
  props: Parameters<typeof useIosReviewHeaderPresentation>[0],
): ReturnType<typeof useIosReviewHeaderPresentation> {
  return {
    title: props.title,
    subtitle: props.subtitle,
    // iOS shows the git branch menu beside "…"; ScreenHeader renders it as a capsule slot.
    gitMenu: useReviewGitMenu(props),
    menuIcon: "ellipsis",
    refreshAction: {
      id: "refresh",
      title: "Refresh current diff",
      disabled: !props.selectedSection || props.selectedSection.isLoading,
      onPress: () => {
        void props.onRefresh();
      },
    },
  };
}
