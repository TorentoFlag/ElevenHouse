import { and, eq, sql } from "drizzle-orm";
import type {
  DictionaryAstrologerEntry,
  DictionaryCategoryListQuery,
  DictionaryCategoryListResult,
  DictionaryCategoryWithCount,
  DictionaryEntriesByCodesQuery,
  DictionaryEffectiveEntry,
  DictionaryEntryListQuery,
  DictionaryEntryListResult,
  DictionaryEntrySource,
  DictionarySourceCounts,
  DictionaryLocale,
  DictionaryStore
} from "@elevenhouse/domain";
import {
  DictionaryAstrologerEntryNotFoundError,
  DictionaryCategoryNotFoundError,
  DictionaryPlatformEntryNotFoundError
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  dictionaryAstrologerEntries,
  dictionaryCategories,
  dictionaryPlatformEntries
} from "../../schema";
import { insertReturningOne } from "../../shared";

type DictionaryAstrologerEntrySelect = typeof dictionaryAstrologerEntries.$inferSelect;
type DictionaryAstrologerEntryInsert = typeof dictionaryAstrologerEntries.$inferInsert;
type DictionaryPlatformEntrySelect = typeof dictionaryPlatformEntries.$inferSelect;

type DictionaryCategoryRow = Omit<DictionaryCategoryWithCount, "createdAt" | "updatedAt"> & {
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly total: number | string;
};

type DictionaryEffectiveEntryRow = Omit<
  DictionaryEffectiveEntry,
  "createdAt" | "updatedAt" | "platformEntryId" | "astrologerEntryId"
> & {
  readonly platformEntryId: string | null;
  readonly astrologerEntryId: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
};

type DictionarySourceCountRow = {
  readonly source: string;
  readonly count: number | string;
};

type DictionaryTotalRow = {
  readonly total: number | string;
};

const dictionaryLocaleSet = new Set<string>(["ru", "en"]);
const dictionaryEntrySourceSet = new Set<string>(["platform", "modified", "custom"]);
const dictionaryAstrologerEntryTypeSet = new Set<string>(["override", "custom"]);

