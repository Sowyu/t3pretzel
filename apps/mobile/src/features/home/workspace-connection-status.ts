import type { WorkspaceState } from "../../state/workspaceModel";

export interface WorkspaceConnectionStatusPresentation {
  readonly label: string;
  /** True while actively working (connecting/syncing) — render a spinner. False for offline/error/idle states — render a wifi-slash icon. */
  readonly showsProgress: boolean;
}

function shouldShowWorkspaceConnectionStatus(state: WorkspaceState): boolean {
  return (
    state.networkStatus === "offline" ||
    state.connectionError !== null ||
    state.hasConnectingEnvironment ||
    state.hasPendingShellSnapshot ||
    (state.hasLoadedShellSnapshot && !state.hasReadyEnvironment)
  );
}

/**
 * A reconnect that has already failed once, or has been trying for longer than
 * a reconnect takes, is an environment we cannot reach right now. The
 * supervisor keeps retrying underneath; the title just stops promising.
 */
function isUnreachable(state: WorkspaceState, stalled: boolean): boolean {
  return (
    state.connectingEnvironments.length > 0 &&
    (stalled ||
      state.connectingEnvironments.every((environment) => environment.connectionError !== null))
  );
}

function workspaceConnectionStatusLabel(state: WorkspaceState, stalled: boolean): string {
  if (state.networkStatus === "offline") return "You are offline";
  const unreachable = isUnreachable(state, stalled);
  if (state.connectingEnvironments.length === 1) {
    const label = state.connectingEnvironments[0]!.environmentLabel;
    return unreachable ? `Can't reach ${label}` : `Reconnecting to ${label}`;
  }
  if (state.connectingEnvironments.length > 1) {
    const count = state.connectingEnvironments.length;
    return unreachable ? `Can't reach ${count} environments` : `Reconnecting ${count} environments`;
  }
  if (state.connectionError !== null) return state.connectionError;
  if (state.hasPendingShellSnapshot) {
    return state.hasLoadedShellSnapshot ? "Syncing threads..." : "Loading threads...";
  }
  return "Not connected";
}

/** Header-title presentation of the connection state, or null while connected. */
export function workspaceConnectionStatusPresentation(
  state: WorkspaceState,
  options: { readonly stalled?: boolean } = {},
): WorkspaceConnectionStatusPresentation | null {
  if (!shouldShowWorkspaceConnectionStatus(state)) return null;
  const stalled = options.stalled === true;
  return {
    label: workspaceConnectionStatusLabel(state, stalled),
    showsProgress:
      state.networkStatus !== "offline" &&
      state.connectionError === null &&
      !isUnreachable(state, stalled) &&
      (state.connectingEnvironments.length > 0 || state.hasPendingShellSnapshot),
  };
}
