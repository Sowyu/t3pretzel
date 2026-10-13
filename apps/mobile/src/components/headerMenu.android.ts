import type { MenuAction } from "@react-native-menu/menu";
import type { ScreenHeaderMenuItem } from "./ScreenHeader.types";

export function androidHeaderMenuActions(items: ReadonlyArray<ScreenHeaderMenuItem>): MenuAction[] {
  return items.flatMap((item): MenuAction[] =>
    "items" in item
      ? [
          {
            id: item.id,
            title: item.title ?? "",
            image: item.icon,
            // Inline groups are UIMenu sections, drawn in place by AndroidAnchoredMenu.
            displayInline: item.inline,
            subactions: androidHeaderMenuActions(item.items),
          },
        ]
      : [
          {
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            image: item.icon,
            state: item.selected ? "on" : undefined,
            attributes: item.disabled ? { disabled: true } : undefined,
          },
        ],
  );
}

export function findHeaderMenuAction(
  items: ReadonlyArray<ScreenHeaderMenuItem>,
  id: string,
): Extract<ScreenHeaderMenuItem, { readonly onPress: () => void }> | undefined {
  for (const item of items) {
    if ("items" in item) {
      const action = findHeaderMenuAction(item.items, id);
      if (action) return action;
    } else if (item.id === id) {
      return item;
    }
  }
  return undefined;
}
