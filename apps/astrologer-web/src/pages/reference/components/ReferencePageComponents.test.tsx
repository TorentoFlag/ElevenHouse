import { Children, isValidElement, type ReactElement } from "react";
import type { DictionaryEffectiveEntryResponse } from "@elevenhouse/contracts";
import { Card } from "@elevenhouse/design-system/components/Card";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import { MotionContent } from "@elevenhouse/design-system/motion";
import { Edit } from "@elevenhouse/design-system/icons/Edit";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import { Search } from "@elevenhouse/design-system/icons/Search";
import { Trash } from "@elevenhouse/design-system/icons/Trash";
import { describe, expect, it, vi } from "vitest";
import { ReferenceCategoryButton } from "./ReferenceCategoryButton";
import { ReferenceCategoryRail } from "./ReferenceCategoryRail";
import { ReferenceConfirmationModal } from "./ReferenceConfirmationModal";
import { ReferenceEntryCard } from "./ReferenceEntryCard";
import { ReferenceResults } from "./ReferenceResults";
import { ReferenceSourceFilterChip } from "./ReferenceSourceFilterChip";
import { ReferenceToolbar } from "./ReferenceToolbar";
import styles from "../ReferencePage.module.css";

const copy = {
  title: "Справочник трактовок",
  searchPlaceholder: "Поиск по трактовкам...",
  resetLabel: "Сбросить",
  addLabel: "Добавить",
  allCategoriesLabel: "Все трактовки",
  sourceFilterAriaLabel: "Фильтр источников трактовок",
  sourceFilters: {
    all: "Все источники",
    platform: "ElevenHouse",
    modified: "Изменённые",
    custom: "Свои"
  },
  sourceBadges: {
    platform: "ElevenHouse",
    modified: "изменено",
    custom: "своя"
  },
  entryActions: {
    editLabel: "Изменить",
    deleteLabel: "Удалить"
  },
  emptyLabel: "Ничего не найдено",
  emptyAddLabel: "Добавить трактовку"
};

const categories = [
  {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    code: "planets_in_signs",
    name: "Планеты в знаках",
    order: 10,
    count: 4,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  },
  {
    id: "3f925316-1b0e-47c8-a41e-91796f321acb",
    code: "planets_in_houses",
    name: "Планеты в домах",
    order: 20,
    count: 3,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  }
];

const entries = [
  {
    id: "7c4e4916-9272-4a0f-928d-5f6f9f28b2a0",
    categoryId: getArrayItem(categories, 0).id,
    categoryCode: "planets_in_signs",
    code: "sun_aries",
    locale: "ru",
    source: "platform",
    title: "Солнце в Овне",
    content: "Яркая воля, инициатива.",
    platformEntryId: "1d2a5bd0-0f3e-4a8d-8d30-61e313201c57",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  },
  {
    id: "a2fb1fef-dc5c-44ec-ae36-060f455c8f0f",
    categoryId: getArrayItem(categories, 0).id,
    categoryCode: "planets_in_signs",
    code: "moon_taurus",
    locale: "ru",
    source: "modified",
    title: "Луна в Тельце",
    content: "Эмоциональная устойчивость.",
    platformEntryId: "d15db907-1a06-4b7e-a7db-6e6f047285e5",
    astrologerEntryId: "258f4ff8-838a-43f7-8f48-c3ea3d669c9c",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  }
] satisfies DictionaryEffectiveEntryResponse[];

