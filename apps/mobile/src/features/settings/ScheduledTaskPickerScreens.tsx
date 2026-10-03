import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import type { VcsRef } from "@t3tools/client-runtime/state/vcs";
import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { ThemedSwitch } from "../../components/ThemedSwitch";
import { cn } from "../../lib/cn";
import { selectionHaptic } from "../../lib/haptics";
import { buildModelOptions, groupByProvider } from "../../lib/modelOptions";
import { resolveProviderOptionDescriptors } from "../../lib/providerOptions";
import { useEnvironmentServerConfig, useProjects } from "../../state/entities";
import { useDebouncedValue, usePaginatedBranches } from "../../state/queries";
import { branchBadgeLabel } from "../threads/new-task-flow-provider";
import { ThreadSettingsPickerScreen } from "../threads/ThreadSettingsSheet";
import { SettingsScreen } from "./components/SettingsScreen";
import { useScheduledTaskEditor } from "./scheduled-task-editor";

function MissingTaskDraft() {
  return (
    <SettingsScreen title="Scheduled task">
      <Text className="p-5 text-base text-foreground-muted">Open a scheduled task form first.</Text>
    </SettingsScreen>
  );
}

export function ScheduledTaskModelPickerRouteScreen() {
  const navigation = useNavigation();
  const { editor, setEditor } = useScheduledTaskEditor();
  const config = useEnvironmentServerConfig(editor?.environmentId ?? null);
  const selectedModel = editor?.draft.modelSelection ?? null;
  const models = useMemo(() => buildModelOptions(config, selectedModel), [config, selectedModel]);
  const providerGroups = useMemo(() => groupByProvider(models), [models]);
  const selectedOption = models.find(
    (option) =>
      option.selection.instanceId === selectedModel?.instanceId &&
      option.selection.model === selectedModel.model,
  );
  const optionDescriptors = useMemo(
    () =>
      resolveProviderOptionDescriptors({
        capabilities: selectedOption?.capabilities,
        selections: selectedModel?.options,
      }),
    [selectedOption?.capabilities, selectedModel?.options],
  );

  if (!editor) return <MissingTaskDraft />;

  return (
    <ThreadSettingsPickerScreen
      environmentId={editor.environmentId}
      providerGroups={providerGroups}
      selectedModel={selectedModel}
      onSelectModel={(option) =>
        setEditor((current) =>
          current
            ? {
                ...current,
                draft: {
                  ...current.draft,
                  modelSelection: option.selection,
                  modelSelectionIsExplicit: true,
                },
              }
            : current,
        )
      }
      optionDescriptors={optionDescriptors}
      onUpdateOptionSelections={(options) =>
        setEditor((current) =>
          current?.draft.modelSelection
            ? {
                ...current,
                draft: {
                  ...current.draft,
                  modelSelection: { ...current.draft.modelSelection, options },
                  modelSelectionIsExplicit: true,
                },
              }
            : current,
        )
      }
      runtimeMode={editor.draft.runtimeMode}
      onUpdateRuntimeMode={(runtimeMode) =>
        setEditor((current) =>
          current
            ? {
                ...current,
                draft: { ...current.draft, runtimeMode },
              }
            : current,
        )
      }
      onClose={() => navigation.goBack()}
    />
  );
}

export function ScheduledTaskBranchPickerRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { editor, setEditor } = useScheduledTaskEditor();
  const projects = useProjects();
  const project =
    projects.find(
      (entry) =>
        entry.environmentId === editor?.environmentId && entry.id === editor.draft.projectId,
    ) ?? null;
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 150);
  const branches = usePaginatedBranches({
    environmentId: editor?.environmentId ?? null,
    cwd: project?.workspaceRoot ?? null,
    query: debouncedQuery,
  });
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBranches = useMemo(
    () =>
      branches.refs.filter(
        (branch) => !branch.isRemote && branch.name.toLowerCase().includes(normalizedQuery),
      ),
    [branches.refs, normalizedQuery],
  );
  const selectedBranchName =
    editor?.draft.baseRef ??
    visibleBranches.find((branch) => branch.current)?.name ??
    visibleBranches.find((branch) => branch.isDefault)?.name ??
    null;
  const loading =
    query.trim() !== debouncedQuery.trim() || (branches.isPending && branches.data === null);
  const error = project ? branches.error : "This project is no longer available.";

  const selectBranch = useCallback(
    (branch: VcsRef) => {
      void selectionHaptic();
      setEditor((current) =>
        current ? { ...current, draft: { ...current.draft, baseRef: branch.name } } : current,
      );
      navigation.goBack();
    },
    [navigation, setEditor],
  );

  const renderBranch = useCallback(
    ({ item, index }: { readonly item: VcsRef; readonly index: number }) => (
      <BranchRow
        badge={branchBadgeLabel({ branch: item, project })}
        branch={item}
        isFirst={index === 0}
        isLast={index === visibleBranches.length - 1}
        selected={selectedBranchName === item.name}
        onSelect={selectBranch}
      />
    ),
    [project, selectBranch, selectedBranchName, visibleBranches.length],
  );

  if (!editor) return <MissingTaskDraft />;

  const header = (
    <View className="mb-3 gap-3">
      <View className="flex-row items-center gap-3 overflow-hidden rounded-2xl bg-card px-4 py-3">
        <Text className="min-w-0 flex-1 text-base font-t3-medium text-foreground">
          Start from origin
        </Text>
        <ThemedSwitch
          accessibilityLabel="Start from origin"
          value={editor.draft.startFromOrigin}
          onValueChange={(startFromOrigin) =>
            setEditor((current) =>
              current ? { ...current, draft: { ...current.draft, startFromOrigin } } : current,
            )
          }
        />
      </View>
    </View>
  );

  return (
    <SettingsScreen title="Base branch">
      <View className="px-4 pb-1 pt-3">
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          className="h-11 rounded-xl bg-card px-4 text-base text-foreground"
          onChangeText={setQuery}
          placeholder="Find a branch"
          placeholderTextColorClassName="accent-placeholder"
          value={query}
        />
      </View>
      {visibleBranches.length === 0 ? (
        <View className="flex-1 px-4 pt-3">
          {header}
          <View className="flex-1 items-center justify-center gap-3 px-4">
            {loading ? <ActivityIndicator /> : null}
            <Text className="text-center text-sm text-foreground-muted">
              {loading
                ? "Loading branches…"
                : error
                  ? error
                  : query
                    ? "No matching branches"
                    : "No branches available"}
            </Text>
            {!loading && error && project ? (
              <Pressable
                accessibilityRole="button"
                className="rounded-full bg-card px-4 py-2 active:opacity-70"
                onPress={branches.refresh}
              >
                <Text className="text-sm font-t3-medium text-foreground">Try again</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <LegendList
          alwaysBounceVertical={false}
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingBottom: Platform.OS === "ios" ? 16 : Math.max(insets.bottom, 16) + 16,
            paddingHorizontal: 16,
            paddingTop: 12,
          }}
          data={visibleBranches}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(branch) => `${branch.name}:${branch.worktreePath ?? ""}`}
          ListHeaderComponent={header}
          ListFooterComponent={
            branches.isFetchingNextPage ? (
              <View className="items-center py-4">
                <ActivityIndicator />
              </View>
            ) : null
          }
          onEndReached={branches.data?.nextCursor != null ? branches.loadNext : undefined}
          onEndReachedThreshold={0.35}
          renderItem={renderBranch}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SettingsScreen>
  );
}

const BranchRow = memo(function BranchRow(props: {
  readonly badge: string | null;
  readonly branch: VcsRef;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly selected: boolean;
  readonly onSelect: (branch: VcsRef) => void;
}) {
  const { branch, onSelect } = props;
  return (
    <Pressable
      accessibilityLabel={[branch.name, props.badge].filter(Boolean).join(", ")}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={() => onSelect(branch)}
      className={cn(
        "min-h-14 flex-row items-center gap-3 bg-card px-4 py-3 active:bg-subtle",
        props.isFirst && "rounded-t-2xl",
        props.isLast ? "rounded-b-2xl" : "border-b border-border-subtle",
      )}
    >
      <SymbolView
        name="arrow.triangle.branch"
        size={17}
        tintColorClassName="accent-icon-muted"
        type="monochrome"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-t3-medium text-foreground" numberOfLines={1}>
          {branch.name}
        </Text>
        {props.badge ? (
          <Text className="text-xs text-foreground-muted" numberOfLines={1}>
            {props.badge.toUpperCase()}
          </Text>
        ) : null}
      </View>
      {props.selected ? (
        <SymbolView
          name="checkmark"
          size={16}
          tintColorClassName="accent-icon"
          type="monochrome"
          weight="semibold"
        />
      ) : null}
    </Pressable>
  );
});
