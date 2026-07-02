import { Children, isValidElement, type ReactElement } from "react";
import type {
  DictionaryCategoryResponse,
  DictionaryEffectiveEntryResponse,
  DictionarySourceCounts
} from "@elevenhouse/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferencePage } from "./ReferencePage";
import type { ReferenceEntryModalProps } from "./components/ReferenceEntryModal";
import type { ReferencePageViewProps } from "./ReferencePageView";

const mocks = vi.hoisted(() => ({
  hookState: {
    cursor: 0,
    values: [] as unknown[]
  },
  referencePageView: vi.fn(),
  referenceEntryModal: vi.fn(),
  useI18n: vi.fn(),
  useDocumentTitle: vi.fn(),
  useDictionaryCategoriesQuery: vi.fn(),
  useDictionaryEntriesQuery: vi.fn(),
  useResetDictionaryEntriesMutation: vi.fn(),
  createReferenceEntriesQuery: vi.fn(),
  createReferencePageSummary: vi.fn()
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useRef: vi.fn((initialValue: unknown) => ({ current: initialValue })),
    useState: vi.fn((initialValue: unknown) => {
      const stateIndex = mocks.hookState.cursor;
      mocks.hookState.cursor += 1;

      if (!(stateIndex in mocks.hookState.values)) {
        mocks.hookState.values[stateIndex] =
          typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
      }

      return [
        mocks.hookState.values[stateIndex],
        (nextValue: unknown) => {
          mocks.hookState.values[stateIndex] =
            typeof nextValue === "function"
              ? (nextValue as (currentValue: unknown) => unknown)(
                  mocks.hookState.values[stateIndex]
                )
              : nextValue;
        }
      ];
    })
  };
});

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/dictionary/model/useDictionaryCategoriesQuery", () => ({
  useDictionaryCategoriesQuery: mocks.useDictionaryCategoriesQuery
}));

vi.mock("../../features/dictionary/model/useDictionaryEntriesQuery", () => ({
  useDictionaryEntriesQuery: mocks.useDictionaryEntriesQuery
}));

vi.mock("../../features/dictionary/model/useResetDictionaryEntriesMutation", () => ({
  useResetDictionaryEntriesMutation: mocks.useResetDictionaryEntriesMutation
}));

vi.mock("./helpers/referenceEntriesQuery", () => ({
  createReferenceEntriesQuery: mocks.createReferenceEntriesQuery
}));

vi.mock("./helpers/referencePageSummary", () => ({
  createReferencePageSummary: mocks.createReferencePageSummary
}));

vi.mock("./ReferencePageView", () => ({
  ReferencePageView: mocks.referencePageView
}));

vi.mock("./components/ReferenceEntryModal", () => ({
  ReferenceEntryModal: mocks.referenceEntryModal
}));

const entryModalCopy = {
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
  aiDraftTitle: "AI набросает черновик по заголовку",
  cancelLabel: "Отмена",
  saveLabel: "Сохранить",
  savingLabel: "Сохраняем",
  genericError: "Не удалось сохранить трактовку",
  validation: {
    categoryRequired: "Выберите категорию",
    titleRequired: "Введите название",
    titleMaxLength: "Название не должно быть длиннее {max} символов",
    contentRequired: "Введите текст трактовки",
    contentMaxLength: "Текст не должен быть длиннее {max} символов"
  }
};

const referenceCopy = {
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
    description: "Все созданные трактовки будут удалены.",
    confirmLabel: "Сбросить",
    cancelLabel: "Отмена"
  },
  entryModal: entryModalCopy,
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
  }
] satisfies DictionaryCategoryResponse[];

const entry = {
  id: "7c4e4916-9272-4a0f-928d-5f6f9f28b2a0",
  categoryId: getArrayItem(categories, 0).id,
  categoryCode: "planets_in_signs",
  code: "sun_aries",
  locale: "ru",
  source: "modified",
  title: "Солнце в Овне",
  content: "Яркая воля, инициатива, потребность быть первым.",
  platformEntryId: "1d2a5bd0-0f3e-4a8d-8d30-61e313201c57",
  astrologerEntryId: "258f4ff8-838a-43f7-8f48-c3ea3d669c9c",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z"
} satisfies DictionaryEffectiveEntryResponse;

const sourceCounts = {
  all: 1,
  platform: 0,
  modified: 1,
  custom: 0
} satisfies DictionarySourceCounts;

describe("ReferencePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hookState.cursor = 0;
    mocks.hookState.values = [];
    mocks.referencePageView.mockImplementation(() => null);
    mocks.referenceEntryModal.mockImplementation(() => null);
    mocks.useI18n.mockReturnValue({
      dictionary: {
        reference: referenceCopy
      },
      locale: "ru"
    });
    mocks.useDictionaryCategoriesQuery.mockReturnValue({
      data: { categories, total: 1 },
      isLoading: false,
      isError: false
    });
    mocks.useDictionaryEntriesQuery.mockReturnValue({
      data: { entries: [entry], total: 1, counts: { sources: sourceCounts } },
      dataUpdatedAt: 1000,
      isLoading: false,
      isError: false,
      isFetching: false,
      isPlaceholderData: false
    });
    mocks.useResetDictionaryEntriesMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    mocks.createReferenceEntriesQuery.mockReturnValue({ locale: "ru" });
    mocks.createReferencePageSummary.mockReturnValue({
      categories,
      entries: [entry],
      catalogTotal: 1,
      resultTotal: 1,
      sourceCounts
    });
  });

  it("opens the entry modal in edit mode with the selected entry", () => {
    renderPage();

    const viewProps = getLatestMockProps<ReferencePageViewProps>(mocks.referencePageView);
    viewProps.onEditEntry(entry);
    mocks.referenceEntryModal.mockClear();

    renderPage();

    expect(mocks.referenceEntryModal).toHaveBeenCalledWith({
      mode: "edit",
      copy: entryModalCopy,
      categories,
      locale: "ru",
      entry,
      onClose: expect.any(Function)
    } satisfies ReferenceEntryModalProps);
  });
});

function renderPage() {
  mocks.hookState.cursor = 0;
  renderElement(<ReferencePage />);
}

function renderElement(element: unknown): void {
  if (Array.isArray(element)) {
    element.forEach(renderElement);
    return;
  }

  if (!isValidElement(element)) {
    return;
  }

  const typedElement = element as ReactElement<Record<string, unknown>>;

  if (typeof typedElement.type === "function") {
    const Component = typedElement.type as (props: Record<string, unknown>) => unknown;
    renderElement(Component(typedElement.props));
    return;
  }

  Children.forEach(typedElement.props.children, renderElement);
}

function getLatestMockProps<T>(mock: { mock: { calls: unknown[][] } }): T {
  const lastCall = mock.mock.calls.at(-1);

  if (!lastCall?.[0]) {
    throw new Error("Expected mock to be called with props");
  }

  return lastCall[0] as T;
}

function getArrayItem<T>(items: T[], index: number): T {
  const item = items[index];
  if (!item) {
    throw new Error(`Expected item at index ${index}`);
  }

  return item;
}
