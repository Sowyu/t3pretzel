import type { ReactNode } from "react";
import { View } from "react-native";

/** Outer frame of one work-log group in the feed. `continues` drops the gap before the next group. */
export function WorkLogBlock({
  children,
  layout = "standalone",
  continues = false,
}: {
  children: ReactNode;
  layout?: "standalone" | "group-header";
  continues?: boolean | undefined;
}) {
  return (
    <View className={continues || layout === "group-header" ? "-mx-1 px-1" : "-mx-1 mb-1 px-1"}>
      {children}
    </View>
  );
}

/** Stacks work rows with the hairline gap collapsedWorkLogHeight assumes. */
export function WorkLogRows({ children }: { children: ReactNode }) {
  return <View className="gap-px">{children}</View>;
}

/** The 24pt leading icon column shared by work rows and the subagent card. */
export function WorkLogIconSlot({ children }: { children: ReactNode }) {
  return <View className="relative h-6 w-6 shrink-0 items-center justify-center">{children}</View>;
}
