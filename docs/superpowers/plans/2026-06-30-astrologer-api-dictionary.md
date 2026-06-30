# Astrologer API Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the astrology dictionary backend through `apps/astrologer-api` so `astrologer-web` can render categories, effective entries, source counts, and mutations for custom entries and platform overrides.

**Architecture:** Keep business behavior in `packages/domain`, persistence in `packages/db`, shared HTTP contracts in `packages/contracts`, and Nest composition in `apps/astrologer-api/src/modules/dictionary`. The API uses authenticated astrologer session context for `ownerUserId`; state-changing routes use the existing CSRF route policy. Category counts are returned by the categories endpoint; source counts are returned by the entries endpoint.

**Tech Stack:** TypeScript, Nest.js feature modules, Zod contracts via `@elevenhouse/validation`, domain use cases, Drizzle/PostgreSQL adapter, Vitest, Nest testing utilities.

---

## File Structure

- Create `packages/contracts/src/dictionary.ts`: Zod schemas and exported types for dictionary API requests/responses.
- Modify `packages/contracts/src/index.ts`: export dictionary contracts.
- Modify `packages/contracts/src/index.test.ts`: assert dictionary contracts are exported.
- Create `packages/contracts/src/dictionary.test.ts`: contract normalization and validation tests.
- Modify `packages/domain/src/dictionary/dictionary-types.ts`: add category list result and source counts types.
- Modify `packages/domain/src/dictionary/dictionary-store.ts`: make `listCategories` owner/locale aware and add counts to `listEntries` result.
- Modify `packages/domain/src/dictionary/dictionary-use-cases.ts`: normalize `ownerUserId` and `locale` for category listing.
- Modify `packages/domain/src/dictionary/index.test.ts`: update expected store calls and source counts.
- Modify `packages/db/src/adapters/dictionary/drizzle-dictionary-store.ts`: implement category counts and source counts.
- Modify `packages/db/src/adapters/dictionary/drizzle-dictionary-store.integration.ts`: verify category counts and source counts against PostgreSQL.
- Create `apps/astrologer-api/src/modules/dictionary/dictionary.tokens.ts`: injection token for `DictionaryStore`.
- Create `apps/astrologer-api/src/modules/dictionary/dictionary.service.ts`: parse contracts, call domain use cases, generate custom codes, map domain/store errors to HTTP errors.
- Create `apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts`: authenticated routes for categories, entries, custom entries, overrides, delete/reset.
- Create `apps/astrologer-api/src/modules/dictionary/dictionary.module.ts`: module-local wiring from `PostgresRuntimeService` to `createDrizzleDictionaryStore`.
- Create `apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts`: service-level contract/use-case tests with in-memory store.
- Create `apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts`: HTTP route/auth/CSRF behavior with provider overrides.
- Modify `apps/astrologer-api/src/app.module.ts`: import `DictionaryModule`.

---

### Task 1: Add Shared Dictionary API Contracts

