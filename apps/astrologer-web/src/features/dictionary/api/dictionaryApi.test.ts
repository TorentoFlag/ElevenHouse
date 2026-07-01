import type { DictionaryCategoriesResponse, DictionaryEntriesResponse } from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { listDictionaryCategories } from "./listDictionaryCategories";
import { listDictionaryEntries } from "./listDictionaryEntries";

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
      id: "a138f7d0-6b2c-4f6d-89a9-6be4f756d133",
      categoryId,
      categoryCode: "planets_in_signs",
      code: "sun_aries",
      locale: "ru",
      source: "platform",
      title: "Солнце в Овне",
      content: "Яркая воля, инициатива.",
      platformEntryId: "a138f7d0-6b2c-4f6d-89a9-6be4f756d133",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z"
    }
  ],
  total: 1,
  counts: {
    sources: {
      all: 1,
      platform: 1,
      modified: 0,
      custom: 0
    }
  }
} satisfies DictionaryEntriesResponse;

describe("dictionary API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads dictionary categories through the shared response contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(categoriesResponse);

    await expect(listDictionaryCategories({ locale: "ru" })).resolves.toEqual(categoriesResponse);

    expect(get).toHaveBeenCalledWith("/dictionary/categories?locale=ru");
  });

  it("loads dictionary entries with serialized filters through the shared response contract", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(entriesResponse);

    await expect(
      listDictionaryEntries({
        locale: "ru",
        categoryId,
        source: "modified",
        search: " солнце ",
        limit: 50,
        offset: 0
      })
    ).resolves.toEqual(entriesResponse);

    const calledPath = get.mock.calls[0]?.[0];
    expect(calledPath).toBeDefined();
    const url = new URL(calledPath ?? "", "https://elevenhouse.test");

    expect(url.pathname).toBe("/dictionary/entries");
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      locale: "ru",
      source: "modified",
      limit: "50",
      offset: "0",
      categoryId,
      search: "солнце"
    });
  });

  it("rejects dictionary responses that do not match the shared contract", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({ categories: [{ id: "not-a-uuid" }] });

    await expect(listDictionaryCategories({ locale: "ru" })).rejects.toThrow();
  });
});
