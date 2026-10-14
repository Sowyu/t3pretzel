import { NativeStackScreenOptions } from "../../native/StackHeader";
import { AndroidThreadListToolbar } from "./AndroidThreadListToolbar";
import type { HomeHeaderProps } from "./HomeHeader.types";

export type { HomeHeaderEnvironment } from "./HomeHeader.types";

/** The phone Home bar. Environment and project filters are the chips above the list, as on iOS. */
export function HomeHeader(props: HomeHeaderProps) {
  return (
    <>
      <NativeStackScreenOptions options={{ headerShown: false }} />
      <AndroidThreadListToolbar
        searchQuery={props.searchQuery}
        onSearchQueryChange={props.onSearchQueryChange}
        onOpenSettings={props.onOpenSettings}
        onOpenEnvironments={props.onOpenEnvironments}
      />
    </>
  );
}