export function createDrizzleDictionaryStore(database: ElevenHouseDatabase): DictionaryStore {
  return {
    listCategories: (query) => listCategories(database, query),
    listEntries: (query) => listEntries(database, query),
    listEntriesByCodes: (query) => listEntriesByCodes(database, query),
    createCustomEntry: async (input) => {
      const category = await database.query.dictionaryCategories.findFirst({
        where: eq(dictionaryCategories.id, input.categoryId)
      });
      if (!category) {
        throw new DictionaryCategoryNotFoundError(input.categoryId);
      }

      const row = await insertReturningOne(
        () =>
          database
            .insert(dictionaryAstrologerEntries)
            .values({
              ownerUserId: input.ownerUserId,
              categoryId: input.categoryId,
              code: input.code,
              locale: input.locale,
              entryType: "custom",
              title: input.title,
              content: input.content,
              createdAt: new Date(input.createdAt),
              updatedAt: new Date(input.updatedAt)
            } satisfies DictionaryAstrologerEntryInsert)
            .returning(),
        "dictionary_astrologer_entries"
      );

      return toDictionaryAstrologerEntry(row);
    },
    updateCustomEntry: async (input) => {
      const category = await database.query.dictionaryCategories.findFirst({
        where: eq(dictionaryCategories.id, input.categoryId)
      });
      if (!category) {
        throw new DictionaryCategoryNotFoundError(input.categoryId);
      }

      const rows = await database
        .update(dictionaryAstrologerEntries)
        .set({
          categoryId: input.categoryId,
          title: input.title,
          content: input.content,
          updatedAt: new Date(input.updatedAt)
        })
        .where(
          and(
            eq(dictionaryAstrologerEntries.id, input.entryId),
            eq(dictionaryAstrologerEntries.ownerUserId, input.ownerUserId),
            eq(dictionaryAstrologerEntries.entryType, "custom")
          )
        )
        .returning();

      const row = rows[0];
      if (!row) {
        throw new DictionaryAstrologerEntryNotFoundError(input.entryId);
      }

      return toDictionaryAstrologerEntry(row);
    },
    upsertPlatformEntryOverride: (input) =>
      database.transaction(async (transaction) => {
        const platformEntry = await transaction.query.dictionaryPlatformEntries.findFirst({
          where: and(
            eq(dictionaryPlatformEntries.id, input.platformEntryId),
            eq(dictionaryPlatformEntries.status, "published")
          )
        });

        if (!platformEntry) {
          throw new DictionaryPlatformEntryNotFoundError(input.platformEntryId);
        }

        const row = await insertReturningOne(
          () =>
            transaction
              .insert(dictionaryAstrologerEntries)
              .values(toOverrideInsert(input, platformEntry))
              .onConflictDoUpdate({
                target: [
                  dictionaryAstrologerEntries.ownerUserId,
                  dictionaryAstrologerEntries.platformEntryId,
                  dictionaryAstrologerEntries.locale
                ],
                targetWhere: sql`${dictionaryAstrologerEntries.entryType} = 'override'`,
                set: {
                  title: input.title,
                  content: input.content,
                  updatedAt: new Date(input.updatedAt)
                }
              })
              .returning(),
          "dictionary_astrologer_entries"
        );

        return toDictionaryAstrologerEntry(row);
      }),
    deleteAstrologerEntry: async (input) => {
      await database
        .delete(dictionaryAstrologerEntries)
        .where(
          and(
            eq(dictionaryAstrologerEntries.id, input.entryId),
            eq(dictionaryAstrologerEntries.ownerUserId, input.ownerUserId)
          )
        );
    },
    resetAstrologerEntries: async (input) => {
      await database
        .delete(dictionaryAstrologerEntries)
        .where(eq(dictionaryAstrologerEntries.ownerUserId, input.ownerUserId));
    },
    resetPlatformEntryOverride: async (input) => {
      await database
        .delete(dictionaryAstrologerEntries)
        .where(
          and(
            eq(dictionaryAstrologerEntries.ownerUserId, input.ownerUserId),
            eq(dictionaryAstrologerEntries.platformEntryId, input.platformEntryId),
            eq(dictionaryAstrologerEntries.entryType, "override")
          )
        );
    }
  };
}

async function listCategories(
  database: ElevenHouseDatabase,
  query: DictionaryCategoryListQuery
): Promise<DictionaryCategoryListResult> {
  const result = await database.execute(sql<DictionaryCategoryRow>`
    with effective_entries as (
      select platform_entries.category_id as "categoryId"
      from ${dictionaryPlatformEntries} as platform_entries
      where platform_entries.locale = ${query.locale}
        and platform_entries.status = 'published'
      union all
      select custom_entries.category_id as "categoryId"
      from ${dictionaryAstrologerEntries} as custom_entries
      where custom_entries.owner_user_id = ${query.ownerUserId}
        and custom_entries.locale = ${query.locale}
        and custom_entries.entry_type = 'custom'
    ),
    counts as (
      select "categoryId", count(*)::int as count
      from effective_entries
      group by "categoryId"
    )
    select
      categories.id,
      categories.code,
      categories.name,
      categories."order",
      categories.created_at as "createdAt",
      categories.updated_at as "updatedAt",
      coalesce(counts.count, 0)::int as count,
      coalesce((select sum(count) from counts), 0)::int as total
    from ${dictionaryCategories} as categories
    left join counts on counts."categoryId" = categories.id
    order by categories."order", categories.name, categories.id
  `);
  const rows = result.rows as unknown as readonly DictionaryCategoryRow[];

  return {
    categories: rows.map(toDictionaryCategoryWithCount),
    total: Number(rows[0]?.total ?? 0)
  };
}

