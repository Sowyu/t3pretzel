import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";

import { mobilePreferencesAtom } from "../../state/preferences";

/**
 * Settings → Experimental → Thinking traces. Device-local and off unless the
 * user turned it on, so an unloaded preference keeps the feed as it was.
 */
export function useThinkingTracesEnabled(): boolean {
  const preferences = useAtomValue(mobilePreferencesAtom);
  return AsyncResult.isSuccess(preferences) && preferences.value.thinkingTracesEnabled === true;
}
