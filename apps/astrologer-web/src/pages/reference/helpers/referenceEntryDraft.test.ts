import { describe, expect, it } from "vitest";
import { dictionaryContentMaxLength, dictionaryTitleMaxLength } from "@elevenhouse/contracts";
import {
  createReferenceEntryDraft,
  isReferenceEntryDraftSubmittable,
  normalizeReferenceEntryDraft,
  resolveReferenceEntryVisibleFieldErrors,
  validateReferenceEntryDraft
} from "./referenceEntryDraft";

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

const validationCopy = {
  categoryRequired: "Выберите категорию",
  titleRequired: "Введите название",
  titleMaxLength: "Название не должно быть длиннее {max} символов",
  contentRequired: "Введите текст трактовки",
  contentMaxLength: "Текст не должен быть длиннее {max} символов"
};

describe("reference entry draft helpers", () => {
  it("prefills a new draft from the selected category and optional title seed", () => {
    expect(
      createReferenceEntryDraft({
        categories,
        selectedCategoryId: categories[1]?.id ?? null,
        titleSeed: " Венера в Близнецах "
      })
    ).toEqual({
      categoryId: categories[1]?.id,
      title: "Венера в Близнецах",
      content: ""
    });
  });

  it("falls back to the first available category when every-category mode is active", () => {
    expect(
      createReferenceEntryDraft({
        categories,
        selectedCategoryId: null,
        titleSeed: ""
      }).categoryId
    ).toBe(categories[0]?.id);
  });

  it("validates and normalizes submittable drafts", () => {
    expect(
      isReferenceEntryDraftSubmittable({
        draft: {
          categoryId: categories[0]?.id ?? "",
          title: " Солнце в Овне ",
          content: " Яркая воля. "
        },
        locale: "ru"
      })
    ).toBe(true);
    expect(
      isReferenceEntryDraftSubmittable({
        draft: {
          categoryId: categories[0]?.id ?? "",
          title: " ",
          content: " Яркая воля. "
        },
        locale: "ru"
      })
    ).toBe(false);
    expect(
      normalizeReferenceEntryDraft({
        categoryId: categories[0]?.id ?? "",
        title: " Солнце в Овне ",
        content: " Яркая воля. "
      })
    ).toEqual({
      categoryId: categories[0]?.id,
      title: "Солнце в Овне",
      content: "Яркая воля."
    });
  });

  it("uses the backend custom-entry request contract for frontend submit validation", () => {
    expect(
      isReferenceEntryDraftSubmittable({
        draft: {
          categoryId: "not-a-uuid",
          title: "Солнце в Овне",
          content: "Яркая воля."
        },
        locale: "ru"
      })
    ).toBe(false);
    expect(
      isReferenceEntryDraftSubmittable({
        draft: {
          categoryId: categories[0]?.id ?? "",
          title: "x".repeat(dictionaryTitleMaxLength + 1),
          content: "Яркая воля."
        },
        locale: "ru"
      })
    ).toBe(false);
    expect(
      isReferenceEntryDraftSubmittable({
        draft: {
          categoryId: categories[0]?.id ?? "",
          title: "Солнце в Овне",
          content: "x".repeat(dictionaryContentMaxLength + 1)
        },
        locale: "ru"
      })
    ).toBe(false);
  });

  it("maps backend contract validation failures to localized field helper text", () => {
    expect(
      validateReferenceEntryDraft({
        draft: {
          categoryId: "not-a-uuid",
          title: " ",
          content: "x".repeat(dictionaryContentMaxLength + 1)
        },
        locale: "ru",
        copy: validationCopy
      })
    ).toEqual({
      canSubmit: false,
      fieldErrors: {
        categoryId: "Выберите категорию",
        title: "Введите название",
        content: `Текст не должен быть длиннее ${dictionaryContentMaxLength} символов`
      }
    });

    expect(
      validateReferenceEntryDraft({
        draft: {
          categoryId: categories[0]?.id ?? "",
          title: "x".repeat(dictionaryTitleMaxLength + 1),
          content: "Текст"
        },
        locale: "ru",
        copy: validationCopy
      }).fieldErrors.title
    ).toBe(`Название не должно быть длиннее ${dictionaryTitleMaxLength} символов`);
  });

  it("hides required helper text until the field is touched or submit is attempted", () => {
    const validationState = validateReferenceEntryDraft({
      draft: {
        categoryId: categories[0]?.id ?? "",
        title: "",
        content: ""
      },
      locale: "ru",
      copy: validationCopy
    });

    expect(
      resolveReferenceEntryVisibleFieldErrors({
        fieldErrors: validationState.fieldErrors,
        touchedFields: {
          categoryId: false,
          title: false,
          content: false
        },
        submitAttempted: false
      })
    ).toEqual({});
    expect(
      resolveReferenceEntryVisibleFieldErrors({
        fieldErrors: validationState.fieldErrors,
        touchedFields: {
          categoryId: false,
          title: true,
          content: false
        },
        submitAttempted: false
      })
    ).toEqual({ title: "Введите название" });
    expect(
      resolveReferenceEntryVisibleFieldErrors({
        fieldErrors: validationState.fieldErrors,
        touchedFields: {
          categoryId: false,
          title: false,
          content: false
        },
        submitAttempted: true
      })
    ).toEqual(validationState.fieldErrors);
  });
});
