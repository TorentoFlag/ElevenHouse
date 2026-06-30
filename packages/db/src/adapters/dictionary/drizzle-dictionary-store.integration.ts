import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDictionaryCustomEntry,
  deleteDictionaryAstrologerEntry,
  listDictionaryCategories,
  listDictionaryEntries,
  overrideDictionaryPlatformEntry,
  resetDictionaryPlatformEntryOverride
} from "@elevenhouse/domain";
import { createDrizzleDictionaryStore } from "./index";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("dictionary Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({
    DATABASE_URL: databaseUrl
  });

  const ownerUserIds: string[] = [];
  const categoryIds: string[] = [];
  const platformEntryIds: string[] = [];
  const suffix = randomUUID();

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      await runtime.pool.query("delete from dictionary_astrologer_entries where owner_user_id = any($1)", [
        ownerUserIds
      ]);
      await runtime.pool.query("delete from dictionary_platform_entries where id = any($1)", [
        platformEntryIds
      ]);
      await runtime.pool.query("delete from dictionary_categories where id = any($1)", [categoryIds]);
      await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
    } finally {
      await runtime.close();
    }
  });

  it("returns effective dictionary entries for platform, modified and custom sources", async () => {
    const store = createDrizzleDictionaryStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const category = await createCategory({
      code: `planets_in_signs_${suffix}`,
      name: "Planets in signs",
      order: -1000
    });
    const earlierCategory = await createCategory({
      code: `early_dictionary_category_${suffix}`,
      name: "Early dictionary category",
      order: -1001
    });
    categoryIds.push(category.id, earlierCategory.id);

    const categories = await listDictionaryCategories({ store });
    expect(categories.findIndex(({ id }) => id === earlierCategory.id)).toBeLessThan(
      categories.findIndex(({ id }) => id === category.id)
    );

    const platformSun = await createPlatformEntry({
      categoryId: category.id,
      code: `sun_aries_${suffix}`,
      title: "Sun in Aries",
      content: "Platform Sun content",
      status: "published"
    });
    const platformMoon = await createPlatformEntry({
      categoryId: category.id,
      code: `moon_taurus_${suffix}`,
      title: "Moon in Taurus",
      content: "Platform Moon content",
      status: "published"
    });
    const archived = await createPlatformEntry({
      categoryId: category.id,
      code: `archived_${suffix}`,
      title: "Archived",
      content: "Archived content",
      status: "archived"
    });
    platformEntryIds.push(platformSun.id, platformMoon.id, archived.id);

    await expect(
      listDictionaryEntries({
        store,
        ownerUserId,
        locale: "ru",
        categoryId: category.id,
        source: "all"
      })
    ).resolves.toMatchObject({
      total: 2,
      entries: expect.arrayContaining([
        expect.objectContaining({
          id: platformSun.id,
          platformEntryId: platformSun.id,
          categoryId: category.id,
          categoryCode: category.code,
          code: platformSun.code,
          locale: "ru",
          source: "platform",
          title: "Sun in Aries",
          content: "Platform Sun content"
        }),
        expect.objectContaining({
          id: platformMoon.id,
          platformEntryId: platformMoon.id,
          source: "platform",
          title: "Moon in Taurus",
          content: "Platform Moon content"
        })
      ])
    });

    const override = await overrideDictionaryPlatformEntry({
      store,
      ownerUserId,
      platformEntryId: platformSun.id,
      title: "Custom Sun in Aries",
      content: "Modified Sun content",
      now: new Date("2026-06-30T10:00:00.000Z")
    });
    const custom = await createDictionaryCustomEntry({
      store,
      ownerUserId,
      categoryId: category.id,
      code: `custom_${suffix}`,
      locale: "ru",
      title: "Custom note",
      content: "Custom content",
      now: new Date("2026-06-30T10:05:00.000Z")
    });

    await expect(
      listDictionaryEntries({
        store,
        ownerUserId,
        locale: "ru",
        categoryId: category.id,
        source: "all"
      })
    ).resolves.toMatchObject({
      total: 3,
      entries: expect.arrayContaining([
        expect.objectContaining({
          id: override.id,
          platformEntryId: platformSun.id,
          astrologerEntryId: override.id,
          code: platformSun.code,
          source: "modified",
          title: "Custom Sun in Aries",
          content: "Modified Sun content"
        }),
        expect.objectContaining({
          id: platformMoon.id,
          platformEntryId: platformMoon.id,
          source: "platform"
        }),
        expect.objectContaining({
          id: custom.id,
          astrologerEntryId: custom.id,
          code: custom.code,
          source: "custom",
          title: "Custom note",
          content: "Custom content"
        })
      ])
    });

    await expect(
      listDictionaryEntries({
        store,
        ownerUserId,
        locale: "ru",
        categoryId: category.id,
        source: "modified"
      })
    ).resolves.toMatchObject({
      total: 1,
      entries: [expect.objectContaining({ id: override.id, source: "modified" })]
    });

    await expect(
      listDictionaryEntries({
        store,
        ownerUserId,
        locale: "ru",
        categoryId: category.id,
        source: "all",
        search: "moon"
      })
    ).resolves.toMatchObject({
      total: 1,
      entries: [expect.objectContaining({ id: platformMoon.id })]
    });

    await resetDictionaryPlatformEntryOverride({
      store,
      ownerUserId,
      platformEntryId: platformSun.id
    });
    await deleteDictionaryAstrologerEntry({
      store,
      ownerUserId,
      entryId: custom.id
    });

    await expect(countAstrologerEntries(ownerUserId)).resolves.toBe(0);

    await expect(
      listDictionaryEntries({
        store,
        ownerUserId,
        locale: "ru",
        categoryId: category.id,
        source: "all"
      })
    ).resolves.toMatchObject({
      total: 2,
      entries: expect.arrayContaining([
        expect.objectContaining({
          id: platformSun.id,
          platformEntryId: platformSun.id,
          source: "platform",
          title: "Sun in Aries",
          content: "Platform Sun content"
        }),
        expect.objectContaining({
          id: platformMoon.id,
          source: "platform"
        })
      ])
    });
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );

    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }

  async function createCategory(input: {
    readonly code: string;
    readonly name: string;
    readonly order: number;
  }): Promise<{ readonly id: string; readonly code: string }> {
    const result = await runtime.pool.query<{ id: string; code: string }>(
      `insert into dictionary_categories (code, name, "order")
       values ($1, $2, $3)
       returning id, code`,
      [input.code, input.name, input.order]
    );

    return result.rows[0] ?? raise("Expected category insert to return row");
  }

  async function createPlatformEntry(input: {
    readonly categoryId: string;
    readonly code: string;
    readonly title: string;
    readonly content: string;
    readonly status: "published" | "archived";
  }): Promise<{
    readonly id: string;
    readonly code: string;
    readonly title: string;
    readonly content: string;
  }> {
    const result = await runtime.pool.query<{
      id: string;
      code: string;
      title: string;
      content: string;
    }>(
      `insert into dictionary_platform_entries (category_id, code, locale, title, content, status)
       values ($1, $2, 'ru', $3, $4, $5)
       returning id, code, title, content`,
      [input.categoryId, input.code, input.title, input.content, input.status]
    );

    return result.rows[0] ?? raise("Expected platform entry insert to return row");
  }

  async function countAstrologerEntries(ownerUserId: string): Promise<number> {
    const result = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from dictionary_astrologer_entries where owner_user_id = $1",
      [ownerUserId]
    );

    return Number(result.rows[0]?.count ?? 0);
  }
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "run integration tests against"
  );
}

function raise(message: string): never {
  throw new Error(message);
}
