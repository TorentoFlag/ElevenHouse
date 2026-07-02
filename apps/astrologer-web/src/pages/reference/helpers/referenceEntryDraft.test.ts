import { describe, expect, it } from "vitest";
import {
  createReferenceEntryAiDraft,
  createReferenceEntryDraft,
  isReferenceEntryDraftSubmittable,
  normalizeReferenceEntryDraft
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
        categoryId: categories[0]?.id ?? "",
        title: " Солнце в Овне ",
        content: " Яркая воля. "
      })
    ).toBe(true);
    expect(
      isReferenceEntryDraftSubmittable({
        categoryId: categories[0]?.id ?? "",
        title: " ",
        content: " Яркая воля. "
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

  it("creates an AI draft from the localized template only when the title is present", () => {
    expect(
      createReferenceEntryAiDraft({
        title: " Венера в Близнецах ",
        template: "Черновик для «{title}»: опишите проявления положения."
      })
    ).toBe("Черновик для «Венера в Близнецах»: опишите проявления положения.");
    expect(
      createReferenceEntryAiDraft({
        title: " ",
        template: "Черновик для «{title}»: опишите проявления положения."
      })
    ).toBe("");
  });
});
