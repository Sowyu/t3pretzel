import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

export type ThreadInspectorMode = "route" | "git" | "files";

const INSPECTOR_PREWARM_DELAY_MS = 350;

function InspectorContentPane(props: {
  readonly children: ReactNode;
  readonly mounted: boolean;
  readonly visible: boolean;
}) {
  if (!props.mounted) {
    return null;
  }

  return (
    <View
      accessibilityElementsHidden={!props.visible}
      focusable={props.visible}
      importantForAccessibility={props.visible ? "auto" : "no-hide-descendants"}
      pointerEvents={props.visible ? "auto" : "none"}
      style={{
        position: "absolute",
        inset: 0,
        opacity: props.visible ? 1 : 0,
        zIndex: props.visible ? 1 : 0,
      }}
    >
      {props.children}
    </View>
  );
}

// Panes take render functions, not component types: a new function identity
// re-renders the pane in place instead of remounting it and losing its state.
export function ThreadInspectorContentStack(props: {
  readonly renderFiles: () => ReactNode;
  readonly renderGit: () => ReactNode;
  readonly mode: ThreadInspectorMode;
  readonly renderRoute?: () => ReactNode;
}) {
  const [mountedModes, setMountedModes] = useState<ReadonlySet<ThreadInspectorMode>>(
    () => new Set([props.mode]),
  );

  useEffect(() => {
    setMountedModes((current) => {
      if (current.has(props.mode)) {
        return current;
      }
      return new Set([...current, props.mode]);
    });

    if (props.mode === "route") {
      return;
    }

    // The file tree is expensive to detach because UIKit rebuilds its focus
    // graph. Keep both chat inspectors alive after the opening animation so a
    // later Files/Git switch only changes visibility.
    const alternateMode = props.mode === "files" ? "git" : "files";
    const timeout = setTimeout(() => {
      setMountedModes((current) => {
        if (current.has(alternateMode)) {
          return current;
        }
        return new Set([...current, alternateMode]);
      });
    }, INSPECTOR_PREWARM_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [props.mode]);

  return (
    <View className="flex-1">
      <InspectorContentPane
        mounted={mountedModes.has("files") || props.mode === "files"}
        visible={props.mode === "files"}
      >
        {props.renderFiles()}
      </InspectorContentPane>
      <InspectorContentPane
        mounted={mountedModes.has("git") || props.mode === "git"}
        visible={props.mode === "git"}
      >
        {props.renderGit()}
      </InspectorContentPane>
      {props.renderRoute ? (
        <InspectorContentPane
          mounted={mountedModes.has("route") || props.mode === "route"}
          visible={props.mode === "route"}
        >
          {props.renderRoute()}
        </InspectorContentPane>
      ) : null}
    </View>
  );
}
