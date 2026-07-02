import { describe, expect, it, vi } from "vitest";
import {
  createDictionaryCustomEntry,
  deleteDictionaryAstrologerEntry,
  dictionaryEntrySourceValues,
  dictionaryLocaleValues,
  listDictionaryCategories,
  listDictionaryEntries,
  overrideDictionaryPlatformEntry,
  resetDictionaryAstrologerEntries,
  resetDictionaryPlatformEntryOverride,
  type DictionaryStore
} from "./index";

const now = new Date("2026-06-30T10:00:00.000Z");

function createStore(overrides: Partial<DictionaryStore> = {}): DictionaryStore {
  return {
    listCategories: vi.fn(async () => ({
      categories: [
        {
          id: "category_planets_signs",
          code: "planets_in_signs",
          name: "Планеты в знаках",
          order: 10,
          count: 4,
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z"
        }
      ],
      total: 14
    })),
    listEntries: vi.fn(async () => ({
      entries: [],
      total: 0,
      counts: {
        sources: {
          all: 14,
          platform: 14,
          modified: 0,
          custom: 0
        }
      }
    })),
    createCustomEntry: vi.fn(async (input) => ({
      id: "astrologer_entry_custom",
      platformEntryId: undefined,
      entryType: "custom",
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      ...input
    })),
    upsertPlatformEntryOverride: vi.fn(async (input) => ({
      id: "astrologer_entry_override",
      ownerUserId: input.ownerUserId,
      platformEntryId: input.platformEntryId,
      categoryId: "category_planets_signs",
      code: "sun_aries",
      locale: "ru" as const,
      entryType: "override" as const,
      title: input.title,
      content: input.content,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt
    })),
    deleteAstrologerEntry: vi.fn(async () => undefined),
    resetAstrologerEntries: vi.fn(async () => undefined),
    resetPlatformEntryOverride: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("dictionary domain module", () => {
  it("exports explicit dictionary values", () => {
    expect(dictionaryLocaleValues).toEqual(["ru", "en"]);
    expect(dictionaryEntrySourceValues).toEqual(["platform", "modified", "custom"]);
  });

  it("lists categories through the dictionary store", async () => {
    const store = createStore();

    await expect(
      listDictionaryCategories({
        store,
        ownerUserId: " user_astrologer ",
        locale: " ru "
      })
    ).resolves.toEqual({
      categories: [
        {
          id: "category_planets_signs",
          code: "planets_in_signs",
          name: "Планеты в знаках",
          order: 10,
          count: 4,
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z"
        }
      ],
      total: 14
    });

    expect(store.listCategories).toHaveBeenCalledWith({
      ownerUserId: "user_astrologer",
      locale: "ru"
    });
  });

  it("normalizes effective entry list filters before calling the store", async () => {
    const store = createStore();

    await listDictionaryEntries({
      store,
      ownerUserId: " user_astrologer ",
      locale: "ru",
      categoryId: " category_planets_signs ",
      source: "modified",
      search: "  Солнце  ",
      limit: 20,
      offset: 40
    });

    expect(store.listEntries).toHaveBeenCalledWith({
      ownerUserId: "user_astrologer",
      locale: "ru",
      categoryId: "category_planets_signs",
      source: "modified",
      search: "Солнце",
      limit: 20,
      offset: 40
    });
  });

  it("creates a normalized custom dictionary entry", async () => {
    const store = createStore();

    await createDictionaryCustomEntry({
      store,
      ownerUserId: " user_astrologer ",
      categoryId: " category_planets_signs ",
      code: " moon_taurus_custom ",
      locale: "ru",
      title: "  Луна в Тельце  ",
      content: "  Пользовательская трактовка  ",
      now
    });

    expect(store.createCustomEntry).toHaveBeenCalledWith({
      ownerUserId: "user_astrologer",
      categoryId: "category_planets_signs",
      code: "moon_taurus_custom",
      locale: "ru",
      entryType: "custom",
      title: "Луна в Тельце",
      content: "Пользовательская трактовка",
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    });
  });

  it("upserts a normalized platform entry override", async () => {
    const store = createStore();

    await overrideDictionaryPlatformEntry({
      store,
      ownerUserId: " user_astrologer ",
      platformEntryId: " platform_sun_aries ",
      title: "  Солнце в Овне  ",
      content: "  Авторская редакция  ",
      now
    });

    expect(store.upsertPlatformEntryOverride).toHaveBeenCalledWith({
      ownerUserId: "user_astrologer",
      platformEntryId: "platform_sun_aries",
      title: "Солнце в Овне",
      content: "Авторская редакция",
      updatedAt: "2026-06-30T10:00:00.000Z"
    });
  });

  it("deletes a custom or override entry owned by the astrologer", async () => {
    const store = createStore();

    await deleteDictionaryAstrologerEntry({
      store,
      ownerUserId: " user_astrologer ",
      entryId: " astrologer_entry "
    });

    expect(store.deleteAstrologerEntry).toHaveBeenCalledWith({
      ownerUserId: "user_astrologer",
      entryId: "astrologer_entry"
    });
  });

  it("resets an override back to the platform entry for the astrologer", async () => {
    const store = createStore();

    await resetDictionaryPlatformEntryOverride({
      store,
      ownerUserId: " user_astrologer ",
      platformEntryId: " platform_sun_aries "
    });

    expect(store.resetPlatformEntryOverride).toHaveBeenCalledWith({
      ownerUserId: "user_astrologer",
      platformEntryId: "platform_sun_aries"
    });
  });

  it("resets every astrologer dictionary entry for the owner", async () => {
    const store = createStore();

    await resetDictionaryAstrologerEntries({
      store,
      ownerUserId: " user_astrologer "
    });

    expect(store.resetAstrologerEntries).toHaveBeenCalledWith({
      ownerUserId: "user_astrologer"
    });
  });
});
