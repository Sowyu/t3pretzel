import Constants from "expo-constants";
import { useCallback, useMemo, useRef } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  Pressable,
  Text as RNText,
  StatusBar,
  TextInput,
  type TextInputInstance,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AndroidMenuAction } from "../../components/AndroidAnchoredMenu";
import { SymbolView } from "../../components/AppSymbol";
import { ControlPillMenu } from "../../components/ControlPill";
import { GlassControl } from "../../components/GlassControl";
import { GlassSurface, supportsLiquidGlass } from "../../components/GlassSurface";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import { NightlySkyBackdrop, stageBackdropVariant } from "../../components/StageBackdrop";
import { T3Wordmark } from "../../components/T3Wordmark";
import { cn } from "../../lib/cn";
import { HOME_HORIZONTAL_INSET } from "../../lib/layoutMetrics";
import { resolveMobileStageLabel } from "../../lib/mobileBranding";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { useNightlyUpdater } from "../updates/nightly-updater-runtime";
import type { HomeHeaderProps } from "./HomeHeader.types";
import { WorkspaceConnectionTitle } from "./WorkspaceConnectionTitle";

export type { HomeHeaderEnvironment } from "./HomeHeader.types";

// Brand row height (the size-11 controls). Stage art stays clear behind the
// status bar and this row, then fades into the header above the search field.
const BRAND_ROW_HEIGHT = 44;
const BACKDROP_FADE_HEIGHT = 56;
// Desktop renders the brand white on stage art; "Code" and status at 70%.
const ON_BACKDROP_TEXT = { color: "#FFFFFF" };
const ON_BACKDROP_MUTED_TEXT = { color: "rgba(255,255,255,0.7)" };
const ON_BACKDROP_ICON = "rgba(255,255,255,0.9)";

function checkedMenuState(checked: boolean) {
  return checked ? ("on" as const) : undefined;
}

