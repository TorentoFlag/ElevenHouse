import type {
  DictionaryEntrySourceFilter,
  DictionaryLocale
} from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { createReferenceEntriesQuery } from "./referenceEntriesQuery";

const categoryId = "8e14390f-3db1-4d1c-9344-55679c778427";

describe("createReferenceEntriesQuery", () => {
  it("builds dictionary entries queries from locale and local filters", () => {
    expect(
      createReferenceEntriesQuery({
        locale: "ru",
        selectedCategoryId: categoryId,
        selectedSource: "modified",
        search: " луна "
      })
    ).toEqual({
      locale: "ru",
      categoryId,
      source: "modified",
      search: "луна",
      limit: 50,
      offset: 0
    });
  });

  it("omits empty category and search filters from dictionary entries queries", () => {
    expect(
      createReferenceEntriesQuery({
        locale: "en",
        selectedCategoryId: null,
        selectedSource: "all",
        search: " "
      })
    ).toEqual({
      locale: "en",
      source: "all",
      limit: 50,
      offset: 0
    });
  });
});

type CreateReferenceEntriesQueryInput = Parameters<typeof createReferenceEntriesQuery>[0];

const _typecheckInput = {
  locale: "ru",
  selectedCategoryId: null,
  selectedSource: "all",
  search: ""
} satisfies {
  locale: DictionaryLocale;
  selectedCategoryId: string | null;
  selectedSource: DictionaryEntrySourceFilter;
  search: string;
} satisfies CreateReferenceEntriesQueryInput;

void _typecheckInput;
