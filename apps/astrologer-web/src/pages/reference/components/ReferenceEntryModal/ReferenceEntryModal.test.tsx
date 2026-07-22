import type {
  DictionaryCategoryResponse,
  DictionaryEffectiveEntryResponse
} from "@elevenhouse/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceEntryModal, type ReferenceEntryModalProps } from "./ReferenceEntryModal";
import type {
  ReferenceEntryModalBaseCopy,
  ReferenceEntryModalViewProps
} from "./components/ReferenceEntryModalView";

const mocks = vi.hoisted(() => ({
  referenceEntryModalView: vi.fn(),
  createEntryMutation: {
    isPending: false,
    isError: false,
    mutateAsync: vi.fn()
  },
  createAiDraftMutation: {
    isPending: false,
    isError: false,
    mutateAsync: vi.fn()
  },
  updateCustomEntryMutation: {
    isPending: false,
    isError: false,
    mutateAsync: vi.fn()
  },
  updatePlatformEntryMutation: {
    isPending: false,
    isError: false,
    mutateAsync: vi.fn()
  }
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useRef: vi.fn((initialValue: unknown) => ({ current: initialValue })),
    useState: vi.fn((initialValue: unknown) => [
      typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue,
      vi.fn()
    ])
  };
});

vi.mock("./components/ReferenceEntryModalView", () => ({
  ReferenceEntryModalView: mocks.referenceEntryModalView
}));

vi.mock("../../../../features/dictionary/model/useCreateDictionaryCustomEntryMutation", () => ({
  useCreateDictionaryCustomEntryMutation: () => mocks.createEntryMutation
}));

vi.mock("../../../../features/dictionary/model/useCreateDictionaryAiDraftMutation", () => ({
  useCreateDictionaryAiDraftMutation: () => mocks.createAiDraftMutation
}));

vi.mock("../../../../features/dictionary/model/useUpdateDictionaryCustomEntryMutation", () => ({
  useUpdateDictionaryCustomEntryMutation: () => mocks.updateCustomEntryMutation
}));

vi.mock(
  "../../../../features/dictionary/model/useUpdateDictionaryPlatformEntryOverrideMutation",
  () => ({
    useUpdateDictionaryPlatformEntryOverrideMutation: () => mocks.updatePlatformEntryMutation
  })
);

const categoryId = "8e14390f-3db1-4d1c-9344-55679c778427";
const secondCategoryId = "3f925316-1b0e-47c8-a41e-91796f321acb";
const entryId = "5f4e7847-f2f8-4bd8-96f4-58f2805824d9";
const astrologerEntryId = "f04a647d-649f-4d31-a4c8-1c7e5f79792c";
const platformEntryId = "a138f7d0-6b2c-4f6d-89a9-6be4f756d133";

const copy = {
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
  aiDraftLoadingLabel: "Генерируем...",
  aiDraftLoadingAnnouncement: "Генерируем AI-черновик",
  aiDraftErrorLabel: "Повторить AI-черновик",
  aiDraftErrorTitle: "Не удалось создать AI-черновик. Попробуйте ещё раз.",
  aiDraftErrorAnnouncement: "Не удалось создать AI-черновик",
  aiDraftDisabledTooltip: "Сначала заполните название",
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
} satisfies ReferenceEntryModalBaseCopy;

const categories = [
  {
    id: categoryId,
    code: "planets_in_signs",
    name: "Планеты в знаках",
    order: 10,
    count: 4,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  },
  {
    id: secondCategoryId,
    code: "planets_in_houses",
    name: "Планеты в домах",
    order: 20,
    count: 3,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z"
  }
] satisfies DictionaryCategoryResponse[];