export function HomeHeader(props: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const stageLabel = resolveMobileStageLabel(Constants.expoConfig?.extra?.appVariant);
  const backdrop = stageBackdropVariant(stageLabel);
  const focused = useIsFocused();
  const theme = useUniwindTheme();
  const paddingTop = Math.max(insets.top, 12);
  // Also where the nightly updater starts: this header mounts with the app.
  const nightly = useNightlyUpdater();
  const searchRef = useRef<TextInputInstance>(null);
  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    return searchRef.current !== null;
  }, []);
  useHardwareKeyboardCommand("focusSearch", focusSearch);
  // The list uses a fixed creation order and ignores sort/group options, so
  // the filter menu only carries the filters and the "customized" icon state
  // keys off those alone.
  const hasCustomListOptions =
    props.selectedEnvironmentId !== null || props.selectedProjectKey !== null;
  const menuActions = useMemo<AndroidMenuAction[]>(
    () => [
      {
        id: "environment",
        title: "Environment",
        subactions: [
          {
            id: "environment:all",
            title: "All environments",
            state: checkedMenuState(props.selectedEnvironmentId === null),
          },
          ...props.environments.map((environment) => ({
            id: `environment:${environment.environmentId}`,
            title: environment.label,
            state: checkedMenuState(props.selectedEnvironmentId === environment.environmentId),
          })),
        ],
      },
      ...(props.projects.length === 0
        ? []
        : ([
            {
              id: "project",
              title: "Project",
              subactions: [
                {
                  id: "project:all",
                  title: "All projects",
                  state: checkedMenuState(props.selectedProjectKey === null),
                },
                ...props.projects.map((project) => ({
                  id: `project:${project.key}`,
                  title: project.label,
                  state: checkedMenuState(props.selectedProjectKey === project.key),
                  leading: project.representative ? (
                    <ProjectFavicon
                      environmentId={project.representative.environmentId}
                      faviconPath={project.representative.faviconPath}
                      projectTitle={project.label}
                      size={18}
                      workspaceRoot={project.representative.workspaceRoot}
                    />
                  ) : undefined,
                })),
              ],
            },
          ] satisfies AndroidMenuAction[])),
    ],
    [props.environments, props.projects, props.selectedEnvironmentId, props.selectedProjectKey],
  );
  const handleMenuAction = useCallback(
    (event: { nativeEvent: { event: string } }) => {
      const id = event.nativeEvent.event;
      if (id === "environment:all") {
        props.onEnvironmentChange(null);
        return;
      }

      if (id.startsWith("environment:")) {
        const environmentId = id.slice("environment:".length);
        const environment = props.environments.find(
          (candidate) => candidate.environmentId === environmentId,
        );
        if (environment) {
          props.onEnvironmentChange(environment.environmentId);
        }
        return;
      }

      if (id === "project:all") {
        props.onProjectChange(null);
        return;
      }

      if (id.startsWith("project:")) {
        const projectKey = id.slice("project:".length);
        if (props.projects.some((project) => project.key === projectKey)) {
          props.onProjectChange(projectKey);
        }
      }
    },
    [props],
  );

  const searchContent = (
    <>
      <SymbolView
        name="magnifyingglass"
        size={17}
        tintColorClassName="accent-foreground-muted"
        type="monochrome"
      />
      <TextInput
        ref={searchRef}
        accessibilityLabel="Search threads"
        autoCapitalize="none"
        onChangeText={props.onSearchQueryChange}
        placeholder="Search threads"
        placeholderTextColorClassName="accent-placeholder"
        className="flex-1 py-2.5 text-base font-sans text-foreground"
        value={props.searchQuery}
      />
      {props.searchQuery.length > 0 ? (
        <Pressable
          accessibilityLabel="Clear search"
          hitSlop={10}
          onPress={() => props.onSearchQueryChange("")}
        >
          <SymbolView
            name="xmark.circle.fill"
            size={17}
            tintColorClassName="accent-foreground-muted"
            type="monochrome"
          />
        </Pressable>
      ) : null}
    </>
  );

  return (
    <>
      <NativeStackScreenOptions options={{ headerShown: false }} />
      <View
        className="border-b border-header-border bg-header pb-3"
        style={{
          paddingHorizontal: HOME_HORIZONTAL_INSET,
          paddingTop,
        }}
      >
        {backdrop ? (
          <>
            {/* Dark sky under the status bar: light icons while Home is on screen. */}
            {focused ? <StatusBar barStyle="light-content" /> : null}
            <NightlySkyBackdrop
              clearHeight={paddingTop + BRAND_ROW_HEIGHT}
              headerColor={theme["--color-header"]}
              screenColor={theme["--color-screen"]}
              height={paddingTop + BRAND_ROW_HEIGHT + BACKDROP_FADE_HEIGHT}
            />
          </>
        ) : null}
        <View className="w-full max-w-[720px] self-center gap-3">
          <View className="flex-row items-center gap-2.5">
            {/* Brand slot doubles as the connection status surface: while an
                environment reconnects, the lockup fades to a status label in
                place (no layout shift in the list below). */}
            <WorkspaceConnectionTitle
              grow
              onBackdrop={backdrop !== null}
              onPress={props.onOpenEnvironments}
              brand={
                <View className="flex-row items-center gap-2">
                  {/* Mirrors the desktop SidebarBrand: T3 mark + muted "Code".
                      Stage art replaces the pill, as on desktop. */}
                  <T3Wordmark
                    color={backdrop ? ON_BACKDROP_TEXT.color : undefined}
                    colorClassName={backdrop ? undefined : "accent-icon"}
                    height={15}
                  />
                  <RNText
                    className={cn(
                      "-ml-0.5 text-[21px] font-t3-medium tracking-[-0.5px]",
                      backdrop ? undefined : "text-foreground-muted",
                    )}
                    style={backdrop ? ON_BACKDROP_MUTED_TEXT : undefined}
                  >
                    Code
                  </RNText>
                  {backdrop ? null : (
                    <View className="rounded-full bg-subtle px-2 py-0.75">
                      <RNText className="text-[11px] font-t3-bold tracking-[1.1px] text-foreground-muted uppercase">
                        {stageLabel}
                      </RNText>
                    </View>
                  )}
                </View>
              }
            />

            {nightly.state.kind === "available" ? (
              <Pressable
                accessibilityLabel={`Update to ${nightly.state.update.title}`}
                accessibilityRole="button"
                onPress={nightly.update}
              >
                <GlassControl className="h-11 items-center justify-center px-3.5" radius={22}>
                  <RNText
                    className={cn(
                      "text-[13px] font-t3-medium",
                      backdrop ? undefined : "text-foreground",
                    )}
                    style={backdrop ? ON_BACKDROP_TEXT : undefined}
                  >
                    Update
                  </RNText>
                </GlassControl>
              </Pressable>
            ) : null}

            <ControlPillMenu
              actions={menuActions}
              isAnchoredToRight
              onPressAction={handleMenuAction}
            >
              <Pressable accessibilityLabel="Filter threads" accessibilityRole="button">
                <GlassControl className="size-11 items-center justify-center" radius={22}>
                  <SymbolView
                    name={
                      hasCustomListOptions
                        ? "line.3.horizontal.decrease.circle.fill"
                        : "line.3.horizontal.decrease.circle"
                    }
                    size={16}
                    tintColor={backdrop ? ON_BACKDROP_ICON : undefined}
                    tintColorClassName={backdrop ? undefined : "accent-icon"}
                    type="monochrome"
                  />
                </GlassControl>
              </Pressable>
            </ControlPillMenu>
            {/* Built identically to the filter button so the two circles
                match exactly (ControlPill sizes via Tailwind classes and
                resolves to a different box). */}
            <Pressable
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={props.onOpenSettings}
            >
              <GlassControl className="size-11 items-center justify-center" radius={22}>
                <SymbolView
                  name="gearshape"
                  size={18}
                  tintColor={backdrop ? ON_BACKDROP_ICON : undefined}
                  tintColorClassName={backdrop ? undefined : "accent-icon"}
                  type="monochrome"
                />
              </GlassControl>
            </Pressable>
          </View>

          {supportsLiquidGlass ? (
            // The field is glass like the controls beside it: no fill, a
            // hairline rim, the art and list refracting through it.
            <GlassSurface
              chrome="none"
              fallbackClassName="border border-input-border"
              glassEffectStyle="regular"
              style={{ borderRadius: 16 }}
              tintColor="transparent"
            >
              <View className="min-h-12 flex-row items-center gap-2.5 px-3.5">{searchContent}</View>
            </GlassSurface>
          ) : (
            <View className="min-h-12 flex-row items-center gap-2.5 rounded-2xl border border-input-border bg-input px-3.5">
              {searchContent}
            </View>
          )}
        </View>
      </View>
    </>
  );
}