describe("Reference page local components", () => {
  it("renders toolbar search and primary commands", () => {
    const onSearchChange = vi.fn();
    const onReset = vi.fn();
    const onAdd = vi.fn();
    const toolbar = ReferenceToolbar({
      title: copy.title,
      catalogTotal: 396,
      search: "луна",
      searchPlaceholder: copy.searchPlaceholder,
      resetLabel: copy.resetLabel,
      addLabel: copy.addLabel,
      isResetting: true,
      onSearchChange,
      onReset,
      onAdd
    });

    expect(toolbar.props.className).toBe(styles.toolbar);
    expect(JSON.stringify(toolbar.props.children)).toContain("Справочник трактовок");
    expect(findFirstElementByType(toolbar, Reference)).toBeTruthy();
    expect(findFirstElementByType(toolbar, Search)).toBeTruthy();

    const searchInput = findRequiredElementByType(toolbar, "input");
    searchInput.props.onChange({ currentTarget: { value: "овен" } });
    expect(searchInput.props.value).toBe("луна");
    expect(onSearchChange).toHaveBeenCalledWith("овен");

    const buttons = findElementsByDataAttribute(toolbar, "data-reference-toolbar-action");
    expect(buttons.map((button) => button.props["data-reference-toolbar-action"])).toEqual([
      "reset",
      "add"
    ]);
    expect(getArrayItem(buttons, 0).props.disabled).toBe(true);
    expect(getArrayItem(buttons, 1).props.startIcon.type).toBe(Plus);
    getArrayItem(buttons, 0).props.onClick();
    getArrayItem(buttons, 1).props.onClick();
    expect(onReset).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("renders category rail with all category and category icons", () => {
    const onCategoryChange = vi.fn();
    const rail = ReferenceCategoryRail({
      allCategoriesLabel: copy.allCategoriesLabel,
      catalogTotal: 396,
      categories,
      selectedCategoryId: getArrayItem(categories, 1).id,
      onCategoryChange
    });
    const categoryButtons = findElementsByType(rail, ReferenceCategoryButton);

    expect(rail.props.className).toBe(styles.categoryRail);
    expect(rail.props["aria-label"]).toBe("Все трактовки");
    expect(categoryButtons.map((button) => button.props.id)).toEqual([
      "all",
      getArrayItem(categories, 0).id,
      getArrayItem(categories, 1).id
    ]);
    expect(getArrayItem(categoryButtons, 0).props.count).toBe(396);
    expect(getArrayItem(categoryButtons, 2).props.isActive).toBe(true);
    getArrayItem(categoryButtons, 0).props.onClick();
    getArrayItem(categoryButtons, 2).props.onClick();
    expect(onCategoryChange).toHaveBeenNthCalledWith(1, null);
    expect(onCategoryChange).toHaveBeenNthCalledWith(2, getArrayItem(categories, 1).id);
  });

  it("renders a reference entry card with edit and conditional delete actions", () => {
    const onEditEntry = vi.fn();
    const onDeleteEntry = vi.fn();
    const modifiedEntry = getArrayItem(entries, 1);
    const card = ReferenceEntryCard({
      entry: modifiedEntry,
      sourceBadges: copy.sourceBadges,
      entryActions: copy.entryActions,
      onEditEntry,
      onDeleteEntry
    });

    expect(findRequiredElementByType(card, Card).props.as).toBe("article");
    expect(JSON.stringify(card.props.children)).toContain("Луна в Тельце");
    expect(JSON.stringify(card.props.children)).toContain("изменено");

    const editButton = findRequiredElementByDataAttributeValue(
      card,
      "data-reference-entry-action",
      "edit"
    );
    const deleteButton = findRequiredElementByDataAttributeValue(
      card,
      "data-reference-entry-action",
      "delete"
    );
    expect(editButton.props.startIcon.type).toBe(Edit);
    expect(deleteButton.props.icon.type).toBe(Trash);

    editButton.props.onClick();
    deleteButton.props.onClick();
    expect(onEditEntry).toHaveBeenCalledWith(modifiedEntry);
    expect(onDeleteEntry).toHaveBeenCalledWith(modifiedEntry);

    const platformCard = ReferenceEntryCard({
      entry: getArrayItem(entries, 0),
      sourceBadges: copy.sourceBadges,
      entryActions: copy.entryActions,
      onEditEntry,
      onDeleteEntry
    });
    expect(
      findElementsByDataAttribute(platformCard, "data-reference-entry-action").map(
        (button) => button.props["data-reference-entry-action"]
      )
    ).toEqual(["edit"]);
  });

  it("renders source filters, result states and entry cards", () => {
    const onSourceChange = vi.fn();
    const onAdd = vi.fn();
    const results = ReferenceResults({
      sourceFilterAriaLabel: copy.sourceFilterAriaLabel,
      sourceFilters: copy.sourceFilters,
      sourceCounts: {
        all: 2,
        platform: 1,
        modified: 1,
        custom: 0
      },
      selectedSource: "all",
      entries,
      search: "луна",
      isLoading: false,
      isError: false,
      resultsMotionKey: "all:all:луна:1000",
      isResultsUpdating: true,
      loadingLabel: "Загружаем справочники",
      errorLabel: "Не удалось загрузить справочники",
      emptyLabel: copy.emptyLabel,
      emptyAddLabel: copy.emptyAddLabel,
      sourceBadges: copy.sourceBadges,
      entryActions: copy.entryActions,
      onSourceChange,
      onAdd,
      onEditEntry: vi.fn(),
      onDeleteEntry: vi.fn()
    });

    const filters = findElementsByType(results, ReferenceSourceFilterChip);
    expect(filters.map((filter) => filter.props.source)).toEqual([
      "all",
      "platform",
      "modified",
      "custom"
    ]);
    getArrayItem(filters, 2).props.onClick();
    expect(onSourceChange).toHaveBeenCalledWith("modified");

    const motion = findRequiredElementByType(results, MotionContent);
    expect(motion.props.transitionKey).toBe("all:all:луна:1000");
    expect(motion.props.className).toContain(styles.resultsMotionUpdating);
    expect(findElementsByType(results, ReferenceEntryCard)).toHaveLength(2);

    const emptyResults = ReferenceResults({
      sourceFilterAriaLabel: copy.sourceFilterAriaLabel,
      sourceFilters: copy.sourceFilters,
      sourceCounts: {
        all: 0,
        platform: 0,
        modified: 0,
        custom: 0
      },
      selectedSource: "all",
      entries: [],
      search: "новая",
      isLoading: false,
      isError: false,
      resultsMotionKey: "empty",
      isResultsUpdating: false,
      loadingLabel: "Загружаем справочники",
      errorLabel: "Не удалось загрузить справочники",
      emptyLabel: copy.emptyLabel,
      emptyAddLabel: copy.emptyAddLabel,
      sourceBadges: copy.sourceBadges,
      entryActions: copy.entryActions,
      onSourceChange,
      onAdd,
      onEditEntry: vi.fn(),
      onDeleteEntry: vi.fn()
    });
    findRequiredElementByType(emptyResults, "button").props.onClick();
    expect(onAdd).toHaveBeenCalledWith({ titleSeed: "новая" });
  });

  it("renders confirmation modal with configured action attributes", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const confirmation = ReferenceConfirmationModal({
      title: "Удалить трактовку?",
      closeLabel: "Закрыть модалку удаления трактовки",
      description: "Точно хотите удалить трактовку?",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      isPending: true,
      actionDataAttribute: "data-reference-delete-confirmation-action",
      onConfirm,
      onCancel
    });
    const modal = findRequiredElementByType(confirmation, Modal);
    const buttons = findElementsByDataAttribute(
      modal.props.children,
      "data-reference-delete-confirmation-action"
    );

    expect(modal.props.title).toBe("Удалить трактовку?");
    expect(modal.props.closeLabel).toBe("Закрыть модалку удаления трактовки");
    expect(JSON.stringify(modal.props.children)).toContain("Точно хотите удалить трактовку?");
    expect(buttons.map((button) => button.props["data-reference-delete-confirmation-action"])).toEqual([
      "confirm",
      "cancel"
    ]);
    expect(buttons.map((button) => button.props.disabled)).toEqual([true, true]);

    getArrayItem(buttons, 0).props.onClick();
    getArrayItem(buttons, 1).props.onClick();
    modal.props.onClose();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

type TestElementProps = {
  as?: string;
  children?: unknown;
  className?: string;
  closeLabel?: string;
  count?: number;
  "aria-label"?: string;
  "data-reference-delete-confirmation-action"?: string;
  "data-reference-entry-action"?: string;
  "data-reference-toolbar-action"?: string;
  disabled?: boolean;
  icon: { type: unknown };
  id?: string;
  isActive?: boolean;
  label?: string;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onClick: () => void;
  onClose: () => void;
  placeholder?: string;
  source?: string;
  startIcon: { type: unknown };
  title?: string;
  transitionKey?: string;
  type?: string;
  value?: string;
};

function findFirstElementByType(root: unknown, type: unknown) {
  return findElementsByType(root, type)[0] ?? null;
}

function findRequiredElementByType(root: unknown, type: unknown) {
  const element = findFirstElementByType(root, type);
  if (!element) {
    throw new Error("Expected matching React element");
  }

  return element;
}

function findRequiredElementByDataAttributeValue(
  root: unknown,
  attribute: "data-reference-entry-action",
  value: string
) {
  const element = findElementsByDataAttribute(root, attribute).find(
    (match) => match.props[attribute] === value
  );
  if (!element) {
    throw new Error(`Expected element with ${attribute}=${value}`);
  }

  return element;
}

function findElementsByType(root: unknown, type: unknown): Array<{ props: TestElementProps }> {
  const matches: Array<{ props: TestElementProps }> = [];
  visitElements(root, (element) => {
    if (element.type === type) {
      matches.push(element as { props: TestElementProps });
    }
  });

  return matches;
}

function findElementsByDataAttribute(
  root: unknown,
  attribute:
    | "data-reference-delete-confirmation-action"
    | "data-reference-entry-action"
    | "data-reference-toolbar-action"
) {
  const matches: Array<{ props: TestElementProps }> = [];
  visitElements(root, (element) => {
    if (element.props[attribute]) {
      matches.push(element as { props: TestElementProps });
    }
  });

  return matches;
}

function getArrayItem<T>(items: T[], index: number): T {
  const item = items[index];
  if (!item) {
    throw new Error(`Expected item at index ${index}`);
  }

  return item;
}

function visitElements(root: unknown, visitor: (element: ReactElement<TestElementProps>) => void) {
  if (!isValidElement<TestElementProps>(root)) {
    return;
  }

  visitor(root);

  Children.forEach(root.props.children, (child) => {
    visitElements(child, visitor);
  });
}
