import type { DictionaryEntriesQuery } from "@elevenhouse/contracts";
import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { listDictionaryCategories } from "../api/listDictionaryCategories";
import { listDictionaryEntries } from "../api/listDictionaryEntries";
import {
  dictionaryCategoriesQueryOptions,
  dictionaryEntriesQueryOptions
} from "./dictionaryQueryOptions";
import { dictionaryQueryKeys } from "./dictionaryQueryKeys";

vi.mock("../api/listDictionaryCategories", () => ({
  listDictionaryCategories: vi.fn()
}));

vi.mock("../api/listDictionaryEntries", () => ({
  listDictionaryEntries: vi.fn()
}));

const entriesQuery = {
  locale: "ru",
  categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
  source: "all",
  search: "луна",
  limit: 50,
  offset: 0
} satisfies DictionaryEntriesQuery;

describe("dictionary query keys", () => {
  it("uses stable serializable keys for categories and entries", () => {
    expect(dictionaryQueryKeys.categories({ locale: "ru" })).toEqual([
      "dictionary",
      "categories",
      { locale: "ru" }
    ]);
    expect(dictionaryQueryKeys.entries(entriesQuery)).toEqual([
      "dictionary",
      "entries",
      entriesQuery
    ]);
  });
});

describe("dictionary query options", () => {
  it("loads categories through the API query function", async () => {
    vi.mocked(listDictionaryCategories).mockResolvedValue({
      categories: [],
      total: 0
    });

    const options = dictionaryCategoriesQueryOptions({ locale: "ru" });

    expect(options.queryKey).toEqual(dictionaryQueryKeys.categories({ locale: "ru" }));
    await expect(options.queryFn()).resolves.toEqual({ categories: [], total: 0 });
    expect(listDictionaryCategories).toHaveBeenCalledWith({ locale: "ru" });
  });

  it("loads entries through the API query function", async () => {
    vi.mocked(listDictionaryEntries).mockResolvedValue({
      entries: [],
      total: 0,
      counts: {
        sources: {
          all: 0,
          platform: 0,
          modified: 0,
          custom: 0
        }
      }
    });

    const options = dictionaryEntriesQueryOptions(entriesQuery);

    expect(options.queryKey).toEqual(dictionaryQueryKeys.entries(entriesQuery));
    await expect(options.queryFn()).resolves.toMatchObject({ entries: [], total: 0 });
    expect(listDictionaryEntries).toHaveBeenCalledWith(entriesQuery);
  });

  it("keeps previous entries visible while a changed filter query is loading", () => {
    const options = dictionaryEntriesQueryOptions(entriesQuery);

    expect(options.placeholderData).toBe(keepPreviousData);
  });
});
