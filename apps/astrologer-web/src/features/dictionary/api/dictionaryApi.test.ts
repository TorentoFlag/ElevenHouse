import type {
  DictionaryAstrologerEntryResponse,
  DictionaryCategoriesResponse,
  DictionaryEntriesResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { createDictionaryCustomEntry } from "./createDictionaryCustomEntry";
import { listDictionaryCategories } from "./listDictionaryCategories";
import { listDictionaryEntries } from "./listDictionaryEntries";
import { resetDictionaryEntries } from "./resetDictionaryEntries";

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

const astrologerEntryResponse = {
  id: "a2fb1fef-dc5c-44ec-ae36-060f455c8f0f",
  ownerUserId: "4f3873e2-a2e8-4a3e-9387-b2f2fc39ee22",
  categoryId,
  code: "custom_venus_gemini",
  locale: "ru",
  entryType: "custom",
  title: "Венера в Близнецах",
  content: "Любовь становится легкой, живой и связанной с общением.",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z"
} satisfies DictionaryAstrologerEntryResponse;

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

  it("creates custom dictionary entries through the shared request and response contracts", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(astrologerEntryResponse);

    await expect(
      createDictionaryCustomEntry({
        categoryId,
        locale: "ru",
        title: " Венера в Близнецах ",
        content: " Любовь становится легкой, живой и связанной с общением. "
      })
    ).resolves.toEqual(astrologerEntryResponse);

    expect(post).toHaveBeenCalledWith(
      "/dictionary/custom-entries",
      {
        categoryId,
        locale: "ru",
        title: "Венера в Близнецах",
        content: "Любовь становится легкой, живой и связанной с общением."
      },
      { csrf: true }
    );
  });

  it("resets every astrologer dictionary entry through the protected reset endpoint", async () => {
    const deleteRequest = vi.spyOn(application.http, "delete").mockResolvedValue(undefined);

    await expect(resetDictionaryEntries()).resolves.toBeUndefined();

    expect(deleteRequest).toHaveBeenCalledWith("/dictionary/entries", { csrf: true });
  });
});