async function listEntries(
  database: ElevenHouseDatabase,
  query: DictionaryEntryListQuery
): Promise<DictionaryEntryListResult> {
  const sourceFilter =
    query.source === "all" ? sql`` : sql`and source = ${query.source}`;
  const platformCategoryFilter =
    query.categoryId === undefined
      ? sql``
      : sql`and platform_entries.category_id = ${query.categoryId}`;
  const customCategoryFilter =
    query.categoryId === undefined
      ? sql``
      : sql`and custom_entries.category_id = ${query.categoryId}`;
  const searchFilter =
    query.search === undefined
      ? sql``
      : sql`and (lower(code) like ${formatSearch(query.search)} or lower(title) like ${formatSearch(
          query.search
        )} or lower(content) like ${formatSearch(query.search)})`;
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const effectiveEntriesCte = sql`
    platform_entries as (
      select
        coalesce(overrides.id, platform_entries.id) as "id",
        platform_entries.category_id as "categoryId",
        categories.code as "categoryCode",
        platform_entries.code as "code",
        platform_entries.locale as "locale",
        case
          when overrides.id is null then 'platform'
          else 'modified'
        end as "source",
        coalesce(overrides.title, platform_entries.title) as "title",
        coalesce(overrides.content, platform_entries.content) as "content",
        platform_entries.id as "platformEntryId",
        overrides.id as "astrologerEntryId",
        coalesce(overrides.created_at, platform_entries.created_at) as "createdAt",
        coalesce(overrides.updated_at, platform_entries.updated_at) as "updatedAt",
        categories."order" as "categoryOrder",
        case
          when platform_entries.code ~ '.*_[0-9]+$' then substring(platform_entries.code from '_([0-9]+)$')::int
          else null
        end as "codeOrderNumber"
      from ${dictionaryPlatformEntries} as platform_entries
      inner join ${dictionaryCategories} as categories
        on categories.id = platform_entries.category_id
      left join ${dictionaryAstrologerEntries} as overrides
        on overrides.owner_user_id = ${query.ownerUserId}
        and overrides.platform_entry_id = platform_entries.id
        and overrides.locale = platform_entries.locale
        and overrides.entry_type = 'override'
      where platform_entries.locale = ${query.locale}
        and platform_entries.status = 'published'
        ${platformCategoryFilter}
    ),
    custom_entries as (
      select
        custom_entries.id as "id",
        custom_entries.category_id as "categoryId",
        categories.code as "categoryCode",
        custom_entries.code as "code",
        custom_entries.locale as "locale",
        'custom' as "source",
        custom_entries.title as "title",
        custom_entries.content as "content",
        null::uuid as "platformEntryId",
        custom_entries.id as "astrologerEntryId",
        custom_entries.created_at as "createdAt",
        custom_entries.updated_at as "updatedAt",
        categories."order" as "categoryOrder",
        case
          when custom_entries.code ~ '.*_[0-9]+$' then substring(custom_entries.code from '_([0-9]+)$')::int
          else null
        end as "codeOrderNumber"
      from ${dictionaryAstrologerEntries} as custom_entries
      inner join ${dictionaryCategories} as categories
        on categories.id = custom_entries.category_id
      where custom_entries.owner_user_id = ${query.ownerUserId}
        and custom_entries.locale = ${query.locale}
        and custom_entries.entry_type = 'custom'
        ${customCategoryFilter}
    ),
    effective_entries as (
      select * from platform_entries
      union all
      select * from custom_entries
    )
  `;

  const result = await database.execute(sql<DictionaryEffectiveEntryRow>`
    with ${effectiveEntriesCte}
    select
      id,
      "categoryId",
      "categoryCode",
      code,
      locale,
      source,
      title,
      content,
      "platformEntryId",
      "astrologerEntryId",
      "createdAt",
      "updatedAt"
    from effective_entries
    where true
      ${sourceFilter}
      ${searchFilter}
    order by "categoryOrder", "codeOrderNumber" nulls last, title, id
    limit ${limit}
    offset ${offset}
  `);
  const rows = result.rows as unknown as readonly DictionaryEffectiveEntryRow[];
  const totalResult = await database.execute(sql<DictionaryTotalRow>`
    with ${effectiveEntriesCte}
    select count(*)::int as total
    from effective_entries
    where true
      ${sourceFilter}
      ${searchFilter}
  `);
  const countsResult = await database.execute(sql<DictionarySourceCountRow>`
    with ${effectiveEntriesCte}
    select source, count(*)::int as count
    from effective_entries
    where true
      ${searchFilter}
    group by source
  `);
  const sourceCountRows = countsResult.rows as unknown as readonly DictionarySourceCountRow[];

  return {
    entries: rows.map(toDictionaryEffectiveEntry),
    total: Number(totalResult.rows[0]?.total ?? 0),
    counts: {
      sources: toDictionarySourceCounts(sourceCountRows)
    }
  };
}

