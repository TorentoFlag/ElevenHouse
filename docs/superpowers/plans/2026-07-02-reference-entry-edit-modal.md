# Reference Entry Edit Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full edit support to the astrologer reference entry modal, including prefilled UI and backend persistence for platform overrides and custom entries.

**Architecture:** Reuse the existing `ReferenceEntryModal` as a controlled create/edit form. Add a custom-entry update contract and domain/store/API route for custom entries; use the existing platform override route for platform and modified entries. Keep state-changing routes CSRF-protected and invalidate dictionary queries after successful mutations.

**Tech Stack:** React 19, Vite, TypeScript, TanStack Query, Nest.js, Zod contracts, Drizzle ORM, Vitest.

---

## Source Material

- Design spec: `docs/superpowers/specs/2026-07-02-reference-entry-edit-modal-design.md`
- Local architecture docs: `docs/architecture/overview.md`, `docs/architecture/repository-structure.md`, `docs/architecture/backend-modules.md`, `docs/api/api-boundaries.md`, `docs/decisions/0003-nestjs-modular-backend.md`, `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`
- Primary sources reviewed:
  - WAI-ARIA APG Modal Dialog Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  - React controlled input docs: https://react.dev/reference/react-dom/components/input
  - TanStack Query invalidations from mutations: https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
  - OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  - Drizzle update docs: https://orm.drizzle.team/docs/update

## File Map

- Modify `packages/contracts/src/dictionary.ts`: add custom update request schema/type.
- Modify `packages/contracts/src/dictionary.test.ts`: cover custom update validation.
- Modify `packages/domain/src/dictionary/dictionary-errors.ts`: add `DictionaryAstrologerEntryNotFoundError`.
- Modify `packages/domain/src/dictionary/dictionary-store.ts`: add `DictionaryCustomEntryUpdateInput` and `updateCustomEntry` store port.
- Modify `packages/domain/src/dictionary/dictionary-use-cases.ts`: add `updateDictionaryCustomEntry`.
- Modify `packages/domain/src/dictionary/index.test.ts`: cover custom update normalization.
- Modify `packages/db/src/adapters/dictionary/drizzle-dictionary-store.ts`: implement owner-scoped custom update with Drizzle `update().returning()`.
- Modify `apps/astrologer-api/src/modules/dictionary/dictionary.service.ts`: parse custom update contract, call use case, and map custom-entry not-found errors to HTTP 404.
- Modify `apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts`: add `PUT /dictionary/custom-entries/:entryId` with `@RequireCsrf()`.
- Modify `apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts`: cover service update behavior.
- Modify `apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts`: cover authenticated CSRF-protected custom update route.
- Create `apps/astrologer-web/src/features/dictionary/api/updateDictionaryCustomEntry.ts`.
- Create `apps/astrologer-web/src/features/dictionary/api/updateDictionaryPlatformEntryOverride.ts`.
- Modify `apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts`: cover both update API clients.
- Modify `apps/astrologer-web/src/features/dictionary/model/dictionaryQueryOptions.ts`: add mutation options for both updates.
- Create `apps/astrologer-web/src/features/dictionary/model/useUpdateDictionaryCustomEntryMutation.ts`.
- Create `apps/astrologer-web/src/features/dictionary/model/useUpdateDictionaryPlatformEntryOverrideMutation.ts`.
- Modify `apps/astrologer-web/src/features/dictionary/model/dictionaryQueries.test.ts`: cover mutation invalidation.
- Modify `apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.ts`: add edit draft and platform edit payload helpers.
- Modify `apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts`: cover edit initialization and update payloads.
- Modify `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`: add localized create/edit modal labels.
- Modify `apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModal.tsx`: add create/edit mode and submit routing.
- Modify `apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.tsx`: support disabled category selection for platform/modified entries.
- Modify `apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.test.tsx`: cover edit labels and disabled category chips.
- Modify `apps/astrologer-web/src/pages/reference/ReferencePage.tsx`: open modal in edit mode.
- Modify `apps/astrologer-web/src/pages/reference/ReferencePageView.test.tsx`: existing edit button test should remain green.
- Create `apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx`: cover page-level edit modal wiring with focused child-component mocks.

