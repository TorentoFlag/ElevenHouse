# Astrologer Web Dictionary Reference Top Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first frontend slice of the astrologer dictionary page: route content, top toolbar, category sidebar, source filters, search state, and read-only backend data loading.

**Architecture:** Keep backend data access in `apps/astrologer-web/src/features/dictionary` and keep the page composition in `apps/astrologer-web/src/pages/reference`. Parse every HTTP response with `@elevenhouse/contracts` schemas at the API boundary. Use TanStack Query for server state and local React state for selected category/source/search filters.

**Tech Stack:** React 19, TypeScript, Vite, React Router, TanStack Query, Zod contracts, existing ElevenHouse design-system tokens/icons/components.

---

### Task 1: Dictionary API Client

**Files:**
- Create: `apps/astrologer-web/src/features/dictionary/api/listDictionaryCategories.ts`
- Create: `apps/astrologer-web/src/features/dictionary/api/listDictionaryEntries.ts`
- Create: `apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts`

- [ ] **Step 1: Write failing API tests**

Test that categories call `/dictionary/categories?locale=ru`, entries call `/dictionary/entries?locale=ru&categoryId=...&source=modified&search=...&limit=50&offset=0`, and both functions parse responses with shared contracts.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run --config vitest.config.ts apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts
```

Expected: FAIL because the dictionary API files do not exist.

- [ ] **Step 3: Implement API functions**

Use `application.http.get(...)`, `URLSearchParams`, and `dictionaryCategoriesResponseSchema` / `dictionaryEntriesResponseSchema`.

- [ ] **Step 4: Run GREEN**

Run the same vitest command. Expected: PASS.

### Task 2: Dictionary Query Options

**Files:**
- Create: `apps/astrologer-web/src/features/dictionary/model/dictionaryQueryKeys.ts`
- Create: `apps/astrologer-web/src/features/dictionary/model/useDictionaryCategoriesQuery.ts`
- Create: `apps/astrologer-web/src/features/dictionary/model/useDictionaryEntriesQuery.ts`
- Create: `apps/astrologer-web/src/features/dictionary/model/dictionaryQueries.test.ts`

- [ ] **Step 1: Write failing query option tests**

Test stable serializable keys and that query functions pass their input through to the API client.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run --config vitest.config.ts apps/astrologer-web/src/features/dictionary/model/dictionaryQueries.test.ts
```

Expected: FAIL because query modules do not exist.

- [ ] **Step 3: Implement query keys/options/hooks**

Use top-level array query keys, matching TanStack Query guidance, and expose hooks as wrappers around `useQuery`.

- [ ] **Step 4: Run GREEN**

Run the same vitest command. Expected: PASS.

### Task 3: Reference Page View

**Files:**
- Create: `apps/astrologer-web/src/pages/reference/ReferencePageView.tsx`
- Modify: `apps/astrologer-web/src/pages/reference/ReferencePage.module.css`
- Modify: `apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`

- [ ] **Step 1: Write failing view tests**

Test that the view renders the title/count, search input, reset and add buttons, category list, source chips, loading text, and error text from props/copy.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run --config vitest.config.ts apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx
```

Expected: FAIL because `ReferencePageView` and new copy keys do not exist.

- [ ] **Step 3: Implement the view**

Use existing design-system `Button`, `Plus`, `Search`, and `Reference` icon primitives. Style with CSS modules and existing tokens only.

- [ ] **Step 4: Run GREEN**

Run the same vitest command. Expected: PASS.

### Task 4: Reference Page Wiring

**Files:**
- Modify: `apps/astrologer-web/src/pages/reference/ReferencePage.tsx`
- Modify: `apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx`

- [ ] **Step 1: Write failing composition tests**

Test that `ReferencePage` uses the current i18n locale, requests categories and entries, defaults to `source: "all"`, passes selected category/source/search state into the view, and clears filters through the reset handler.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run --config vitest.config.ts apps/astrologer-web/src/pages/reference/ReferencePage.test.tsx
```

Expected: FAIL because the page still renders the old placeholder.

- [ ] **Step 3: Implement page wiring**

Use `useI18n`, `useDocumentTitle`, `useDictionaryCategoriesQuery`, `useDictionaryEntriesQuery`, and local state for `categoryId`, `source`, and `search`.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm vitest run --config vitest.config.ts apps/astrologer-web/src
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: PASS. Do not start or stop local dev servers.