describe("ReferenceEntryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.referenceEntryModalView.mockImplementation(() => null);
    mocks.createEntryMutation.isPending = false;
    mocks.createEntryMutation.isError = false;
    mocks.createEntryMutation.mutateAsync.mockResolvedValue({});
    mocks.createAiDraftMutation.isPending = false;
    mocks.createAiDraftMutation.isError = false;
    mocks.createAiDraftMutation.mutateAsync.mockResolvedValue({
      content: "AI generated content"
    });
    mocks.updateCustomEntryMutation.isPending = false;
    mocks.updateCustomEntryMutation.isError = false;
    mocks.updateCustomEntryMutation.mutateAsync.mockResolvedValue({});
    mocks.updatePlatformEntryMutation.isPending = false;
    mocks.updatePlatformEntryMutation.isError = false;
    mocks.updatePlatformEntryMutation.mutateAsync.mockResolvedValue({});
  });

  it("initializes edit mode from a custom entry and routes submit to the custom update mutation", async () => {
    const onClose = vi.fn();

    const view = ReferenceEntryModal({
      copy,
      categories,
      locale: "ru",
      mode: "edit",
      entry: createEntry({
        source: "custom",
        title: "  Авторская Венера  ",
        content: "  Авторская редакция  ",
        astrologerEntryId
      }),
      onClose
    });

    const viewProps = getViewProps(view);
    expect(viewProps.draft).toEqual({
      categoryId,
      title: "  Авторская Венера  ",
      content: "  Авторская редакция  "
    });
    expect(viewProps.copy.title).toBe("Редактировать трактовку");
    expect(viewProps.copy.closeLabel).toBe("Закрыть модалку редактирования трактовки");
    expect(viewProps.isCategoryEditable).toBe(true);

    viewProps.onSubmit();
    await Promise.resolve();

    expect(mocks.updateCustomEntryMutation.mutateAsync).toHaveBeenCalledWith({
      entryId: astrologerEntryId,
      categoryId,
      title: "Авторская Венера",
      content: "Авторская редакция"
    });
    expect(mocks.createEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.updatePlatformEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("routes platform entry edits to the platform override mutation with title and content only", async () => {
    const onClose = vi.fn();

    const view = ReferenceEntryModal({
      copy,
      categories,
      locale: "ru",
      mode: "edit",
      entry: createEntry({
        source: "modified",
        title: "  Солнце в Овне  ",
        content: "  Авторская редакция платформенной трактовки  ",
        platformEntryId
      }),
      onClose
    });

    const viewProps = getViewProps(view);
    expect(viewProps.isCategoryEditable).toBe(false);

    viewProps.onSubmit();
    await Promise.resolve();

    expect(mocks.updatePlatformEntryMutation.mutateAsync).toHaveBeenCalledWith({
      platformEntryId,
      title: "Солнце в Овне",
      content: "Авторская редакция платформенной трактовки"
    });
    expect(mocks.createEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.updateCustomEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to the effective entry id when a custom entry has no astrologer entry id", async () => {
    const onClose = vi.fn();
    const view = ReferenceEntryModal({
      copy,
      categories,
      locale: "ru",
      mode: "edit",
      entry: createEntry({
        source: "custom"
      }),
      onClose
    });

    getViewProps(view).onSubmit();
    await Promise.resolve();

    expect(mocks.updateCustomEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.createEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.updatePlatformEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not submit a platform edit without a platform entry id", async () => {
    const onClose = vi.fn();
    const view = ReferenceEntryModal({
      copy,
      categories,
      locale: "ru",
      mode: "edit",
      entry: createEntry({
        source: "platform"
      }),
      onClose
    });

    getViewProps(view).onSubmit();
    await Promise.resolve();

    expect(mocks.updatePlatformEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.createEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.updateCustomEntryMutation.mutateAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("creates an AI draft through the mutation using current category, locale, and trimmed title", async () => {
    const viewProps = renderCreateViewProps({
      locale: "en",
      selectedCategoryId: categoryId,
      titleSeed: " Солнце в Овне "
    });

    viewProps.onCreateAiDraft();
    await flushPromises();

    expect(mocks.createAiDraftMutation.mutateAsync).toHaveBeenCalledWith({
      categoryId,
      locale: "en",
      title: "Солнце в Овне"
    });
  });

  it("does not create an AI draft while a draft request is already pending", () => {
    mocks.createAiDraftMutation.isPending = true;

    renderCreateViewProps().onCreateAiDraft();

    expect(mocks.createAiDraftMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("does not create an AI draft without a title or category", () => {
    renderCreateViewProps({ titleSeed: " " }).onCreateAiDraft();
    renderCreateViewProps({ categories: [], selectedCategoryId: null }).onCreateAiDraft();

    expect(mocks.createAiDraftMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("passes AI draft pending and error state to the view", () => {
    mocks.createAiDraftMutation.isPending = true;
    mocks.createAiDraftMutation.isError = true;

    const viewProps = renderCreateViewProps();

    expect(viewProps.isCreatingAiDraft).toBe(true);
    expect(viewProps.aiErrorMessage).toBe("Не удалось сохранить трактовку");
  });
});

function getViewProps(view: unknown): ReferenceEntryModalViewProps {
  const props =
    typeof view === "object" && view && "props" in view
      ? (view.props as ReferenceEntryModalViewProps)
      : undefined;

  if (!props) {
    throw new Error("Expected ReferenceEntryModalView to be rendered");
  }

  return props;
}

function createEntry(
  overrides: Partial<DictionaryEffectiveEntryResponse>
): DictionaryEffectiveEntryResponse {
  return {
    id: entryId,
    categoryId,
    categoryCode: "planets_in_signs",
    code: "venus_aries",
    locale: "ru",
    source: "custom",
    title: "Венера в Овне",
    content: "Базовое содержание",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides
  };
}

type ReferenceEntryModalCreateProps = Extract<
  ReferenceEntryModalProps,
  { readonly mode: "create" }
>;

function renderCreateViewProps(
  overrides: Partial<ReferenceEntryModalCreateProps> = {}
): ReferenceEntryModalViewProps {
  return getViewProps(
    ReferenceEntryModal({
      copy,
      categories,
      locale: "ru",
      mode: "create",
      selectedCategoryId: categoryId,
      codeSeed: null,
      titleSeed: "Солнце в Овне",
      onClose: vi.fn(),
      ...overrides
    })
  );
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