---

### Task 1: Contracts For Custom Entry Update

**Files:**
- Modify: `packages/contracts/src/dictionary.ts`
- Modify: `packages/contracts/src/dictionary.test.ts`

- [ ] **Step 1: Write the failing contract test**

Add `updateDictionaryCustomEntryRequestSchema` to the import list in `packages/contracts/src/dictionary.test.ts`, then add:

```ts
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
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test -- packages/contracts/src/dictionary.test.ts
```

Expected: FAIL because `updateDictionaryCustomEntryRequestSchema` is not exported.

- [ ] **Step 3: Implement the contract**

Add to `packages/contracts/src/dictionary.ts` after `CreateDictionaryCustomEntryRequest`:

```ts
export const updateDictionaryCustomEntryRequestSchema = z
  .object({
    categoryId: uuidSchema,
    title: dictionaryTitleRequestSchema,
    content: dictionaryContentRequestSchema
  })
  .strict();
export type UpdateDictionaryCustomEntryRequest = z.infer<
  typeof updateDictionaryCustomEntryRequestSchema
>;
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm test -- packages/contracts/src/dictionary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/dictionary.ts packages/contracts/src/dictionary.test.ts
git commit -m "feat: add dictionary custom update contract"
```

---

### Task 2: Domain Port And Use Case

**Files:**
- Modify: `packages/domain/src/dictionary/dictionary-errors.ts`
- Modify: `packages/domain/src/dictionary/dictionary-store.ts`
- Modify: `packages/domain/src/dictionary/dictionary-use-cases.ts`
- Modify: `packages/domain/src/dictionary/index.test.ts`

- [ ] **Step 1: Write the failing domain test**

Add `updateDictionaryCustomEntry` to the imports in `packages/domain/src/dictionary/index.test.ts`. Extend `createStore()` with an `updateCustomEntry` mock:

```ts
updateCustomEntry: vi.fn(async (input) => ({
  id: input.entryId,
  ownerUserId: input.ownerUserId,
  categoryId: input.categoryId,
  code: "custom_venus_gemini",
  locale: "ru" as const,
  entryType: "custom" as const,
  title: input.title,
  content: input.content,
  createdAt: "2026-06-30T09:00:00.000Z",
  updatedAt: input.updatedAt
})),
```

Add this test:

```ts
it("updates a normalized custom dictionary entry", async () => {
  const store = createStore();

  await updateDictionaryCustomEntry({
    store,
    ownerUserId: " user_astrologer ",
    entryId: " astrologer_entry_custom ",
    categoryId: " category_planets_signs ",
    title: "  Венера в Близнецах  ",
    content: "  Новая авторская редакция  ",
    now
  });

  expect(store.updateCustomEntry).toHaveBeenCalledWith({
    ownerUserId: "user_astrologer",
    entryId: "astrologer_entry_custom",
    categoryId: "category_planets_signs",
    title: "Венера в Близнецах",
    content: "Новая авторская редакция",
    updatedAt: "2026-06-30T10:00:00.000Z"
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test -- packages/domain/src/dictionary/index.test.ts
```

Expected: FAIL because `updateDictionaryCustomEntry` and `DictionaryStore.updateCustomEntry` do not exist.

- [ ] **Step 3: Add the store port**

Add to `packages/domain/src/dictionary/dictionary-errors.ts`:

```ts
export class DictionaryAstrologerEntryNotFoundError extends Error {
  constructor(readonly entryId: string) {
    super("Dictionary astrologer entry not found");
    this.name = "DictionaryAstrologerEntryNotFoundError";
  }
}
```

Add to `packages/domain/src/dictionary/dictionary-store.ts`:

```ts
export type DictionaryCustomEntryUpdateInput = {
  readonly ownerUserId: string;
  readonly entryId: string;
  readonly categoryId: string;
  readonly title: string;
  readonly content: string;
  readonly updatedAt: string;
};
```

Add to `DictionaryStore`:

```ts
readonly updateCustomEntry: (
  input: DictionaryCustomEntryUpdateInput
) => Promise<DictionaryAstrologerEntry>;
```

- [ ] **Step 4: Add the use case**

Add to `packages/domain/src/dictionary/dictionary-use-cases.ts` after `createDictionaryCustomEntry`:

```ts
export function updateDictionaryCustomEntry(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly entryId: string;
  readonly categoryId: string;
  readonly title: string;
  readonly content: string;
  readonly now: Date;
}): Promise<DictionaryAstrologerEntry> {
  return input.store.updateCustomEntry({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    entryId: normalizeRequiredString(input.entryId, "Dictionary astrologer entry id is required"),
    categoryId: normalizeRequiredString(input.categoryId, "Dictionary category id is required"),
    title: normalizeRequiredString(input.title, "Dictionary entry title is required"),
    content: normalizeRequiredString(input.content, "Dictionary entry content is required"),
    updatedAt: input.now.toISOString()
  });
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm test -- packages/domain/src/dictionary/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/dictionary/dictionary-errors.ts packages/domain/src/dictionary/dictionary-store.ts packages/domain/src/dictionary/dictionary-use-cases.ts packages/domain/src/dictionary/index.test.ts
git commit -m "feat: add dictionary custom update use case"
```

---

### Task 3: DB Adapter Custom Update

**Files:**
- Modify: `packages/db/src/adapters/dictionary/drizzle-dictionary-store.ts`

- [ ] **Step 1: Implement the Drizzle store method after the domain test requires it**

Import the new error:

```ts
import {
  DictionaryAstrologerEntryNotFoundError,
  DictionaryCategoryNotFoundError,
  DictionaryPlatformEntryNotFoundError
} from "@elevenhouse/domain";
```

In `createDrizzleDictionaryStore`, add `updateCustomEntry` between `createCustomEntry` and `upsertPlatformEntryOverride`:

```ts
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
```

Keep the owner and `entryType = "custom"` predicates. Do not let this endpoint update overrides.

- [ ] **Step 2: Verify typecheck**

Run:

```bash
pnpm --filter @elevenhouse/db typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/adapters/dictionary/drizzle-dictionary-store.ts
git commit -m "feat: persist dictionary custom entry edits"
```

---

### Task 4: Astrologer API Route And Service

**Files:**
- Modify: `apps/astrologer-api/src/modules/dictionary/dictionary.service.ts`
- Modify: `apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts`
- Modify: `apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts`

- [ ] **Step 1: Write the failing service test**

In `apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts`, extend `createStore()` with `updateCustomEntry` matching Task 2. Add:

```ts
it("updates a custom entry for the authenticated astrologer", async () => {
  const store = createStore();
  const service = createService(store);

  await service.updateCustomEntry(
    astrologerEntryId,
    {
      categoryId,
      title: "  Венера в Близнецах  ",
      content: "  Новая редакция  "
    },
    createAuthenticatedRequest()
  );

  expect(store.updateCustomEntry).toHaveBeenCalledWith({
    ownerUserId,
    entryId: astrologerEntryId,
    categoryId,
    title: "Венера в Близнецах",
    content: "Новая редакция",
    updatedAt: "2026-06-30T10:00:00.000Z"
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test -- apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts
```

Expected: FAIL because `DictionaryService.updateCustomEntry` does not exist.

- [ ] **Step 3: Implement service method**

Update imports in `dictionary.service.ts`:

```ts
import {
  createDictionaryCustomEntry,
  deleteDictionaryAstrologerEntry,
  listDictionaryCategories,
  listDictionaryEntries,
  overrideDictionaryPlatformEntry,
  resetDictionaryAstrologerEntries,
  resetDictionaryPlatformEntryOverride,
  updateDictionaryCustomEntry,
  DictionaryAstrologerEntryNotFoundError,
  DictionaryCategoryNotFoundError,
  DictionaryPlatformEntryNotFoundError,
  type DictionaryStore
} from "@elevenhouse/domain";
```

Update contracts import:

```ts
updateDictionaryCustomEntryRequestSchema,
updateDictionaryPlatformEntryOverrideRequestSchema
```

Then add to `DictionaryService` after `createCustomEntry`:

```ts
updateCustomEntry(
  entryId: string,
  body: unknown,
  request: AstrologerSessionRequest
): Promise<DictionaryAstrologerEntryResponse> {
  const parsedParams = parseContract(dictionaryAstrologerEntryIdParamSchema, { entryId });
  const parsedBody = parseContract(updateDictionaryCustomEntryRequestSchema, body);

  return mapDictionaryStoreErrors(async () =>
    dictionaryAstrologerEntryResponseSchema.parse(
      await updateDictionaryCustomEntry({
        store: this.store,
        ownerUserId: requireOwnerUserId(request),
        entryId: parsedParams.entryId,
        categoryId: parsedBody.categoryId,
        title: parsedBody.title,
        content: parsedBody.content,
        now: this.clock.now()
      })
    )
  );
}
```

Extend `mapDictionaryStoreErrors`:

```ts
if (error instanceof DictionaryAstrologerEntryNotFoundError) {
  throw new NotFoundException("Dictionary astrologer entry not found");
}
```

- [ ] **Step 4: Implement controller route**

In `dictionary.controller.ts`, add:

```ts
@Put("custom-entries/:entryId")
@RequireCsrf()
updateCustomEntry(
  @Param("entryId") entryId: string,
  @Body() body: unknown,
  @Req() request: AstrologerSessionRequest
): ReturnType<DictionaryService["updateCustomEntry"]> {
  return this.dictionaryService.updateCustomEntry(entryId, body, request);
}
```

- [ ] **Step 5: Write/update e2e coverage**

In `dictionary.e2e.test.ts`, add an authenticated CSRF-protected `PUT /dictionary/custom-entries/:entryId` assertion next to existing write-route tests:

```ts
const updateCustomResponse = await putJson(
  `/dictionary/custom-entries/${astrologerEntryId}`,
  {
    categoryId,
    title: "Венера в Близнецах",
    content: "Новая авторская редакция"
  },
  csrfHeaders()
);

expect(updateCustomResponse.status).toBe(200);
dictionaryAstrologerEntryResponseSchema.parse(updateCustomResponse.body);
expect(dictionaryStore.updateCustomEntry).toHaveBeenCalledWith({
  ownerUserId,
  entryId: astrologerEntryId,
  categoryId,
  title: "Венера в Близнецах",
  content: "Новая авторская редакция",
  updatedAt: expect.any(String)
});
```

Add this helper beside `postJson` in `dictionary.e2e.test.ts`:

```ts
function putJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return request(app.getHttpServer()).put(path).set(headers).send(body);
}
```

- [ ] **Step 6: Verify GREEN**

Run:

```bash
pnpm test -- apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-api/src/modules/dictionary/dictionary.service.ts apps/astrologer-api/src/modules/dictionary/dictionary.controller.ts apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts
git commit -m "feat: expose dictionary custom entry update route"
```

---

### Task 5: Frontend API And Mutations

**Files:**
- Create: `apps/astrologer-web/src/features/dictionary/api/updateDictionaryCustomEntry.ts`
- Create: `apps/astrologer-web/src/features/dictionary/api/updateDictionaryPlatformEntryOverride.ts`
- Modify: `apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts`
- Modify: `apps/astrologer-web/src/features/dictionary/model/dictionaryQueryOptions.ts`
- Create: `apps/astrologer-web/src/features/dictionary/model/useUpdateDictionaryCustomEntryMutation.ts`
- Create: `apps/astrologer-web/src/features/dictionary/model/useUpdateDictionaryPlatformEntryOverrideMutation.ts`
- Modify: `apps/astrologer-web/src/features/dictionary/model/dictionaryQueries.test.ts`

- [ ] **Step 1: Write failing API tests**

In `dictionaryApi.test.ts`, import the two new functions and add:

