import {
  presentThreadShell,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

const DEFAULT_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/** A server-side v2 thread shell for tests; pass only the fields the test reads. */
export function makeRawThreadShell(
  input: Partial<OrchestrationV2ThreadShell> = {},
): OrchestrationV2ThreadShell {
  const id = input.id ?? ThreadId.make("thread-test");
  const providerInstanceId = input.providerInstanceId ?? ProviderInstanceId.make("codex");
  const now = DateTime.makeUnsafe(DEFAULT_TIMESTAMP);
  return {
    id,
    projectId: ProjectId.make("project-test"),
    title: "Thread",
    providerInstanceId,
    modelSelection: { instanceId: providerInstanceId, model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "mobile",
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    ...input,
  };
}

/** A client thread shell as the mobile state atoms expose it; overrides win. */
export function makeThreadShellFixture(
  overrides: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  const environmentId = overrides.environmentId ?? EnvironmentId.make("environment-test");
  const raw = makeRawThreadShell({
    ...(overrides.id === undefined ? {} : { id: overrides.id }),
    ...(overrides.projectId === undefined ? {} : { projectId: overrides.projectId }),
    ...(overrides.providerInstanceId === undefined
      ? {}
      : { providerInstanceId: overrides.providerInstanceId }),
  });
  return { ...presentThreadShell(environmentId, raw), ...overrides };
}
