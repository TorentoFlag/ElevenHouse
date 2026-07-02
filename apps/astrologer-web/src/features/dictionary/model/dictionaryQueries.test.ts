import type { DictionaryEntriesQuery } from "@elevenhouse/contracts";
import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createDictionaryCustomEntry } from "../api/createDictionaryCustomEntry";
import { listDictionaryCategories } from "../api/listDictionaryCategories";
import { listDictionaryEntries } from "../api/listDictionaryEntries";
import { resetDictionaryEntries } from "../api/resetDictionaryEntries";
import { updateDictionaryCustomEntry } from "../api/updateDictionaryCustomEntry";
import { updateDictionaryPlatformEntryOverride } from "../api/updateDictionaryPlatformEntryOverride";
import {
  createDictionaryCustomEntryMutationOptions,
  dictionaryCategoriesQueryOptions,
  dictionaryEntriesQueryOptions,
  resetDictionaryEntriesMutationOptions,
  updateDictionaryCustomEntryMutationOptions,
  updateDictionaryPlatformEntryOverrideMutationOptions
} from "./dictionaryQueryOptions";
import { dictionaryQueryKeys } from "./dictionaryQueryKeys";

vi.mock("../api/listDictionaryCategories", () => ({
  listDictionaryCategories: vi.fn()
}));

vi.mock("../api/createDictionaryCustomEntry", () => ({
  createDictionaryCustomEntry: vi.fn()
}));

vi.mock("../api/listDictionaryEntries", () => ({
  listDictionaryEntries: vi.fn()
}));

vi.mock("../api/resetDictionaryEntries", () => ({
  resetDictionaryEntries: vi.fn()
}));

vi.mock("../api/updateDictionaryCustomEntry", () => ({
  updateDictionaryCustomEntry: vi.fn()
}));

vi.mock("../api/updateDictionaryPlatformEntryOverride", () => ({
  updateDictionaryPlatformEntryOverride: vi.fn()
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
    expect(dictionaryQueryKeys.all()).toEqual(["dictionary"]);
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

  it("creates custom entries and invalidates every dictionary query on success", async () => {
    vi.mocked(createDictionaryCustomEntry).mockResolvedValue({
      id: "a2fb1fef-dc5c-44ec-ae36-060f455c8f0f",
      ownerUserId: "4f3873e2-a2e8-4a3e-9387-b2f2fc39ee22",
      categoryId: entriesQuery.categoryId,
      code: "custom_venus_gemini",
      locale: "ru",
      entryType: "custom",
      title: "Венера в Близнецах",
      content: "Любовь становится легкой, живой и связанной с общением.",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z"
    });
    const queryClient = {
      invalidateQueries: vi.fn()
    };
    const input = {
      categoryId: entriesQuery.categoryId,
      locale: "ru",
      title: "Венера в Близнецах",
      content: "Любовь становится легкой, живой и связанной с общением."
    } as const;
    const options = createDictionaryCustomEntryMutationOptions(queryClient);

    await expect(options.mutationFn(input)).resolves.toMatchObject({
      title: "Венера в Близнецах"
    });
    await options.onSuccess();

    expect(createDictionaryCustomEntry).toHaveBeenCalledWith(input);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: dictionaryQueryKeys.all()
    });
  });

  it("updates custom entries and invalidates every dictionary query on success", async () => {
    vi.mocked(updateDictionaryCustomEntry).mockResolvedValue({
      id: "a2fb1fef-dc5c-44ec-ae36-060f455c8f0f",
      ownerUserId: "4f3873e2-a2e8-4a3e-9387-b2f2fc39ee22",
      categoryId: entriesQuery.categoryId,
      code: "custom_venus_gemini",
      locale: "ru",
      entryType: "custom",
      title: "Венера в Близнецах",
      content: "Новая редакция",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z"
    });
    const queryClient = {
      invalidateQueries: vi.fn()
    };
    const input = {
      entryId: "a2fb1fef-dc5c-44ec-ae36-060f455c8f0f",
      categoryId: entriesQuery.categoryId,
      title: "Венера в Близнецах",
      content: "Новая редакция"
    } as const;
    const options = updateDictionaryCustomEntryMutationOptions(queryClient);

    await expect(options.mutationFn(input)).resolves.toMatchObject({
      title: "Венера в Близнецах"
    });
    await options.onSuccess();

    expect(updateDictionaryCustomEntry).toHaveBeenCalledWith(input);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: dictionaryQueryKeys.all()
    });
  });

  it("updates platform entry overrides and invalidates every dictionary query on success", async () => {
    vi.mocked(updateDictionaryPlatformEntryOverride).mockResolvedValue({
      id: "a2fb1fef-dc5c-44ec-ae36-060f455c8f0f",
      ownerUserId: "4f3873e2-a2e8-4a3e-9387-b2f2fc39ee22",
      categoryId: entriesQuery.categoryId,
      code: "sun_aries",
      locale: "ru",
      entryType: "override",
      title: "Солнце в Овне",
      content: "Авторская редакция",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z"
    });
    const queryClient = {
      invalidateQueries: vi.fn()
    };
    const input = {
      platformEntryId: "a138f7d0-6b2c-4f6d-89a9-6be4f756d133",
      title: "Солнце в Овне",
      content: "Авторская редакция"
    } as const;
    const options = updateDictionaryPlatformEntryOverrideMutationOptions(queryClient);

    await expect(options.mutationFn(input)).resolves.toMatchObject({
      title: "Солнце в Овне"
    });
    await options.onSuccess();

    expect(updateDictionaryPlatformEntryOverride).toHaveBeenCalledWith(input);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: dictionaryQueryKeys.all()
    });
  });

  it("resets all astrologer dictionary entries and invalidates every dictionary query on success", async () => {
    vi.mocked(resetDictionaryEntries).mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries: vi.fn()
    };
    const options = resetDictionaryEntriesMutationOptions(queryClient);

    await expect(options.mutationFn()).resolves.toBeUndefined();
    await options.onSuccess();

    expect(resetDictionaryEntries).toHaveBeenCalledWith();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: dictionaryQueryKeys.all()
    });
  });
});
