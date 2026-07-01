import type {
  DictionaryCategoriesResponse,
  DictionaryEntriesResponse
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { createReferencePageSummary } from "./referencePageSummary";

const categoryId = "8e14390f-3db1-4d1c-9344-55679c778427";

const categoriesResponse = {
  categories: [
    {
      id: categoryId,
      code: "planets_in_signs",
      name: "Планеты в знаках",
      order: 10,
      count: 4,
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z"
    }
  ],
  total: 1
} satisfies DictionaryCategoriesResponse;

const entriesResponse = {
  entries: [
    {
      id: "7c4e4916-9272-4a0f-928d-5f6f9f28b2a0",
      categoryId,
      categoryCode: "planets_in_signs",
      code: "sun_aries",
      locale: "ru",
      source: "platform",
      title: "Солнце в Овне",
      content: "Яркая воля и инициатива.",
      platformEntryId: "1d2a5bd0-0f3e-4a8d-8d30-61e313201c57",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z"
    }
  ],
  total: 4,
  counts: {
    sources: {
      all: 4,
      platform: 3,
      modified: 1,
      custom: 0
    }
  }
} satisfies DictionaryEntriesResponse;

describe("createReferencePageSummary", () => {
  it("creates safe page summary values while queries are loading", () => {
    expect(
      createReferencePageSummary({
        categoriesResponse: undefined,
        entriesResponse: undefined
      })
    ).toEqual({
      categories: [],
      entries: [],
      total: 0,
      sourceCounts: {
        all: 0,
        platform: 0,
        modified: 0,
        custom: 0
      }
    });
  });

  it("creates page summary values from loaded dictionary responses", () => {
    expect(
      createReferencePageSummary({
        categoriesResponse,
        entriesResponse
      })
    ).toEqual({
      categories: categoriesResponse.categories,
      entries: entriesResponse.entries,
      total: 4,
      sourceCounts: entriesResponse.counts.sources
    });
  });
});
