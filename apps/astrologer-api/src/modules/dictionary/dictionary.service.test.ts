import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  DictionaryCategoryNotFoundError,
  DictionaryPlatformEntryNotFoundError,
  type DictionaryStore
} from "@elevenhouse/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import type { SystemClock } from "../clock/system-clock.service";
import { DictionaryService } from "./dictionary.service";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const categoryId = "27f4dd55-1da2-4e58-90a1-ce10c2566b36";
const platformEntryId = "73cb0e88-e485-4ca2-94de-8c734047f268";
const astrologerEntryId = "6fd8c491-0292-4921-8fb3-e4ca3b9cb073";
const now = new Date("2026-06-30T10:00:00.000Z");

describe("DictionaryService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists categories for the authenticated astrologer and locale", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(
      service.listCategories({ locale: " ru " }, createAuthenticatedRequest())
    ).resolves.toMatchObject({
      total: 4,
      categories: [expect.objectContaining({ id: categoryId, count: 4 })]
    });

    expect(store.listCategories).toHaveBeenCalledWith({
      ownerUserId,
      locale: "ru"
    });
  });

  it("lists entries for the authenticated astrologer with normalized filters", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(
      service.listEntries(
        {
          locale: "ru",
          categoryId,
          source: "custom",
          search: "  солнце  ",
          limit: "20",
          offset: "40"
        },
        createAuthenticatedRequest()
      )
    ).resolves.toMatchObject({
      total: 1,
      counts: {
        sources: {
          all: 4,
          platform: 2,
          modified: 1,
          custom: 1
        }
      }
    });

    expect(store.listEntries).toHaveBeenCalledWith({
      ownerUserId,
      locale: "ru",
      categoryId,
      source: "custom",
      search: "солнце",
      limit: 20,
      offset: 40
    });
  });

  it("creates a custom entry for the authenticated astrologer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const store = createStore();
    const service = createService(store);

    await service.createCustomEntry(
      {
        categoryId,
        locale: "ru",
        title: "  Авторская трактовка  ",
        content: "  Текст трактовки  "
      },
      createAuthenticatedRequest()
    );

    expect(store.createCustomEntry).toHaveBeenCalledWith({
      ownerUserId,
      categoryId,
      code: expect.stringMatching(/^custom_[0-9a-f-]{36}$/),
      locale: "ru",
      entryType: "custom",
      title: "Авторская трактовка",
      content: "Текст трактовки",
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    });
  });

  it("upserts a platform override for the authenticated astrologer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const store = createStore();
    const service = createService(store);

    await service.overridePlatformEntry(
      platformEntryId,
      {
        title: "  Солнце в Овне  ",
        content: "  Новая трактовка  "
      },
      createAuthenticatedRequest()
    );

    expect(store.upsertPlatformEntryOverride).toHaveBeenCalledWith({
      ownerUserId,
      platformEntryId,
      title: "Солнце в Овне",
      content: "Новая трактовка",
      updatedAt: "2026-06-30T10:00:00.000Z"
    });
  });

  it("deletes custom entries and resets overrides for the authenticated astrologer", async () => {
    const store = createStore();
    const service = createService(store);

    await service.deleteEntry(astrologerEntryId, createAuthenticatedRequest());
    await service.resetPlatformEntryOverride(platformEntryId, createAuthenticatedRequest());

    expect(store.deleteAstrologerEntry).toHaveBeenCalledWith({
      ownerUserId,
      entryId: astrologerEntryId
    });
    expect(store.resetPlatformEntryOverride).toHaveBeenCalledWith({
      ownerUserId,
      platformEntryId
    });
  });

  it("rejects invalid requests and missing authenticated account context", async () => {
    const service = createService(createStore());

    expect(() => service.listEntries({ locale: "de" }, createAuthenticatedRequest())).toThrow(
      BadRequestException
    );
    expect(() =>
      service.overridePlatformEntry(
        "not-a-uuid",
        { title: "Title", content: "Content" },
        createAuthenticatedRequest()
      )
    ).toThrow(BadRequestException);
    expect(() => service.deleteEntry("not-a-uuid", createAuthenticatedRequest())).toThrow(
      BadRequestException
    );
    expect(() =>
      service.resetPlatformEntryOverride("not-a-uuid", createAuthenticatedRequest())
    ).toThrow(BadRequestException);
    await expect(service.listCategories({ locale: "ru" }, { headers: {} })).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("maps typed dictionary domain errors to HTTP errors", async () => {
    const platformStore = createStore({
      upsertPlatformEntryOverride: vi.fn(async () => {
        throw new DictionaryPlatformEntryNotFoundError(platformEntryId);
      })
    });
    const categoryStore = createStore({
      createCustomEntry: vi.fn(async () => {
        throw new DictionaryCategoryNotFoundError(categoryId);
      })
    });
    const platformService = createService(platformStore);
    const categoryService = createService(categoryStore);

    await expect(
      platformService.overridePlatformEntry(
        platformEntryId,
        { title: "Title", content: "Content" },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(NotFoundException);
    await expect(
      categoryService.createCustomEntry(
        { categoryId, locale: "ru", title: "Title", content: "Content" },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(NotFoundException);
  });
});

function createService(store: DictionaryStore): DictionaryService {
  return new DictionaryService(store, createClock());
}

function createClock(): SystemClock {
  return {
    now: () => now
  };
}

function createStore(overrides: Partial<DictionaryStore> = {}): DictionaryStore {
  return {
    listCategories: vi.fn(async () => ({
      categories: [
        {
          id: categoryId,
          code: "planets_in_signs",
          name: "Планеты в знаках",
          order: 10,
          count: 4,
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z"
        }
      ],
      total: 4
    })),
    listEntries: vi.fn(async () => ({
      entries: [],
      total: 1,
      counts: {
        sources: {
          all: 4,
          platform: 2,
          modified: 1,
          custom: 1
        }
      }
    })),
    createCustomEntry: vi.fn(async (input) => ({
      id: astrologerEntryId,
      ...input
    })),
    upsertPlatformEntryOverride: vi.fn(async (input) => ({
      id: astrologerEntryId,
      ownerUserId: input.ownerUserId,
      platformEntryId: input.platformEntryId,
      categoryId,
      code: "sun_aries",
      locale: "ru" as const,
      entryType: "override" as const,
      title: input.title,
      content: input.content,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt
    })),
    deleteAstrologerEntry: vi.fn(async () => undefined),
    resetPlatformEntryOverride: vi.fn(async () => undefined),
    ...overrides
  };
}

function createAuthenticatedRequest(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}