async function listEntriesByCodes(
  database: ElevenHouseDatabase,
  query: DictionaryEntriesByCodesQuery
): Promise<DictionaryEntryListResult> {
  if (query.codes.length === 0) {
    return {
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
    };
  }

  const requestedCodes = sql.join(
    query.codes.map((code, index) => sql`(${code}, ${index})`),
    sql`, `
  );
  const effectiveEntriesCte = sql`
    requested_codes(code, sort_order) as (
      values ${requestedCodes}
    ),
    platform_entries as (
      select
        coalesce(overrides.id, platform_entries.id) as "id",
        platform_entries.category_id as "categoryId",
        categories.code as "categoryCode",
        platform_entries.code as "code",
        platform_entries.locale as "locale",
        case
          when overrides.id is null then 'platform'
          else 'modified'
        end as "source",
        coalesce(overrides.title, platform_entries.title) as "title",
        coalesce(overrides.content, platform_entries.content) as "content",
        platform_entries.id as "platformEntryId",
        overrides.id as "astrologerEntryId",
        coalesce(overrides.created_at, platform_entries.created_at) as "createdAt",
        coalesce(overrides.updated_at, platform_entries.updated_at) as "updatedAt",
        requested_codes.sort_order as "sortOrder"
      from ${dictionaryPlatformEntries} as platform_entries
      inner join requested_codes
        on requested_codes.code = platform_entries.code
      inner join ${dictionaryCategories} as categories
        on categories.id = platform_entries.category_id
      left join ${dictionaryAstrologerEntries} as overrides
        on overrides.owner_user_id = ${query.ownerUserId}
        and overrides.platform_entry_id = platform_entries.id
        and overrides.locale = platform_entries.locale
        and overrides.entry_type = 'override'
      where platform_entries.locale = ${query.locale}
        and platform_entries.status = 'published'
    ),
    custom_entries as (
      select
        custom_entries.id as "id",
        custom_entries.category_id as "categoryId",
        categories.code as "categoryCode",
        custom_entries.code as "code",
        custom_entries.locale as "locale",
        'custom' as "source",
        custom_entries.title as "title",
        custom_entries.content as "content",
        null::uuid as "platformEntryId",
        custom_entries.id as "astrologerEntryId",
        custom_entries.created_at as "createdAt",
        custom_entries.updated_at as "updatedAt",
        requested_codes.sort_order as "sortOrder"
      from ${dictionaryAstrologerEntries} as custom_entries
      inner join requested_codes
        on requested_codes.code = custom_entries.code
      inner join ${dictionaryCategories} as categories
        on categories.id = custom_entries.category_id
      where custom_entries.owner_user_id = ${query.ownerUserId}
        and custom_entries.locale = ${query.locale}
        and custom_entries.entry_type = 'custom'
    ),
    effective_entries as (
      select * from platform_entries
      union all
      select * from custom_entries
    )
  `;

  const result = await database.execute(sql<DictionaryEffectiveEntryRow>`
    with ${effectiveEntriesCte}
    select
      id,
      "categoryId",
      "categoryCode",
      code,
      locale,
      source,
      title,
      content,
      "platformEntryId",
      "astrologerEntryId",
      "createdAt",
      "updatedAt"
    from effective_entries
    order by "sortOrder", title, id
  `);
  const rows = result.rows as unknown as readonly DictionaryEffectiveEntryRow[];
  const countsResult = await database.execute(sql<DictionarySourceCountRow>`
    with ${effectiveEntriesCte}
    select source, count(*)::int as count
    from effective_entries
    group by source
  `);
  const sourceCountRows = countsResult.rows as unknown as readonly DictionarySourceCountRow[];

  return {
    entries: rows.map(toDictionaryEffectiveEntry),
    total: rows.length,
    counts: {
      sources: toDictionarySourceCounts(sourceCountRows)
    }
  };
}