```ts
it("updates custom dictionary entries through the shared request and response contracts", async () => {
  const put = vi.spyOn(application.http, "put").mockResolvedValue(astrologerEntryResponse);

  await expect(
    updateDictionaryCustomEntry({
      entryId: astrologerEntryResponse.id,
      categoryId,
      title: " Венера в Близнецах ",
      content: " Новая редакция "
    })
  ).resolves.toEqual(astrologerEntryResponse);

  expect(put).toHaveBeenCalledWith(
    `/dictionary/custom-entries/${astrologerEntryResponse.id}`,
    {
      categoryId,
      title: "Венера в Близнецах",
      content: "Новая редакция"
    },
    { csrf: true }
  );
});

it("updates platform dictionary entries through the override endpoint", async () => {
  const put = vi.spyOn(application.http, "put").mockResolvedValue(astrologerEntryResponse);
  const platformEntryId = "a138f7d0-6b2c-4f6d-89a9-6be4f756d133";

  await expect(
    updateDictionaryPlatformEntryOverride({
      platformEntryId,
      title: " Солнце в Овне ",
      content: " Авторская редакция "
    })
  ).resolves.toEqual(astrologerEntryResponse);

  expect(put).toHaveBeenCalledWith(
    `/dictionary/platform-entries/${platformEntryId}/override`,
    {
      title: "Солнце в Овне",
      content: "Авторская редакция"
    },
    { csrf: true }
  );
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test -- apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts
```

Expected: FAIL because the update API modules do not exist.

- [ ] **Step 3: Implement API clients**

Create `updateDictionaryCustomEntry.ts`:

```ts
import {
  dictionaryAstrologerEntryIdParamSchema,
  dictionaryAstrologerEntryResponseSchema,
  updateDictionaryCustomEntryRequestSchema,
  type DictionaryAstrologerEntryResponse,
  type UpdateDictionaryCustomEntryRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type UpdateDictionaryCustomEntryInput = UpdateDictionaryCustomEntryRequest & {
  readonly entryId: string;
};

export async function updateDictionaryCustomEntry(
  input: UpdateDictionaryCustomEntryInput
): Promise<DictionaryAstrologerEntryResponse> {
  const { entryId } = dictionaryAstrologerEntryIdParamSchema.parse({ entryId: input.entryId });
  const body = updateDictionaryCustomEntryRequestSchema.parse(input);

  return dictionaryAstrologerEntryResponseSchema.parse(
    await application.http.put(`/dictionary/custom-entries/${entryId}`, body, { csrf: true })
  );
}
```

Create `updateDictionaryPlatformEntryOverride.ts`:

```ts
import {
  dictionaryAstrologerEntryResponseSchema,
  dictionaryPlatformEntryIdParamSchema,
  updateDictionaryPlatformEntryOverrideRequestSchema,
  type DictionaryAstrologerEntryResponse,
  type UpdateDictionaryPlatformEntryOverrideRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type UpdateDictionaryPlatformEntryOverrideInput =
  UpdateDictionaryPlatformEntryOverrideRequest & {
    readonly platformEntryId: string;
  };

export async function updateDictionaryPlatformEntryOverride(
  input: UpdateDictionaryPlatformEntryOverrideInput
): Promise<DictionaryAstrologerEntryResponse> {
  const { platformEntryId } = dictionaryPlatformEntryIdParamSchema.parse({
    platformEntryId: input.platformEntryId
  });
  const body = updateDictionaryPlatformEntryOverrideRequestSchema.parse(input);

  return dictionaryAstrologerEntryResponseSchema.parse(
    await application.http.put(
      `/dictionary/platform-entries/${platformEntryId}/override`,
      body,
      { csrf: true }
    )
  );
}
```

- [ ] **Step 4: Write failing mutation tests**

In `dictionaryQueries.test.ts`, mock the new API modules and add mutation option tests that mirror the existing create/reset tests. The core assertions:

```ts
expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
  queryKey: dictionaryQueryKeys.all()
});
```

and:

```ts
expect(updateDictionaryCustomEntry).toHaveBeenCalledWith(input);
expect(updateDictionaryPlatformEntryOverride).toHaveBeenCalledWith(input);
```

