import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ReviewSectionItem } from "./reviewModel";
import type { ScreenHeaderMenuItem, ScreenHeaderMenu } from "../../components/ScreenHeader.types";
import type { AppSymbolName } from "../../components/AppSymbol";
import { useReviewGitMenu } from "./useReviewGitMenu";

interface ReviewHeaderPresentation {
  readonly title: string;
  readonly subtitle: string;
  readonly gitMenu: ScreenHeaderMenu | null;
  readonly menuIcon: AppSymbolName;
  readonly refreshAction?: ScreenHeaderMenuItem;
}

export function useReviewHeaderPresentation(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly title: string;
  readonly subtitle: string;
  readonly selectedThreadCwd: string | null;
  readonly selectedSection: ReviewSectionItem | null;
  readonly onRefresh: () => Promise<void>;
}): ReviewHeaderPresentation {
  return {
    title: props.title,
    subtitle: props.subtitle,
    menuIcon: "ellipsis",
    gitMenu: useReviewGitMenu(props),
  };
}