**Files:**
- Create: `packages/contracts/src/dictionary.ts`
- Create: `packages/contracts/src/dictionary.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add `packages/contracts/src/dictionary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createDictionaryCustomEntryRequestSchema,
  dictionaryEntriesQuerySchema,
  dictionaryEntrySourceSchema,
  dictionaryLocaleSchema,
  dictionarySourceCountsSchema,
  listDictionaryCategoriesQuerySchema,
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

  it("rejects unsupported locales, sources and excessive pagination", () => {
    expect(() => listDictionaryCategoriesQuerySchema.parse({ locale: "de" })).toThrow();
    expect(() => dictionaryEntriesQuerySchema.parse({ locale: "ru", source: "external" })).toThrow();
    expect(() => dictionaryEntriesQuerySchema.parse({ locale: "ru", limit: "501" })).toThrow();
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
```

Update `packages/contracts/src/index.test.ts`:

```ts
import {
  dictionaryEntriesResponseSchema,
  dictionaryCategoriesResponseSchema
} from "./index";

expect(dictionaryEntriesResponseSchema.parse).toBeTypeOf("function");
expect(dictionaryCategoriesResponseSchema.parse).toBeTypeOf("function");
```

- [ ] **Step 2: Run contract tests and verify RED**

Run:

```bash
pnpm test packages/contracts/src/dictionary.test.ts packages/contracts/src/index.test.ts
```

Expected: FAIL because dictionary contract exports do not exist yet.

- [ ] **Step 3: Implement dictionary contracts**

Create `packages/contracts/src/dictionary.ts` with schemas for:

```ts
import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

export const dictionaryLocaleSchema = z.string().trim().pipe(z.enum(["ru", "en"]));
export const dictionaryEntrySourceSchema = z.enum(["platform", "modified", "custom"]);
export const dictionaryEntrySourceFilterSchema = z.union([
  z.literal("all"),
  dictionaryEntrySourceSchema
]);

const uuidSchema = z.string().uuid();
const optionalNonEmptyStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();
const paginationNumberSchema = z.coerce.number().int().min(0);

export const listDictionaryCategoriesQuerySchema = z
  .object({
    locale: dictionaryLocaleSchema
  })
  .strict();
export type ListDictionaryCategoriesQuery = z.infer<
  typeof listDictionaryCategoriesQuerySchema
>;

export const dictionaryEntriesQuerySchema = z
  .object({
    locale: dictionaryLocaleSchema,
    categoryId: uuidSchema.optional(),
    source: dictionaryEntrySourceFilterSchema.default("all"),
    search: optionalNonEmptyStringSchema,
    limit: paginationNumberSchema.min(1).max(500).default(50),
    offset: paginationNumberSchema.default(0)
  })
  .strict();
export type DictionaryEntriesQuery = z.infer<typeof dictionaryEntriesQuerySchema>;

export const dictionarySourceCountsSchema = z.object({
  all: z.number().int().min(0),
  platform: z.number().int().min(0),
  modified: z.number().int().min(0),
  custom: z.number().int().min(0)
});
export type DictionarySourceCounts = z.infer<typeof dictionarySourceCountsSchema>;

export const dictionaryCategoryResponseSchema = z.object({
  id: uuidSchema,
  code: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  order: z.number().int(),
  count: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const dictionaryCategoriesResponseSchema = z.object({
  categories: z.array(dictionaryCategoryResponseSchema),
  total: z.number().int().min(0)
});
export type DictionaryCategoriesResponse = z.infer<
  typeof dictionaryCategoriesResponseSchema
>;

export const dictionaryEffectiveEntryResponseSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema,
  categoryCode: nonEmptyStringSchema,
  code: nonEmptyStringSchema,
  locale: dictionaryLocaleSchema,
  source: dictionaryEntrySourceSchema,
  title: nonEmptyStringSchema,
  content: nonEmptyStringSchema,
  platformEntryId: uuidSchema.optional(),
  astrologerEntryId: uuidSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const dictionaryEntriesResponseSchema = z.object({
  entries: z.array(dictionaryEffectiveEntryResponseSchema),
  total: z.number().int().min(0),
  counts: z.object({
    sources: dictionarySourceCountsSchema
  })
});
export type DictionaryEntriesResponse = z.infer<typeof dictionaryEntriesResponseSchema>;

export const dictionaryAstrologerEntryResponseSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  platformEntryId: uuidSchema.optional(),
  categoryId: uuidSchema,
  code: nonEmptyStringSchema,
  locale: dictionaryLocaleSchema,
  entryType: z.enum(["override", "custom"]),
  title: nonEmptyStringSchema,
  content: nonEmptyStringSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type DictionaryAstrologerEntryResponse = z.infer<
  typeof dictionaryAstrologerEntryResponseSchema
>;

export const createDictionaryCustomEntryRequestSchema = z
  .object({
    categoryId: uuidSchema,
    locale: dictionaryLocaleSchema,
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema
  })
  .strict();
export type CreateDictionaryCustomEntryRequest = z.infer<
  typeof createDictionaryCustomEntryRequestSchema
>;

export const updateDictionaryPlatformEntryOverrideRequestSchema = z
  .object({
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema
  })
  .strict();
export type UpdateDictionaryPlatformEntryOverrideRequest = z.infer<
  typeof updateDictionaryPlatformEntryOverrideRequestSchema
>;
```

Update `packages/contracts/src/index.ts`:

```ts
export * from "./dictionary";
```

- [ ] **Step 4: Run contract tests and verify GREEN**

Run:

```bash
pnpm test packages/contracts/src/dictionary.test.ts packages/contracts/src/index.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/contracts build
```

Expected: all commands pass.

- [ ] **Step 5: Commit contracts**

```bash
git add packages/contracts/src/dictionary.ts packages/contracts/src/dictionary.test.ts packages/contracts/src/index.ts packages/contracts/src/index.test.ts
git commit -m "Add dictionary API contracts"
```

---

### Task 2: Add Domain Counts for Categories and Entry Sources

**Files:**
- Modify: `packages/domain/src/dictionary/dictionary-types.ts`
- Modify: `packages/domain/src/dictionary/dictionary-store.ts`
- Modify: `packages/domain/src/dictionary/dictionary-use-cases.ts`
- Modify: `packages/domain/src/dictionary/index.test.ts`

- [ ] **Step 1: Write failing domain tests**

Update `packages/domain/src/dictionary/index.test.ts` so the fake store returns:

```ts
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
}))
```

Change category use-case test call to:

```ts
await listDictionaryCategories({
  store,
  ownerUserId: " user_astrologer ",
  locale: " ru "
});

expect(store.listCategories).toHaveBeenCalledWith({
  ownerUserId: "user_astrologer",
  locale: "ru"
});
```

- [ ] **Step 2: Run domain test and verify RED**

Run:

```bash
pnpm test packages/domain/src/dictionary/index.test.ts
```

Expected: FAIL because `listDictionaryCategories` does not accept owner/locale yet and result types lack counts.

- [ ] **Step 3: Implement domain types and use-case normalization**

Add to `dictionary-types.ts`:

```ts
export type DictionaryCategoryWithCount = DictionaryCategory & {
  readonly count: number;
};

export type DictionaryCategoryListResult = {
  readonly categories: readonly DictionaryCategoryWithCount[];
  readonly total: number;
};

export type DictionarySourceCounts = {
  readonly all: number;
  readonly platform: number;
  readonly modified: number;
  readonly custom: number;
};
```

Change `DictionaryEntryListResult`:

```ts
export type DictionaryEntryListResult = {
  readonly entries: readonly DictionaryEffectiveEntry[];
  readonly total: number;
  readonly counts: {
    readonly sources: DictionarySourceCounts;
  };
};
```

Change `DictionaryStore`:

```ts
export type DictionaryCategoryListQuery = {
  readonly ownerUserId: string;
  readonly locale: DictionaryLocale;
};

readonly listCategories: (
  query: DictionaryCategoryListQuery
) => Promise<DictionaryCategoryListResult>;
```

Change `listDictionaryCategories`:

```ts
export function listDictionaryCategories(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly locale: string;
}): Promise<DictionaryCategoryListResult> {
  return input.store.listCategories({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    locale: normalizeDictionaryLocale(input.locale)
  });
}
```

- [ ] **Step 4: Run domain verification**

Run:

```bash
pnpm test packages/domain/src/dictionary
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/domain build
```

Expected: all commands pass.

- [ ] **Step 5: Commit domain counts**

```bash
git add packages/domain/src/dictionary
git commit -m "Add dictionary count contracts"
```

---

### Task 3: Implement Counts in the Drizzle Dictionary Store

**Files:**
- Modify: `packages/db/src/adapters/dictionary/drizzle-dictionary-store.ts`
- Modify: `packages/db/src/adapters/dictionary/drizzle-dictionary-store.integration.ts`

- [ ] **Step 1: Write failing adapter integration expectations**

In `drizzle-dictionary-store.integration.ts`, assert initial category result:

```ts
await expect(
  listDictionaryCategories({
    store,
    ownerUserId,
    locale: "ru"
  })
).resolves.toMatchObject({
  total: 2,
  categories: expect.arrayContaining([
    expect.objectContaining({
      id: category.id,
      count: 2
    })
  ])
});
```

After creating one override and one custom entry, assert:

```ts
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
  counts: {
    sources: {
      all: 3,
      platform: 1,
      modified: 1,
      custom: 1
    }
  }
});
```

For the `source: "modified"` query, assert `total: 1` but the same source counts.

- [ ] **Step 2: Run adapter integration and verify RED**

Run:

```bash
INTEGRATION_DATABASE_URL=postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse pnpm test:integration packages/db/src/adapters/dictionary/drizzle-dictionary-store.integration.ts
```

Expected: FAIL because adapter does not return category or source counts yet.

- [ ] **Step 3: Implement `listCategories` counts**

Replace adapter `listCategories` with a query that builds effective rows for the owner/locale and groups by category:

```ts
listCategories: (query) => listCategories(database, query),
```

Add `listCategories` helper:

```ts
async function listCategories(
  database: ElevenHouseDatabase,
  query: DictionaryCategoryListQuery
): Promise<DictionaryCategoryListResult> {
  const result = await database.execute(sql<DictionaryCategoryRow>`
    with effective_entries as (
      select platform_entries.category_id as "categoryId"
      from ${dictionaryPlatformEntries} as platform_entries
      left join ${dictionaryAstrologerEntries} as overrides
        on overrides.owner_user_id = ${query.ownerUserId}
        and overrides.platform_entry_id = platform_entries.id
        and overrides.locale = platform_entries.locale
        and overrides.entry_type = 'override'
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
      coalesce(sum(counts.count) over(), 0)::int as total
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
```

- [ ] **Step 4: Implement source counts in `listEntries`**

Split source filtering from count filtering:

```ts
const sourceFilter = query.source === "all" ? sql`` : sql`and source = ${query.source}`;

const rowsResult = await database.execute(sql<DictionaryEffectiveEntryRow>`...`);
const countsResult = await database.execute(sql<DictionarySourceCountRow>`
  with effective_entries as (...)
  select source, count(*)::int as count
  from effective_entries
  where true
    ${searchFilter}
  group by source
`);

return {
  entries: rows.map(toDictionaryEffectiveEntry),
  total: Number(rows[0]?.total ?? 0),
  counts: {
    sources: toDictionarySourceCounts(countsResult.rows)
  }
};
```

The source-count query must apply locale, category and search filters, but must not apply `query.source`.

- [ ] **Step 5: Run adapter verification**

Run:

```bash
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/db build
INTEGRATION_DATABASE_URL=postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse pnpm test:integration packages/db/src/adapters/dictionary/drizzle-dictionary-store.integration.ts
```

Expected: all commands pass.

- [ ] **Step 6: Commit DB counts**

```bash
git add packages/db/src/adapters/dictionary/drizzle-dictionary-store.ts packages/db/src/adapters/dictionary/drizzle-dictionary-store.integration.ts
git commit -m "Add dictionary effective counts"
```

---

### Task 4: Add Astrologer API Dictionary Module

**Files:**
- Create: `apps/astrologer-api/src/modules/dictionary/dictionary.tokens.ts`
- Create: `apps/astrologer-api/src/modules/dictionary/dictionary.service.ts`
- Create: `apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts`
- Create: `apps/astrologer-api/src/modules/dictionary/dictionary.module.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

- [ ] **Step 1: Write failing module/controller tests**

Create `apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts` with an in-memory `DictionaryStore` and assertions for:

```ts
await service.listCategories({ locale: " ru " }, authenticatedRequest);
await service.listEntries({ locale: "ru", source: "custom" }, authenticatedRequest);
await service.createCustomEntry({ categoryId, locale: "ru", title, content }, authenticatedRequest);
await service.overridePlatformEntry(platformEntryId, { title, content }, authenticatedRequest);
await service.deleteEntry(entryId, authenticatedRequest);
await service.resetPlatformEntryOverride(platformEntryId, authenticatedRequest);
```

Expected store calls must use `authenticatedRequest.currentAstrologerAccount.account.id`.

- [ ] **Step 2: Run service test and verify RED**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement module tokens**

Create `dictionary.tokens.ts`:

```ts
export const DICTIONARY_STORE = Symbol("DICTIONARY_STORE");
```

- [ ] **Step 4: Implement service**

Create `dictionary.service.ts`:

```ts
import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  createDictionaryCustomEntry,
  deleteDictionaryAstrologerEntry,
  listDictionaryCategories,
  listDictionaryEntries,
  overrideDictionaryPlatformEntry,
  resetDictionaryPlatformEntryOverride,
  type DictionaryStore
} from "@elevenhouse/domain";
import {
  createDictionaryCustomEntryRequestSchema,
  dictionaryEntriesQuerySchema,
  listDictionaryCategoriesQuerySchema,
  updateDictionaryPlatformEntryOverrideRequestSchema,
  type CreateDictionaryCustomEntryRequest,
  type DictionaryEntriesQuery,
  type ListDictionaryCategoriesQuery,
  type UpdateDictionaryPlatformEntryOverrideRequest
} from "@elevenhouse/contracts";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { DICTIONARY_STORE } from "./dictionary.tokens";

@Injectable()
export class DictionaryService {
  constructor(@Inject(DICTIONARY_STORE) private readonly store: DictionaryStore) {}

  listCategories(query: unknown, request: AstrologerSessionRequest) {
    const parsedQuery = parseContract(listDictionaryCategoriesQuerySchema, query);
    return listDictionaryCategories({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      locale: parsedQuery.locale
    });
  }

  listEntries(query: unknown, request: AstrologerSessionRequest) {
    const parsedQuery = parseContract(dictionaryEntriesQuerySchema, query);
    return listDictionaryEntries({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      locale: parsedQuery.locale,
      categoryId: parsedQuery.categoryId,
      source: parsedQuery.source,
      search: parsedQuery.search,
      limit: parsedQuery.limit,
      offset: parsedQuery.offset
    });
  }

  createCustomEntry(body: unknown, request: AstrologerSessionRequest) {
    const parsedBody = parseContract(createDictionaryCustomEntryRequestSchema, body);
    return createDictionaryCustomEntry({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      categoryId: parsedBody.categoryId,
      code: `custom_${randomUUID()}`,
      locale: parsedBody.locale,
      title: parsedBody.title,
      content: parsedBody.content,
      now: new Date()
    });
  }

  overridePlatformEntry(
    platformEntryId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ) {
    const parsedBody = parseContract(updateDictionaryPlatformEntryOverrideRequestSchema, body);
    return overrideDictionaryPlatformEntry({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      platformEntryId,
      title: parsedBody.title,
      content: parsedBody.content,
      now: new Date()
    });
  }

  deleteEntry(entryId: string, request: AstrologerSessionRequest) {
    return deleteDictionaryAstrologerEntry({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      entryId
    });
  }

  resetPlatformEntryOverride(platformEntryId: string, request: AstrologerSessionRequest) {
    return resetDictionaryPlatformEntryOverride({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      platformEntryId
    });
  }
}
```

The implementation must include local helpers:

```ts
function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }
  return ownerUserId;
}

