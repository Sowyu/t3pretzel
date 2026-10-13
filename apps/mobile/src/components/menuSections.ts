import type { MenuAction } from "@react-native-menu/menu";

export type MenuSection = {
  readonly key: string;
  readonly title?: string;
  readonly actions: readonly MenuAction[];
};

const visible = (actions: readonly MenuAction[]) =>
  actions.filter((action) => !(action.attributes?.hidden ?? false));

/**
 * Splits one menu level into UIMenu sections: each `displayInline` group is
 * its own section, and the plain actions between groups share one.
 */
export function menuSections(actions: readonly MenuAction[]): MenuSection[] {
  const sections: { key: string; title?: string; actions: MenuAction[] }[] = [];
  let loose: { key: string; actions: MenuAction[] } | null = null;
  for (const [index, action] of visible(actions).entries()) {
    if (action.displayInline && action.subactions) {
      loose = null;
      const inner = visible(action.subactions);
      if (inner.length > 0)
        sections.push({
          key: action.id ?? `section-${index}`,
          title: action.title || undefined,
          actions: inner,
        });
      continue;
    }
    if (loose === null) {
      loose = { key: `loose-${index}`, actions: [] };
      sections.push(loose);
    }
    loose.actions.push(action);
  }
  return sections;
}
