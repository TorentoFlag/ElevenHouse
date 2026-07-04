type NavigableActionMenuItem = {
  readonly id: string;
  readonly disabled?: boolean;
};

export function getFirstEnabledActionMenuItemId(
  items: readonly NavigableActionMenuItem[]
): string | null {
  return items.find((item) => !item.disabled)?.id ?? null;
}

export function getLastEnabledActionMenuItemId(
  items: readonly NavigableActionMenuItem[]
): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item && !item.disabled) {
      return item.id;
    }
  }

  return null;
}

export function getNextEnabledActionMenuItemId(
  items: readonly NavigableActionMenuItem[],
  currentItemId: string | null,
  direction: 1 | -1
): string | null {
  const enabledItems = items.filter((item) => !item.disabled);

  if (enabledItems.length === 0) {
    return null;
  }

  const currentIndex = enabledItems.findIndex((item) => item.id === currentItemId);
  const nextIndex =
    currentIndex === -1
      ? direction === 1
        ? 0
        : enabledItems.length - 1
      : (currentIndex + direction + enabledItems.length) % enabledItems.length;

  return enabledItems[nextIndex]?.id ?? null;
}
