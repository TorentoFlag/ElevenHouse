import { Children, isValidElement, type ReactElement } from "react";
import type { DictionaryEffectiveEntryResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import { Card } from "@elevenhouse/design-system/components/Card";
import { IconButton } from "@elevenhouse/design-system/components/IconButton";
import { MotionContent } from "@elevenhouse/design-system/motion";
import { Edit } from "@elevenhouse/design-system/icons/Edit";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Reference } from "@elevenhouse/design-system/icons/Reference";
import { Search } from "@elevenhouse/design-system/icons/Search";
import { Trash } from "@elevenhouse/design-system/icons/Trash";
import { describe, expect, it, vi } from "vitest";
import { ReferenceCategoryButton } from "./components/ReferenceCategoryButton";
import { ReferenceSourceFilterChip } from "./components/ReferenceSourceFilterChip";
import { ReferencePageView, type ReferencePageViewProps } from "./ReferencePageView";
import styles from "./ReferencePage.module.css";

const copy = {
  documentTitle: "ElevenHouse | Справочники",
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
  emptyAddLabel: "Добавить трактовку",
  loadingLabel: "Загружаем справочники",
  errorLabel: "Не удалось загрузить справочники"
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
    content: "Яркая воля, инициатива, потребность быть первым.",
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
    content: "Эмоциональная устойчивость и потребность в безопасности.",
    platformEntryId: "d15db907-1a06-4b7e-a7db-6e6f047285e5",
    astrologerEntryId: "258f4ff8-838a-43f7-8f48-c3ea3d669c9c",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  }
] satisfies DictionaryEffectiveEntryResponse[];