function toOverrideInsert(
  input: Parameters<DictionaryStore["upsertPlatformEntryOverride"]>[0],
  platformEntry: DictionaryPlatformEntrySelect
): DictionaryAstrologerEntryInsert {
  return {
    ownerUserId: input.ownerUserId,
    platformEntryId: platformEntry.id,
    categoryId: platformEntry.categoryId,
    code: platformEntry.code,
    locale: platformEntry.locale,
    entryType: "override",
    title: input.title,
    content: input.content,
    createdAt: new Date(input.updatedAt),
    updatedAt: new Date(input.updatedAt)
  };
}

function toDictionaryCategoryWithCount(row: DictionaryCategoryRow): DictionaryCategoryWithCount {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    order: row.order,
    count: Number(row.count),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toDictionaryEffectiveEntry(row: DictionaryEffectiveEntryRow): DictionaryEffectiveEntry {
  const locale = row.locale;
  if (!isDictionaryLocale(locale)) {
    throw new Error(`Unexpected dictionary locale: ${locale}`);
  }

  const source = row.source;
  if (!isDictionaryEntrySource(source)) {
    throw new Error(`Unexpected dictionary entry source: ${source}`);
  }

  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryCode: row.categoryCode,
    code: row.code,
    locale,
    source,
    title: row.title,
    content: row.content,
    ...(row.platformEntryId === null ? {} : { platformEntryId: row.platformEntryId }),
    ...(row.astrologerEntryId === null ? {} : { astrologerEntryId: row.astrologerEntryId }),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toDictionaryAstrologerEntry(
  row: DictionaryAstrologerEntrySelect
): DictionaryAstrologerEntry {
  const locale = row.locale;
  if (!isDictionaryLocale(locale)) {
    throw new Error(`Unexpected dictionary_astrologer_entries.locale value: ${locale}`);
  }

  const entryType = row.entryType;
  if (!dictionaryAstrologerEntryTypeSet.has(entryType)) {
    throw new Error(`Unexpected dictionary_astrologer_entries.entry_type value: ${entryType}`);
  }

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    ...(row.platformEntryId === null ? {} : { platformEntryId: row.platformEntryId }),
    categoryId: row.categoryId,
    code: row.code,
    locale,
    entryType: entryType as DictionaryAstrologerEntry["entryType"],
    title: row.title,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toDictionarySourceCounts(rows: readonly DictionarySourceCountRow[]): DictionarySourceCounts {
  let platform = 0;
  let modified = 0;
  let custom = 0;

  for (const row of rows) {
    const source = row.source;
    if (!isDictionaryEntrySource(source)) {
      throw new Error(`Unexpected dictionary entry source: ${source}`);
    }

    const count = Number(row.count);
    if (source === "platform") {
      platform = count;
    } else if (source === "modified") {
      modified = count;
    } else {
      custom = count;
    }
  }

  return {
    all: platform + modified + custom,
    platform,
    modified,
    custom
  };
}

function formatSearch(search: string): string {
  return `%${search.toLowerCase()}%`;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isDictionaryLocale(value: string): value is DictionaryLocale {
  return dictionaryLocaleSet.has(value);
}

function isDictionaryEntrySource(value: string): value is DictionaryEntrySource {
  return dictionaryEntrySourceSet.has(value);
}