function parseContract<TSchema extends { safeParse: (value: unknown) => { success: boolean; data?: unknown } }>(
  schema: TSchema,
  value: unknown
) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid dictionary request");
  }
  return result.data as never;
}
```

Use precise generic typing when implementing so no `never` escapes public method signatures.

- [ ] **Step 5: Implement controller**

Create `dictionary.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { DictionaryService } from "./dictionary.service";

@Controller("dictionary")
@UseGuards(AstrologerSessionAuthGuard)
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get("categories")
  listCategories(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.dictionaryService.listCategories(query, request);
  }

  @Get("entries")
  listEntries(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.dictionaryService.listEntries(query, request);
  }

  @Post("custom-entries")
  @RequireCsrf()
  createCustomEntry(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.dictionaryService.createCustomEntry(body, request);
  }

  @Put("platform-entries/:platformEntryId/override")
  @RequireCsrf()
  overridePlatformEntry(
    @Param("platformEntryId") platformEntryId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.dictionaryService.overridePlatformEntry(platformEntryId, body, request);
  }

  @Delete("entries/:entryId")
  @HttpCode(204)
  @RequireCsrf()
  deleteEntry(@Param("entryId") entryId: string, @Req() request: AstrologerSessionRequest) {
    return this.dictionaryService.deleteEntry(entryId, request);
  }

  @Delete("platform-entries/:platformEntryId/override")
  @HttpCode(204)
  @RequireCsrf()
  resetPlatformEntryOverride(
    @Param("platformEntryId") platformEntryId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.dictionaryService.resetPlatformEntryOverride(platformEntryId, request);
  }
}
```

- [ ] **Step 6: Implement module wiring**

Create `dictionary.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { createDrizzleDictionaryStore } from "@elevenhouse/db/dictionary";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { SecurityModule } from "../security/security.module";
import { DictionaryController } from "./dictionary.controller";
import { DictionaryService } from "./dictionary.service";
import { DICTIONARY_STORE } from "./dictionary.tokens";

