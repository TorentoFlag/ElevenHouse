import { describe, expect, it } from "vitest";
import {
  createDictionaryCustomEntryRequestSchema,
  dictionaryContentMaxLength,
  dictionaryAstrologerEntryIdParamSchema,
  dictionaryEntriesQuerySchema,
  dictionaryEntrySourceSchema,
  dictionaryLocaleSchema,
  dictionaryPlatformEntryIdParamSchema,
  dictionarySourceCountsSchema,
  dictionaryTitleMaxLength,
  listDictionaryCategoriesQuerySchema,
  updateDictionaryCustomEntryRequestSchema,
  updateDictionaryPlatformEntryOverrideRequestSchema
} from "./dictionary";

describe("dictionary contracts", () => {
  it("normalizes supported locales and source filters", () => {
    expect(dictionaryLocaleSchema.parse(" ru ")).toBe("ru");
    expect(dictionaryEntrySourceSchema.parse("modified")).toBe("modified");
  });

  it("parses category list queries", () => {
    expect(listDictionaryCategoriesQuerySchema.parse({ locale: "ru" })).toEqual({
      locale: "ru"
    });
  });

  it("parses entry list queries with optional filters", () => {
    expect(
      dictionaryEntriesQuerySchema.parse({
        locale: "ru",
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        source: "custom",
        search: "  солнце  ",
        limit: "20",
        offset: "40"
      })
    ).toEqual({
      locale: "ru",
      categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
      source: "custom",
      search: "солнце",
      limit: 20,
      offset: 40
    });
  });

  it("defaults entry list pagination and all source filter", () => {
    expect(dictionaryEntriesQuerySchema.parse({ locale: "en" })).toMatchObject({
      locale: "en",
      source: "all",
      limit: 50,
      offset: 0
    });
  });

  it("parses dictionary route params", () => {
    expect(
      dictionaryPlatformEntryIdParamSchema.parse({
        platformEntryId: "8e14390f-3db1-4d1c-9344-55679c778427"
      })
    ).toEqual({
      platformEntryId: "8e14390f-3db1-4d1c-9344-55679c778427"
    });
    expect(
      dictionaryAstrologerEntryIdParamSchema.parse({
        entryId: "27f4dd55-1da2-4e58-90a1-ce10c2566b36"
      })
    ).toEqual({
      entryId: "27f4dd55-1da2-4e58-90a1-ce10c2566b36"
    });
  });

  it("rejects unsupported locales, sources and excessive pagination", () => {
    expect(() => listDictionaryCategoriesQuerySchema.parse({ locale: "de" })).toThrow();
    expect(() => dictionaryEntriesQuerySchema.parse({ locale: "ru", source: "external" })).toThrow();
    expect(() => dictionaryEntriesQuerySchema.parse({ locale: "ru", limit: "501" })).toThrow();
    expect(() =>
      dictionaryPlatformEntryIdParamSchema.parse({ platformEntryId: "not-a-uuid" })
    ).toThrow();
    expect(() => dictionaryAstrologerEntryIdParamSchema.parse({ entryId: "not-a-uuid" })).toThrow();
    expect(() =>
      dictionaryEntriesQuerySchema.parse({ locale: "ru", search: "x".repeat(201) })
    ).toThrow();
    expect(() =>
      createDictionaryCustomEntryRequestSchema.parse({
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        locale: "ru",
        title: "x".repeat(dictionaryTitleMaxLength + 1),
        content: "Content"
      })
    ).toThrow();
    expect(() =>
      updateDictionaryPlatformEntryOverrideRequestSchema.parse({
        title: "Title",
        content: "x".repeat(dictionaryContentMaxLength + 1)
      })
    ).toThrow();
  });

  it("parses custom entry and override requests", () => {
    expect(
      createDictionaryCustomEntryRequestSchema.parse({
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        locale: "ru",
        title: "  Авторская трактовка  ",
        content: "  Текст трактовки  "
      })
    ).toEqual({
      categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
      locale: "ru",
      title: "Авторская трактовка",
      content: "Текст трактовки"
    });

    expect(
      updateDictionaryPlatformEntryOverrideRequestSchema.parse({
        title: "  Солнце в Овне  ",
        content: "  Новая трактовка  "
      })
    ).toEqual({
      title: "Солнце в Овне",
      content: "Новая трактовка"
    });
  });

  it("parses custom entry update requests", () => {
    expect(
      updateDictionaryCustomEntryRequestSchema.parse({
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        title: "  Венера в Близнецах  ",
        content: "  Авторская редакция  "
      })
    ).toEqual({
      categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
      title: "Венера в Близнецах",
      content: "Авторская редакция"
    });
  });

  it("parses source counts", () => {
    expect(
      dictionarySourceCountsSchema.parse({
        all: 14,
        platform: 14,
        modified: 0,
        custom: 0
      })
    ).toEqual({
      all: 14,
      platform: 14,
      modified: 0,
      custom: 0
    });
  });
});
