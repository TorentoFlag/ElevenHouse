import { Children, isValidElement, type ReactElement } from "react";
import type { DictionaryEffectiveEntryResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ReferenceCategoryRail } from "./components/ReferenceCategoryRail";
import { ReferenceConfirmationModal } from "./components/ReferenceConfirmationModal";
import { ReferenceResults } from "./components/ReferenceResults";
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
  resetConfirmation: {
    title: "Сбросить справочники?",
    closeLabel: "Закрыть модалку сброса справочников",
    description:
      "Все созданные трактовки будут удалены, а измененные вернутся к исходному состоянию. Вы уверены что хотите сбросить справочники?",
    confirmLabel: "Сбросить",
    cancelLabel: "Отмена"
  },
  deleteConfirmation: {
    title: "Удалить трактовку?",
    closeLabel: "Закрыть модалку удаления трактовки",
    description: "Точно хотите удалить трактовку?",
    confirmLabel: "Удалить",
    cancelLabel: "Отмена"
  },
  entryModal: {
    createTitle: "Новая трактовка",
    editTitle: "Редактировать трактовку",
    createCloseLabel: "Закрыть модалку добавления трактовки",
    editCloseLabel: "Закрыть модалку редактирования трактовки",
    categoryLabel: "Категория",
    titleLabel: "Название",
    titlePlaceholder: "Напр. Солнце в Овне",
    contentLabel: "Текст трактовки",
    contentPlaceholder: "Ваша трактовка...",
    aiDraftLabel: "AI-черновик",
    aiDraftTitle: "AI набросает черновик по заголовку — отредактируйте под свой стиль",
    aiDraftLoadingLabel: "Генерируем...",
    aiDraftLoadingAnnouncement: "Генерируем AI-черновик",
    aiDraftErrorLabel: "Повторить AI-черновик",
    aiDraftErrorTitle: "Не удалось создать AI-черновик. Попробуйте ещё раз.",
    aiDraftErrorAnnouncement: "Не удалось создать AI-черновик",
    cancelLabel: "Отмена",
    saveLabel: "Сохранить",
    savingLabel: "Сохраняем",
    genericError: "Не удалось сохранить трактовку. Попробуйте ещё раз.",
    validation: {
      categoryRequired: "Выберите категорию",
      titleRequired: "Введите название трактовки",
      titleMaxLength: "Название не должно быть длиннее {max} символов",
      contentRequired: "Введите текст трактовки",
      contentMaxLength: "Текст не должно быть длиннее {max} символов"
    }
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
  it("composes toolbar, category rail and results with page state", () => {
    const onCategoryChange = vi.fn();
    const onSourceChange = vi.fn();
    const onSearchChange = vi.fn();
    const onReset = vi.fn();
    const onAdd = vi.fn();
    const onEditEntry = vi.fn();
    const onDeleteEntry = vi.fn();
    const view = ReferencePageView({
      ...createBaseProps(),
      categories,
      entries,
      catalogTotal: 396,
      selectedCategoryId: getArrayItem(categories, 0).id,
      search: "луна",
      isResultsUpdating: true,
      resultsMotionKey: "planets-in-signs:1000",
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

    expect(toolbarProps.title).toBe("Справочник трактовок");
    expect(toolbarProps.catalogTotal).toBe(396);
    expect(toolbarProps.search).toBe("луна");
    expect(toolbarProps.searchPlaceholder).toBe("Поиск по трактовкам...");
    expect(toolbarProps.isResetting).toBe(false);
    toolbarProps.onSearchChange("овен");
    toolbarProps.onReset();
    toolbarProps.onAdd();
    expect(onSearchChange).toHaveBeenCalledWith("овен");
    expect(onReset).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledOnce();
    expect(findFirstElementByType(view, ReferenceConfirmationModal)).toBeNull();

    expect(bodyProps.className).toBe(styles.body);

    const categoryRail = findRequiredElementByType(body, ReferenceCategoryRail);
    expect(categoryRail.props.allCategoriesLabel).toBe("Все трактовки");
    expect(categoryRail.props.catalogTotal).toBe(396);
    expect(categoryRail.props.categories).toBe(categories);
    expect(categoryRail.props.selectedCategoryId).toBe(getArrayItem(categories, 0).id);
    categoryRail.props.onCategoryChange(getArrayItem(categories, 1).id);
    expect(onCategoryChange).toHaveBeenCalledWith(getArrayItem(categories, 1).id);

    const results = findRequiredElementByType(body, ReferenceResults);
    expect(results.props.sourceFilters).toBe(copy.sourceFilters);
    expect(results.props.sourceCounts).toEqual({
      all: 14,
      platform: 14,
      modified: 0,
      custom: 0
    });
    expect(results.props.selectedSource).toBe("all");
    expect(results.props.entries).toBe(entries);
    expect(results.props.search).toBe("луна");
    expect(results.props.resultsMotionKey).toBe("planets-in-signs:1000");
    expect(results.props.isResultsUpdating).toBe(true);
    expect(results.props.hasMoreEntries).toBe(false);
    expect(results.props.isLoadingMoreEntries).toBe(false);
    results.props.onSourceChange("modified");
    results.props.onEditEntry(getArrayItem(entries, 0));
    results.props.onDeleteEntry(getArrayItem(entries, 1));
    results.props.onLoadMoreEntries();
    expect(onSourceChange).toHaveBeenCalledWith("modified");
    expect(onEditEntry).toHaveBeenCalledWith(getArrayItem(entries, 0));
    expect(onDeleteEntry).toHaveBeenCalledWith(getArrayItem(entries, 1));
  });

  it("passes loading and error state to results", () => {
    const loadingView = ReferencePageView({
      ...createBaseProps(),
      isLoading: true
    });
    const errorView = ReferencePageView({
      ...createBaseProps(),
      isError: true
    });

    expect(findRequiredElementByType(loadingView, ReferenceResults).props.isLoading).toBe(true);
    expect(findRequiredElementByType(loadingView, ReferenceResults).props.loadingLabel).toBe(
      "Загружаем справочники"
    );
    expect(findRequiredElementByType(errorView, ReferenceResults).props.isError).toBe(true);
    expect(findRequiredElementByType(errorView, ReferenceResults).props.errorLabel).toBe(
      "Не удалось загрузить справочники"
    );
  });

  it("passes reset pending state to toolbar", () => {
    const view = ReferencePageView({
      ...createBaseProps(),
      isResetting: true
    });
    const [toolbar] = Children.toArray(view.props.children);

    expect(getElementProps(toolbar).isResetting).toBe(true);
  });

  it("composes reset confirmation modal with cancel and confirm actions", () => {
    const onReset = vi.fn();
    const onResetConfirm = vi.fn();
    const onResetCancel = vi.fn();
    const view = ReferencePageView({
      ...createBaseProps(),
      isResetConfirmationOpen: true,
      onReset,
      onResetConfirm,
      onResetCancel
    });
    const modal = findRequiredElementByType(view, ReferenceConfirmationModal);

    expect(modal.props.title).toBe("Сбросить справочники?");
    expect(modal.props.closeLabel).toBe("Закрыть модалку сброса справочников");
    expect(modal.props.description).toBe(
      "Все созданные трактовки будут удалены, а измененные вернутся к исходному состоянию. Вы уверены что хотите сбросить справочники?"
    );
    expect(modal.props.confirmLabel).toBe("Сбросить");
    expect(modal.props.cancelLabel).toBe("Отмена");
    expect(modal.props.actionDataAttribute).toBe("data-reference-reset-confirmation-action");

    modal.props.onCancel();
    expect(onResetCancel).toHaveBeenCalledOnce();
    expect(onResetConfirm).not.toHaveBeenCalled();

    modal.props.onConfirm();
    expect(onResetConfirm).toHaveBeenCalledOnce();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("passes reset pending state to reset confirmation modal", () => {
    const view = ReferencePageView({
      ...createBaseProps(),
      isResetting: true,
      isResetConfirmationOpen: true
    });
    const modal = findRequiredElementByType(view, ReferenceConfirmationModal);

    expect(modal.props.isPending).toBe(true);
  });

  it("composes delete confirmation modal with cancel and confirm actions", () => {
    const onDeleteConfirm = vi.fn();
    const onDeleteCancel = vi.fn();
    const view = ReferencePageView({
      ...createBaseProps(),
      deleteConfirmationEntry: getArrayItem(entries, 1),
      onDeleteConfirm,
      onDeleteCancel
    });
    const modal = findRequiredElementByType(view, ReferenceConfirmationModal);

    expect(modal.props.title).toBe("Удалить трактовку?");
    expect(modal.props.closeLabel).toBe("Закрыть модалку удаления трактовки");
    expect(modal.props.description).toBe("Точно хотите удалить трактовку?");
    expect(modal.props.confirmLabel).toBe("Удалить");
    expect(modal.props.cancelLabel).toBe("Отмена");
    expect(modal.props.actionDataAttribute).toBe("data-reference-delete-confirmation-action");

    modal.props.onConfirm();
    modal.props.onCancel();
    expect(onDeleteConfirm).toHaveBeenCalledOnce();
    expect(onDeleteCancel).toHaveBeenCalledOnce();
  });
});

function createBaseProps(): ReferencePageViewProps {
  return {
    copy,
    catalogTotal: 1,
    categories,
    entries,
    selectedCategoryId: null,
    selectedSource: "all",
    sourceCounts: {
      all: 14,
      platform: 14,
      modified: 0,
      custom: 0
    },
    search: "",
    isLoading: false,
    isError: false,
    isResetting: false,
    isDeletingEntry: false,
    isResetConfirmationOpen: false,
    deleteConfirmationEntry: null,
    resultsMotionKey: "all:all:1000",
    isResultsUpdating: false,
    hasMoreEntries: false,
    isLoadingMoreEntries: false,
    onCategoryChange: vi.fn(),
    onSourceChange: vi.fn(),
    onSearchChange: vi.fn(),
    onReset: vi.fn(),
    onResetConfirm: vi.fn(),
    onResetCancel: vi.fn(),
    onDeleteConfirm: vi.fn(),
    onDeleteCancel: vi.fn(),
    onAdd: vi.fn(),
    onEditEntry: vi.fn(),
    onDeleteEntry: vi.fn(),
    onLoadMoreEntries: vi.fn()
  };
}

type TestElementProps = {
  actionDataAttribute?: string;
  allCategoriesLabel?: string;
  cancelLabel?: string;
  catalogTotal?: number;
  categories?: unknown[];
  children?: unknown;
  className?: string;
  closeLabel?: string;
  confirmLabel?: string;
  description?: string;
  entries?: unknown[];
  errorLabel?: string;
  isError?: boolean;
  isLoading?: boolean;
  isPending?: boolean;
  isResetting?: boolean;
  isResultsUpdating?: boolean;
  hasMoreEntries?: boolean;
  isLoadingMoreEntries?: boolean;
  loadingLabel?: string;
  onAdd: () => void;
  onCancel: () => void;
  onCategoryChange: (categoryId: string | null) => void;
  onConfirm: () => void;
  onDeleteEntry: (entry: DictionaryEffectiveEntryResponse) => void;
  onEditEntry: (entry: DictionaryEffectiveEntryResponse) => void;
  onLoadMoreEntries: () => void;
  onReset: () => void;
  onSearchChange: (search: string) => void;
  onSourceChange: (source: string) => void;
  resultsMotionKey?: string;
  search?: string;
  searchPlaceholder?: string;
  selectedCategoryId?: string | null;
  selectedSource?: string;
  sourceCounts?: unknown;
  sourceFilters?: unknown;
  title?: string;
  "aria-labelledby"?: string;
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