@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [DictionaryController],
  providers: [
    DictionaryService,
    {
      provide: DICTIONARY_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleDictionaryStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class DictionaryModule {}
```

Update `apps/astrologer-api/src/app.module.ts` imports:

```ts
import { DictionaryModule } from "./modules/dictionary/dictionary.module";
```

and add `DictionaryModule` to `imports`.

- [ ] **Step 7: Run module verification**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: pass.

- [ ] **Step 8: Commit API module**

```bash
git add apps/astrologer-api/src/modules/dictionary apps/astrologer-api/src/app.module.ts
git commit -m "Add astrologer dictionary API module"
```

---

### Task 5: Add HTTP E2E Coverage for Dictionary Routes

**Files:**
- Create: `apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts`

- [ ] **Step 1: Write e2e test**

Create an e2e test that imports `DictionaryModule`, overrides `DICTIONARY_STORE`, `AUTH_SESSION_AUTHENTICATION_STORE`, `ConfigService`, and CSRF config the same way identity e2e tests do. It must verify:

```ts
GET /dictionary/categories?locale=ru -> 200 with categories and total
GET /dictionary/entries?locale=ru&source=custom -> 200 with entries, total, counts.sources
POST /dictionary/custom-entries without CSRF -> 401
POST /dictionary/custom-entries with valid session + CSRF -> 201
PUT /dictionary/platform-entries/:id/override with valid session + CSRF -> 200
DELETE /dictionary/entries/:id with valid session + CSRF -> 204
DELETE /dictionary/platform-entries/:id/override with valid session + CSRF -> 204
```

The fake auth store should resolve the session cookie to an active account with the astrologer role. The fake dictionary store should capture owner IDs and return deterministic fixtures.

- [ ] **Step 2: Run e2e test and verify RED if route wiring is incomplete**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts
```

Expected before final fixes: fail on any missing route/security wiring.

- [ ] **Step 3: Fix route/security wiring**

Apply the minimal changes required by the e2e failures. Keep controllers thin and route behavior delegated to `DictionaryService`.

- [ ] **Step 4: Run e2e and app verification**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts
pnpm test apps/astrologer-api/src
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-api build
```

Expected: all commands pass.

- [ ] **Step 5: Commit e2e coverage**

```bash
git add apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts apps/astrologer-api/src/modules/dictionary apps/astrologer-api/src/app.module.ts
git commit -m "Cover dictionary API routes"
```

---

### Task 6: Final Verification

**Files:**
- Verify all files touched by Tasks 1-5.

- [ ] **Step 1: Run full scoped verification**

Run:

```bash
pnpm test packages/contracts/src packages/domain/src/dictionary packages/db/src apps/astrologer-api/src
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/contracts build
pnpm --filter @elevenhouse/domain build
pnpm --filter @elevenhouse/db build
pnpm --filter @elevenhouse/astrologer-api build
pnpm exec eslint packages/contracts/src/**/*.ts packages/domain/src/dictionary/**/*.ts packages/db/src/adapters/dictionary/**/*.ts apps/astrologer-api/src/modules/dictionary/**/*.ts apps/astrologer-api/src/app.module.ts
INTEGRATION_DATABASE_URL=postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse pnpm test:integration packages/db/src/adapters/dictionary/drizzle-dictionary-store.integration.ts
```

Expected: all commands pass.

- [ ] **Step 2: Check git status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean tree after final commit; recent commits correspond to dictionary contracts, counts, API module, e2e coverage.

---

## Self-Review

- Spec coverage: the plan covers separate category and entry endpoints, source counts on entries, category counts on categories, authenticated owner scoping, CSRF on state-changing routes, contracts, module wiring, and tests.
- Placeholder scan: no TBD/TODO placeholders remain. Task 5 allows failure-driven fixes but names the exact route/security behavior to fix.
- Type consistency: request/response names use `Dictionary*` contract names, domain uses `DictionaryStore`, Nest uses `DictionaryService`, and DI uses `DICTIONARY_STORE`.
- Scope check: this plan intentionally stops at backend API. It does not implement `astrologer-web` integration.