describe("ReferencePageView", () => {
  it("renders the dictionary toolbar, category rail and source filters", () => {
    const onCategoryChange = vi.fn();
    const onSourceChange = vi.fn();
    const onSearchChange = vi.fn();
    const onReset = vi.fn();
    const onAdd = vi.fn();
    const onEditEntry = vi.fn();
    const onDeleteEntry = vi.fn();
    const view = ReferencePageView({
      copy,
      catalogTotal: 396,
      categories,
      entries,
      selectedCategoryId: getArrayItem(categories, 0).id,
      selectedSource: "all",
      sourceCounts: {
        all: 14,
        platform: 14,
        modified: 0,
        custom: 0
      },
      search: "луна",
      isLoading: false,
      isError: false,
      resultsMotionKey: "planets-in-signs:1000",
      isResultsUpdating: true,
      onCategoryChange,
      onSourceChange,
      onSearchChange,
      onReset,
      onAdd,
      onEditEntry,
      onDeleteEntry
    });

    expect(view.type).toBe("section");
    expect(view.props.className).toBe(styles.referencePage);
    expect(view.props["aria-labelledby"]).toBe("reference-title");

    const [toolbar, body] = Children.toArray(view.props.children);
    const toolbarProps = getElementProps(toolbar);
    const bodyProps = getElementProps(body);

    expect(toolbarProps.className).toBe(styles.toolbar);
    expect(JSON.stringify(toolbarProps.children)).toContain("Справочник трактовок");
    expect(JSON.stringify(toolbarProps.children)).toContain("396");
    expect(findFirstElementByType(toolbar, Reference)).toBeTruthy();
    expect(findFirstElementByType(toolbar, Search)).toBeTruthy();

    const searchInput = findRequiredElementByType(toolbar, "input");
    expect(searchInput.props.type).toBe("search");
    expect(searchInput.props.value).toBe("луна");
    expect(searchInput.props.placeholder).toBe("Поиск по трактовкам...");
    searchInput.props.onChange({ currentTarget: { value: "овен" } });
    expect(onSearchChange).toHaveBeenCalledWith("овен");

    const toolbarButtons = findElementsByDataAttribute(toolbar, "data-reference-toolbar-action");
    expect(toolbarButtons.map((button) => button.props["data-reference-toolbar-action"])).toEqual([
      "reset",
      "add"
    ]);
    expect(getArrayItem(toolbarButtons, 1).props.startIcon.type).toBe(Plus);
    getArrayItem(toolbarButtons, 0).props.onClick();
    getArrayItem(toolbarButtons, 1).props.onClick();
    expect(onReset).toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalled();

    expect(bodyProps.className).toBe(styles.body);
    expect(JSON.stringify(bodyProps.children)).toContain("Все трактовки");
    expect(JSON.stringify(bodyProps.children)).toContain("Планеты в знаках");
    expect(JSON.stringify(bodyProps.children)).toContain("Все источники");
    expect(JSON.stringify(bodyProps.children)).toContain("Изменённые");

    const categoryButtons = findElementsByType(body, ReferenceCategoryButton);
    expect(categoryButtons.map((button) => button.props.id)).toEqual([
      "all",
      getArrayItem(categories, 0).id,
      getArrayItem(categories, 1).id
    ]);
    expect(getArrayItem(categoryButtons, 0).props.count).toBe(396);
    expect(getArrayItem(categoryButtons, 1).props.count).toBe(4);
    getArrayItem(categoryButtons, 2).props.onClick();
    expect(onCategoryChange).toHaveBeenCalledWith(getArrayItem(categories, 1).id);

    const sourceButtons = findElementsByType(body, ReferenceSourceFilterChip);
    expect(sourceButtons.map((button) => button.props.source)).toEqual([
      "all",
      "platform",
      "modified",
      "custom"
    ]);
    getArrayItem(sourceButtons, 2).props.onClick();
    expect(onSourceChange).toHaveBeenCalledWith("modified");

    const resultsMotion = findRequiredElementByType(body, MotionContent);
    expect(resultsMotion.props.transitionKey).toBe("planets-in-signs:1000");
    expect(resultsMotion.props.className).toContain(styles.resultsMotion);
    expect(resultsMotion.props.className).toContain(styles.resultsMotionUpdating);

    expect(JSON.stringify(bodyProps.children)).toContain("Солнце в Овне");
    expect(JSON.stringify(bodyProps.children)).toContain("Яркая воля, инициатива");
    expect(JSON.stringify(bodyProps.children)).toContain("изменено");
    const entryCards = findElementsByType(body, Card);
    expect(entryCards).toHaveLength(2);
    expect(entryCards.map((card) => card.props.as)).toEqual(["article", "article"]);
    expect(entryCards.map((card) => card.props.variant)).toEqual(["elevated", "elevated"]);
    expect(entryCards.map((card) => card.props.padding)).toEqual(["medium", "medium"]);
    const editActionButtons = findElementsByType(body, Button).filter(
      (button) => button.props["data-reference-entry-action"] === "edit"
    );
    expect(editActionButtons).toHaveLength(2);
    expect(editActionButtons.map((button) => button.props.size)).toEqual(["small", "small"]);
    expect(editActionButtons.map((button) => button.props.variant)).toEqual(["glass", "glass"]);
    expect(editActionButtons.map((button) => button.props.title)).toEqual(["Изменить", "Изменить"]);
    expect(editActionButtons.map((button) => button.props.startIcon.type)).toEqual([Edit, Edit]);
    const deleteActionButtons = findElementsByType(body, IconButton).filter(
      (button) => button.props["data-reference-entry-action"] === "delete"
    );
    expect(deleteActionButtons).toHaveLength(2);
    expect(deleteActionButtons.map((button) => button.props.size)).toEqual(["small", "small"]);
    expect(deleteActionButtons.map((button) => button.props.variant)).toEqual(["quiet", "quiet"]);
    expect(deleteActionButtons.map((button) => button.props.label)).toEqual([
      "Удалить: Солнце в Овне",
      "Удалить: Луна в Тельце"
    ]);
    expect(deleteActionButtons.map((button) => button.props.icon.type)).toEqual([Trash, Trash]);

    const cardActionButtons = findElementsByDataAttribute(body, "data-reference-entry-action");
    expect(cardActionButtons.map((button) => button.props["data-reference-entry-action"])).toEqual([
      "edit",
      "delete",
      "edit",
      "delete"
    ]);
    getArrayItem(cardActionButtons, 0).props.onClick();
    getArrayItem(cardActionButtons, 1).props.onClick();
    expect(onEditEntry).toHaveBeenCalledWith(getArrayItem(entries, 0));
    expect(onDeleteEntry).toHaveBeenCalledWith(getArrayItem(entries, 0));
  });

  it("renders loading and error states in the content region", () => {
    const baseProps: ReferencePageViewProps = {
      copy,
      catalogTotal: 0,
      categories: [],
      entries: [],
      selectedCategoryId: null,
      selectedSource: "all",
      sourceCounts: {
        all: 0,
        platform: 0,
        modified: 0,
        custom: 0
      },
      search: "",
      isLoading: true,
      isError: false,
      resultsMotionKey: "initial",
      isResultsUpdating: false,
      onCategoryChange: vi.fn(),
      onSourceChange: vi.fn(),
      onSearchChange: vi.fn(),
      onReset: vi.fn(),
      onAdd: vi.fn(),
      onEditEntry: vi.fn(),
      onDeleteEntry: vi.fn()
    };
    const loadingView = ReferencePageView(baseProps);
    const errorView = ReferencePageView({
      ...baseProps,
      isLoading: false,
      isError: true
    });

    expect(JSON.stringify(loadingView.props.children)).toContain("Загружаем справочники");
    expect(JSON.stringify(errorView.props.children)).toContain("Не удалось загрузить справочники");
  });
});

type TestElementProps = {
  as?: string;
  children?: unknown;
  className?: string;
  count?: number;
  "data-reference-category-id"?: string;
  "data-reference-entry-action"?: string;
  "data-reference-source"?: string;
  "data-reference-toolbar-action"?: string;
  icon: { type: unknown };
  id?: string;
  label?: string;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onClick: () => void;
  placeholder?: string;
  size?: string;
  source?: string;
  startIcon: { type: unknown };
  title?: string;
  type?: string;
  value?: string;
  variant?: string;
  padding?: string;
  transitionKey?: string;
};

function getElementProps(element: unknown) {
  if (!isValidElement<TestElementProps>(element)) {
    throw new Error("Expected a React element");
  }

  return element.props;
}

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
    | "data-reference-category-id"
    | "data-reference-entry-action"
    | "data-reference-source"
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
