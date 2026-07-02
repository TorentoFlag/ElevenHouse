import type { DictionaryCategoryResponse } from "@elevenhouse/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceEntryModal, type ReferenceEntryModalProps } from "./ReferenceEntryModal";
import type {
  ReferenceEntryModalCopy,
  ReferenceEntryModalDraft,
  ReferenceEntryModalViewProps
} from "./ReferenceEntryModalView";

const testState = vi.hoisted(() => ({
  stateSlots: [] as unknown[],
  stateCursor: 0,
  setDraft: vi.fn(
    (
      nextDraft:
        | ReferenceEntryModalDraft
        | ((currentDraft: ReferenceEntryModalDraft) => ReferenceEntryModalDraft)
    ) => {
      const currentDraft = testState.stateSlots[0] as ReferenceEntryModalDraft | undefined;
      if (!currentDraft) {
        throw new Error("Expected draft state to be initialized");
      }

      testState.stateSlots[0] =
        typeof nextDraft === "function" ? nextDraft(currentDraft) : nextDraft;
    }
  ),
  createAiDraftMutation: {
    isPending: false,
    isError: false,
    mutateAsync: vi.fn()
  },
  createEntryMutation: {
    isPending: false,
    isError: false,
    mutateAsync: vi.fn()
  }
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useState: vi.fn(
      <T,>(initializer: T | (() => T)) => {
        const stateIndex = testState.stateCursor;
        testState.stateCursor += 1;

        if (testState.stateSlots[stateIndex] === undefined) {
          testState.stateSlots[stateIndex] =
            typeof initializer === "function" ? (initializer as () => T)() : initializer;
        }

        const setState = (
          nextValue: T | ((currentValue: T) => T)
        ) => {
          const currentValue = testState.stateSlots[stateIndex] as T;
          testState.stateSlots[stateIndex] =
            typeof nextValue === "function"
              ? (nextValue as (currentValue: T) => T)(currentValue)
              : nextValue;
        };

        return [
          testState.stateSlots[stateIndex] as T,
          stateIndex === 0 ? testState.setDraft : setState
        ] as const;
      }
    )
  };
});

vi.mock("../../../../features/dictionary/model/useCreateDictionaryAiDraftMutation", () => ({
  useCreateDictionaryAiDraftMutation: () => testState.createAiDraftMutation
}));

vi.mock("../../../../features/dictionary/model/useCreateDictionaryCustomEntryMutation", () => ({
  useCreateDictionaryCustomEntryMutation: () => testState.createEntryMutation
}));

const copy = {
  title: "Новая трактовка",
  closeLabel: "Закрыть",
  categoryLabel: "Категория",
  titleLabel: "Название",
  titlePlaceholder: "Напр. Солнце в Овне",
  contentLabel: "Текст трактовки",
  contentPlaceholder: "Ваша трактовка...",
  aiDraftLabel: "AI-черновик",
  aiDraftTitle: "AI набросает черновик по заголовку — отредактируйте под свой стиль",
  cancelLabel: "Отмена",
  saveLabel: "Сохранить",
  savingLabel: "Сохраняем",
  genericError: "Не удалось сохранить трактовку",
  validation: {
    categoryRequired: "Выберите категорию",
    titleRequired: "Введите название",
    titleMaxLength: "Название не должно быть длиннее {max} символов",
    contentRequired: "Введите текст трактовки",
    contentMaxLength: "Текст не должно быть длиннее {max} символов"
  }
} satisfies ReferenceEntryModalCopy;

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
] satisfies DictionaryCategoryResponse[];

describe("ReferenceEntryModal", () => {
  beforeEach(() => {
    testState.stateSlots = [];
    testState.stateCursor = 0;
    testState.setDraft.mockClear();
    testState.createAiDraftMutation.isPending = false;
    testState.createAiDraftMutation.isError = false;
    testState.createAiDraftMutation.mutateAsync.mockReset();
    testState.createEntryMutation.isPending = false;
    testState.createEntryMutation.isError = false;
    testState.createEntryMutation.mutateAsync.mockReset();
  });

  it("does not create an AI draft while a draft request is already pending", () => {
    testState.createAiDraftMutation.isPending = true;

    renderModalProps().onCreateAiDraft();

    expect(testState.createAiDraftMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("does not create an AI draft when the title is blank", () => {
    renderModalProps({ titleSeed: " " }).onCreateAiDraft();

    expect(testState.createAiDraftMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("does not create an AI draft without a category", () => {
    renderModalProps({ categories: [] }).onCreateAiDraft();

    expect(testState.createAiDraftMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("creates an AI draft through the mutation and applies returned content to the current draft", async () => {
    const aiDraftResponse = createDeferred<{ content: string }>();
    testState.createAiDraftMutation.mutateAsync.mockReturnValue(aiDraftResponse.promise);

    const initialProps = renderModalProps({
      locale: "en",
      selectedCategoryId: categories[0]?.id ?? null,
      titleSeed: " Венера в Близнецах "
    });

    initialProps.onCreateAiDraft();

    expect(testState.createAiDraftMutation.mutateAsync).toHaveBeenCalledWith({
      categoryId: categories[0]?.id,
      locale: "en",
      title: "Венера в Близнецах"
    });

    initialProps.onDraftChange({
      ...initialProps.draft,
      categoryId: categories[1]?.id ?? "",
      title: "Edited while AI is pending",
      content: "Manual text"
    });
    aiDraftResponse.resolve({ content: "Generated AI content" });
    await flushPromises();

    expect(renderModalProps().draft).toEqual({
      categoryId: categories[1]?.id,
      title: "Edited while AI is pending",
      content: "Generated AI content"
    });
  });

  it("keeps rejected AI draft promises handled and exposes mutation error state", async () => {
    testState.createAiDraftMutation.isError = true;
    testState.createAiDraftMutation.mutateAsync.mockRejectedValue(new Error("AI failed"));

    const props = renderModalProps();

    expect(props.aiErrorMessage).toBe("Не удалось сохранить трактовку");

    props.onCreateAiDraft();
    await flushPromises();

    expect(testState.createAiDraftMutation.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps custom entry save behavior wired to the save mutation", async () => {
    const onClose = vi.fn();
    testState.createEntryMutation.mutateAsync.mockResolvedValue({
      id: "a2fb1fef-dc5c-44ec-ae36-060f455c8f0f"
    });
    const initialProps = renderModalProps({ onClose });
    initialProps.onDraftChange({
      ...initialProps.draft,
      content: " Saved interpretation "
    });

    renderModalProps({ onClose }).onSubmit();
    await flushPromises();

    expect(testState.createEntryMutation.mutateAsync).toHaveBeenCalledWith({
      categoryId: categories[0]?.id,
      locale: "ru",
      title: "Солнце в Овне",
      content: "Saved interpretation"
    });
    expect(onClose).toHaveBeenCalled();
  });
});

function renderModalProps(overrides: Partial<ReferenceEntryModalProps> = {}) {
  testState.stateCursor = 0;
  const element = ReferenceEntryModal({
    copy,
    categories,
    locale: "ru",
    selectedCategoryId: categories[0]?.id ?? null,
    titleSeed: "Солнце в Овне",
    onClose: vi.fn(),
    ...overrides
  });

  return element.props as ReferenceEntryModalViewProps;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