- [ ] **Step 5: Implement mutation options and hooks**

In `dictionaryQueryOptions.ts`, import the new types/functions and add:

```ts
export function updateDictionaryCustomEntryMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: UpdateDictionaryCustomEntryInput) => updateDictionaryCustomEntry(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictionaryQueryKeys.all()
      })
  };
}

export function updateDictionaryPlatformEntryOverrideMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">
) {
  return {
    mutationFn: (input: UpdateDictionaryPlatformEntryOverrideInput) =>
      updateDictionaryPlatformEntryOverride(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: dictionaryQueryKeys.all()
      })
  };
}
```

Create both hooks with the same pattern as `useCreateDictionaryCustomEntryMutation`.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
pnpm test -- apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts apps/astrologer-web/src/features/dictionary/model/dictionaryQueries.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-web/src/features/dictionary/api/updateDictionaryCustomEntry.ts apps/astrologer-web/src/features/dictionary/api/updateDictionaryPlatformEntryOverride.ts apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts apps/astrologer-web/src/features/dictionary/model/dictionaryQueryOptions.ts apps/astrologer-web/src/features/dictionary/model/useUpdateDictionaryCustomEntryMutation.ts apps/astrologer-web/src/features/dictionary/model/useUpdateDictionaryPlatformEntryOverrideMutation.ts apps/astrologer-web/src/features/dictionary/model/dictionaryQueries.test.ts
git commit -m "feat: add dictionary edit mutations"
```

---

### Task 6: Modal Draft Helpers And Copy

**Files:**
- Modify: `apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.ts`
- Modify: `apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`

- [ ] **Step 1: Write failing helper tests**

In `referenceEntryDraft.test.ts`, add tests for:

```ts
expect(createReferenceEntryDraftFromEntry(entry)).toEqual({
  categoryId: entry.categoryId,
  title: entry.title,
  content: entry.content
});
```

and:

```ts
expect(createReferenceEntryUpdatePayload(draft)).toEqual({
  categoryId: draft.categoryId,
  title: "Венера в Близнецах",
  content: "Новая редакция"
});
expect(createReferencePlatformEntryOverridePayload(draft)).toEqual({
  title: "Венера в Близнецах",
  content: "Новая редакция"
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts
```

Expected: FAIL because helper functions do not exist.

- [ ] **Step 3: Implement helper functions**

In `referenceEntryDraft.ts`, import `DictionaryEffectiveEntryResponse` type and add:

```ts
export function createReferenceEntryDraftFromEntry(
  entry: DictionaryEffectiveEntryResponse
): ReferenceEntryDraft {
  return {
    categoryId: entry.categoryId,
    title: entry.title,
    content: entry.content
  };
}

export function createReferenceEntryUpdatePayload(draft: ReferenceEntryDraft): ReferenceEntryDraft {
  return normalizeReferenceEntryDraft(draft);
}

export function createReferencePlatformEntryOverridePayload(draft: ReferenceEntryDraft): Pick<
  ReferenceEntryDraft,
  "title" | "content"
> {
  const normalizedDraft = normalizeReferenceEntryDraft(draft);

  return {
    title: normalizedDraft.title,
    content: normalizedDraft.content
  };
}
```

- [ ] **Step 4: Update localized copy**

In `AstrologerCopy["reference"]["entryModal"]`, replace `title` and `closeLabel` with:

```ts
createTitle: string;
editTitle: string;
createCloseLabel: string;
editCloseLabel: string;
```

For Russian:

```ts
createTitle: "Новая трактовка",
editTitle: "Редактировать трактовку",
createCloseLabel: "Закрыть модалку добавления трактовки",
editCloseLabel: "Закрыть модалку редактирования трактовки",
```

For English:

```ts
createTitle: "New interpretation",
editTitle: "Edit interpretation",
createCloseLabel: "Close add interpretation modal",
editCloseLabel: "Close edit interpretation modal",
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.ts apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts apps/astrologer-web/src/common/i18n/astrologerCopy.ts apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
git commit -m "feat: prepare reference entry edit drafts"
```

---

### Task 7: Modal Create/Edit Container And View

**Files:**
- Modify: `apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModal.tsx`
- Modify: `apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.tsx`
- Modify: `apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.test.tsx`

- [ ] **Step 1: Write failing view test**

Update test copy to include create/edit labels. Add a test that passes:

```ts
isCategoryEditable={false}
```

and asserts category chips receive `disabled: true` or do not call `onDraftChange` when clicked. Use the existing `Chip` props pattern in the test.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.test.tsx
```

Expected: FAIL because `isCategoryEditable` is not supported.

- [ ] **Step 3: Update view props**

Add to `ReferenceEntryModalViewProps`:

```ts
readonly isCategoryEditable: boolean;
```

Update category chip:

```tsx
<Chip
  key={category.id}
  label={category.name}
  type="button"
  active={isActive}
  disabled={!isCategoryEditable}
  data-reference-entry-modal-category-id={category.id}
  onClick={() => {
    if (!isCategoryEditable) {
      return;
    }

    onDraftChange({ ...draft, categoryId: category.id }, "categoryId");
  }}
/>
```

- [ ] **Step 4: Update modal container props and submit routing**

Change `ReferenceEntryModalProps` to a discriminated union:

```ts
type ReferenceEntryModalCreateMode = {
  readonly mode: "create";
  readonly selectedCategoryId: string | null;
  readonly titleSeed: string;
};

type ReferenceEntryModalEditMode = {
  readonly mode: "edit";
  readonly entry: DictionaryEffectiveEntryResponse;
};

export type ReferenceEntryModalProps = {
  readonly copy: ReferenceEntryModalCopy;
  readonly categories: DictionaryCategoryResponse[];
  readonly locale: DictionaryLocale;
  readonly onClose: () => void;
} & (ReferenceEntryModalCreateMode | ReferenceEntryModalEditMode);
```

Use initializer:

```ts
const [draft, setDraft] = useState(() =>
  props.mode === "edit"
    ? createReferenceEntryDraftFromEntry(props.entry)
    : createReferenceEntryDraft({
        categories,
        selectedCategoryId: props.selectedCategoryId,
        titleSeed: props.titleSeed
      })
);
```

Use mutations:

```ts
const createEntryMutation = useCreateDictionaryCustomEntryMutation();
const updateCustomEntryMutation = useUpdateDictionaryCustomEntryMutation();
const updatePlatformEntryMutation = useUpdateDictionaryPlatformEntryOverrideMutation();
const isSaving =
  createEntryMutation.isPending ||
  updateCustomEntryMutation.isPending ||
  updatePlatformEntryMutation.isPending;
```

Submit routing:

```ts
if (props.mode === "create") {
  createEntryMutation
    .mutateAsync({ ...normalizeReferenceEntryDraft(draft), locale })
    .then(onClose)
    .catch(() => undefined);
  return;
}

if (props.entry.source === "custom") {
  const entryId = props.entry.astrologerEntryId ?? props.entry.id;
  updateCustomEntryMutation
    .mutateAsync({
      entryId,
      ...createReferenceEntryUpdatePayload(draft)
    })
    .then(onClose)
    .catch(() => undefined);
  return;
}

if (props.entry.platformEntryId) {
  updatePlatformEntryMutation
    .mutateAsync({
      platformEntryId: props.entry.platformEntryId,
      ...createReferencePlatformEntryOverridePayload(draft)
    })
    .then(onClose)
    .catch(() => undefined);
}
```

Set:

```tsx
copy={{
  ...copy,
  title: props.mode === "edit" ? copy.editTitle : copy.createTitle,
  closeLabel: props.mode === "edit" ? copy.editCloseLabel : copy.createCloseLabel
}}
isCategoryEditable={props.mode === "create" || props.entry.source === "custom"}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModal.tsx apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.tsx apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.test.tsx
git commit -m "feat: support reference entry edit modal"
```

---

### Task 8: Page Wiring

**Files:**
- Modify: `apps/astrologer-web/src/pages/reference/ReferencePage.tsx`
- Modify: `apps/astrologer-web/src/pages/reference/ReferencePageView.test.tsx`
- Create: `apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx`

- [ ] **Step 1: Write failing page/container test**

Create `apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx` as a focused container test. Mock `ReferencePageView`, `ReferenceEntryModal`, `useI18n`, dictionary query hooks, reset mutation, document title hook, and summary helpers. The test invokes `onEditEntry` from captured `ReferencePageView` props and asserts `ReferenceEntryModal` is rendered with:

```ts
{
  mode: "edit",
  entry
}
```

Use `vi.mock` for `ReferencePageView` and `ReferenceEntryModal` so the test remains focused on page-level wiring rather than DOM rendering.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx
```

Expected: FAIL because `ReferencePage` still wires `onEditEntry` to `undefined`.

- [ ] **Step 3: Implement page modal state**

In `ReferencePage.tsx`, change:

```ts
type ReferenceEntryModalState = {
  readonly titleSeed: string;
};
```

to:

```ts
type ReferenceEntryModalState =
  | {
      readonly mode: "create";
      readonly titleSeed: string;
    }
  | {
      readonly mode: "edit";
      readonly entry: DictionaryEffectiveEntryResponse;
    };
```

Import `DictionaryEffectiveEntryResponse`. Update add:

```ts
const openEntryModal = (options: ReferenceAddEntryOptions = {}) => {
  setEntryModal({
    mode: "create",
    titleSeed: options.titleSeed ?? ""
  });
};
```

Update edit:

```tsx
onEditEntry={(entry) =>
  setEntryModal({
    mode: "edit",
    entry
  })
}
```

Render modal:

```tsx
{entryModal && entryModal.mode === "create" && (
  <ReferenceEntryModal
    mode="create"
    copy={dictionary.reference.entryModal}
    categories={summary.categories}
    locale={locale}
    selectedCategoryId={selectedCategoryId}
    titleSeed={entryModal.titleSeed}
    onClose={() => setEntryModal(null)}
  />
)}
{entryModal && entryModal.mode === "edit" && (
  <ReferenceEntryModal
    mode="edit"
    copy={dictionary.reference.entryModal}
    categories={summary.categories}
    locale={locale}
    entry={entryModal.entry}
    onClose={() => setEntryModal(null)}
  />
)}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm test -- apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx apps/astrologer-web/src/pages/reference/ReferencePageView.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-web/src/pages/reference/ReferencePage.tsx apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx apps/astrologer-web/src/pages/reference/ReferencePageView.test.tsx
git commit -m "feat: open reference edit modal from entry cards"
```

---

### Task 9: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused test suite**

```bash
pnpm test -- packages/contracts/src/dictionary.test.ts packages/domain/src/dictionary/index.test.ts apps/astrologer-api/src/modules/dictionary/dictionary.service.test.ts apps/astrologer-api/src/modules/dictionary/dictionary.e2e.test.ts apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts apps/astrologer-web/src/features/dictionary/model/dictionaryQueries.test.ts apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.test.tsx apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx apps/astrologer-web/src/pages/reference/ReferencePageView.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typechecks**

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run repository tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Run full verification if time budget allows**

```bash
pnpm verify
```

Expected: PASS. If this fails outside touched files, record the failing command and determine whether the failure predates the feature.

- [ ] **Step 5: Do not start dev servers**

Do not run `pnpm dev`, Vite, Nest dev mode, workers, Docker, Redis, or database processes unless the user explicitly asks. The project instructions forbid starting or stopping local long-running services without direct command.

---

## Self-Review

- Spec coverage: all design requirements map to tasks 1-9.
- No DB schema migration is required because `dictionary_astrologer_entries` already stores custom entry `categoryId`, `title`, `content`, and `updatedAt`.
- Custom entries get a real update route instead of delete/recreate.
- Platform and modified entries reuse the existing platform override flow.
- State-changing routes remain CSRF-protected.
- Frontend writes invalidate dictionary query keys after successful mutation.
- Category changes are allowed for custom entries only; platform-owned entries do not move categories through override.
