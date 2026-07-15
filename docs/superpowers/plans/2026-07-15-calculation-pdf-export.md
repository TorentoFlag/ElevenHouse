# Calculation PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkboxes so progress survives session boundaries.

**Goal:** Replace the Matrix-only PDF implementation with one production
calculation PDF contour and make complete private PDF export available for
saved Pythagorean Numerology individual and compatibility calculations.

**Architecture:** `Calculations` owns the generic PDF job lifecycle,
authorization, idempotency, current-result validation, artifacts, and
invalidation. Matrix and Numerology contribute only authoritative source
assemblers and renderers. The API commits jobs and outbox events; the separate
`apps/workers` process relays, renders, stores, cleans up, and records terminal
state. PostgreSQL is authoritative; Redis carries identifiers only.

**Tech Stack:** TypeScript 6, NestJS 11, React 19, TanStack Query 5, Drizzle
ORM/PostgreSQL, BullMQ 5/Redis, AWS S3 SDK, pdf-lib/fontkit, Vitest, Docker
Compose, Poppler, Computer Use.

## Global Constraints

- Work directly in `main` as requested; do not create a worktree or preserve a
  legacy Matrix implementation.
- Follow RED -> GREEN -> REFACTOR for every behavior change. A task is not
  complete until its named focused tests pass.
- Do not start, stop, restart, or kill frontend, API, worker, Docker, Postgres,
  Redis, or queues without a new explicit lifecycle instruction. Read-only
  `lsof`, `ps`, `curl`, and Docker inspection are allowed.
- The already authorized application tab on port `5174` must be tested through
  Computer Use, not a fresh browser or Chrome DevTools.
- Rebuild the current baseline migration rather than adding an incremental
  `ALTER` migration. Run `db:reset` only after proving the target is the local
  ElevenHouse Postgres container and its actual published port.
- Preserve unrelated working-tree changes and stage only files owned by this
  implementation.
- Do not expose AI source, provider, model, prompt, prompt version, storage key,
  or internal render-contract fingerprint through contracts, UI, PDF, logs, or
  Redis payloads.
- The active locale chooses `ru` or `en`; no export setup modal or new result
  layout is introduced.
- Every download must require the current calculation checksum. Recalculation
  makes old files immediately inaccessible and schedules private-object
  cleanup; old calculation or renderer versions are not retained.
- A generated PDF is temporary verification evidence under `tmp/pdfs/`, never
  a committed product asset.

---

### Task 1: Define public contracts and domain-owned PDF primitives

**Files:**

- Create: `packages/contracts/src/calculation-pdf.ts`
- Create: `packages/contracts/src/calculation-pdf.test.ts`
- Modify: `packages/contracts/src/matrix-report.ts`
- Modify: `packages/contracts/src/matrix-report.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Create: `packages/domain/src/calculations/pdf/calculation-pdf-types.ts`
- Create: `packages/domain/src/calculations/pdf/calculation-pdf-store.ts`
- Create: `packages/domain/src/calculations/pdf/calculation-pdf-use-cases.ts`
- Create: `packages/domain/src/calculations/pdf/calculation-pdf-use-cases.test.ts`
- Create: `packages/domain/src/calculations/pdf/index.ts`
- Modify: `packages/domain/src/calculations/index.ts`
- Modify: `packages/domain/src/calculations/index.test.ts`
- Delete after consumers migrate:
  `packages/domain/src/matrix/report/pdf-job-types.ts`
- Delete after consumers migrate:
  `packages/domain/src/matrix/report/pdf-job-store.ts`

- [ ] **Step 1: Write failing contract tests**

  Cover strict parsing for:
  - generic `queued | processing | ready | failed` job responses;
  - `ru | en` request locale and required expected result checksum;
  - nullable artifact/media ids, bounded public failure message, and timestamps;
  - Matrix compatibility fields `reportId` and `reportRevision` without storage
    or AI provenance;
  - rejection of unknown fields and invalid checksums/locales.

- [ ] **Step 2: Run the contract tests and confirm RED**

  ```bash
  pnpm test -- packages/contracts/src/calculation-pdf.test.ts packages/contracts/src/matrix-report.test.ts packages/contracts/src/index.test.ts
  ```

  Expected: failures for missing calculation PDF schemas and exports.

- [ ] **Step 3: Implement the contracts**

  Export strict Zod schemas equivalent to:

  ```ts
  type CalculationPdfJobResponse = {
    id: string;
    calculationId: string;
    resultChecksum: string;
    locale: "ru" | "en";
    status: "queued" | "processing" | "ready" | "failed";
    artifactId: string | null;
    mediaAssetId: string | null;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
  };

  type RequestCalculationPdf = {
    expectedResultChecksum: string;
    locale: "ru" | "en";
  };
  ```

  Make Matrix's external schema extend the generic response while preserving
  its established report identity fields. Do not expose `sourceLocator`,
  `documentFingerprint`, bucket, key, provider, model, or prompt metadata.

- [ ] **Step 4: Write failing domain tests**

  Cover source-locator validation, current-checksum rejection, deterministic
  document fingerprint inputs, non-failed job reuse, failed-job replacement,
  owner scoping, and public-safe failure projection.

- [ ] **Step 5: Run domain tests and confirm RED**

  ```bash
  pnpm test -- packages/domain/src/calculations/pdf/calculation-pdf-use-cases.test.ts packages/domain/src/calculations/index.test.ts
  ```

- [ ] **Step 6: Implement generic domain types and ports**

  Define the strict locator union:

  ```ts
  type CalculationPdfSourceLocator =
    | {
        kind: "matrix_report";
        reportId: string;
        reportRevision: number;
        reportResultChecksum: string;
      }
    | {
        kind: "approved_interpretation";
        interpretationId: string | null;
      };
  ```

  Define `CalculationPdfJobStore` operations for owner-scoped latest/request,
  globally unique worker lookup/claim, completion, terminal failure, and
  calculation invalidation. Keep `packages/domain` independent of Drizzle,
  Nest, BullMQ, Media adapters, and method render-document shapes.

- [ ] **Step 7: Run focused tests and typecheck**

  ```bash
  pnpm test -- packages/contracts/src/calculation-pdf.test.ts packages/contracts/src/matrix-report.test.ts packages/contracts/src/index.test.ts packages/domain/src/calculations/pdf/calculation-pdf-use-cases.test.ts packages/domain/src/calculations/index.test.ts
  pnpm --filter @elevenhouse/contracts typecheck
  pnpm --filter @elevenhouse/domain typecheck
  ```

  Expected: all pass.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/contracts/src packages/domain/src/calculations packages/domain/src/matrix/report
  git commit -m "feat(calculations): define generic PDF contracts"
  ```

### Task 2: Replace Matrix-specific persistence with generic calculation PDF persistence

**Files:**

- Create: `packages/db/src/schema/calculations/calculation-pdf-jobs.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/index.ts`
- Modify: `packages/db/src/schema/calculations/relations.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Delete: `packages/db/src/schema/matrix/matrix-pdf-jobs.schema.ts`
- Modify: `packages/db/src/schema/matrix/index.ts`
- Modify: `packages/db/src/schema/matrix/relations.schema.ts`
- Create:
  `packages/db/src/adapters/calculations/drizzle-calculation-pdf-job-store.ts`
- Create:
  `packages/db/src/adapters/calculations/drizzle-calculation-pdf-job-store.integration.ts`
- Modify: `packages/db/src/adapters/calculations/index.ts`
- Delete after callers migrate:
  `packages/db/src/adapters/matrix/drizzle-matrix-pdf-job-store.ts`
- Delete after callers migrate:
  `packages/db/src/adapters/matrix/drizzle-matrix-pdf-job-store.integration.ts`
- Modify: `packages/db/src/adapters/matrix/index.ts`
- Modify: `packages/validation/src/media/index.ts`
- Modify: `packages/validation/src/media/index.test.ts`
- Regenerate: `packages/db/drizzle/0000_sticky_rictor.sql`
- Regenerate: `packages/db/drizzle/meta/0000_snapshot.json`

- [ ] **Step 1: Write failing schema and validation tests**

  Require:
  - one `calculation_pdf_jobs` table with owner/calculation composite integrity;
  - module, method, current checksum, locale, locator JSON, SHA-256 document
    fingerprint, job status, artifact/media references, bounded failure fields,
    page count, and timestamps;
  - a partial unique index on owner, calculation, checksum, locale, and
    fingerprint where status is not `failed`;
  - artifact FK behavior compatible with recalculation cleanup;
  - only generic `calculation_report_pdf` media purpose for generated reports.

- [ ] **Step 2: Confirm RED**

  ```bash
  pnpm test -- packages/db/src/schema/calculations/calculations.schema.test.ts packages/validation/src/media/index.test.ts
  ```

- [ ] **Step 3: Implement schema and vocabulary**

  Remove `matrix_pdf_jobs` and `matrix_report_pdf`; do not alias or retain the
  old identifiers. Keep source locator bounded and validated at adapter edges.
  Use `ON DELETE CASCADE` from PDF job to artifact so current-result replacement
  can remove jobs and artifacts transactionally; keep Media protected while a
  live job references it.

- [ ] **Step 4: Write failing generic adapter integration tests**

  Cover atomic job/artifact/media/outbox creation, idempotent concurrent reuse,
  owner-scoped lookup, worker claim, ready replay, permanent failure, and the
  partial unique boundary. Verify Redis payload is never persisted here.

- [ ] **Step 5: Implement the Drizzle adapter**

  The request operation must create in one transaction:
  1. generic job;
  2. private Media asset in processing state;
  3. calculation PDF artifact;
  4. `calculation.pdf.requested.v1` outbox event containing only the job id.

  If the partial unique constraint wins concurrently, return the already
  active job instead of surfacing a conflict.

- [ ] **Step 6: Regenerate the baseline migration**

  ```bash
  pnpm db:generate
  ```

  Expected: `0000_sticky_rictor.sql` and its snapshot describe the final generic
  table directly and contain no `matrix_pdf_jobs` or incremental `ALTER` chain.

- [ ] **Step 7: Run non-destructive focused checks**

  ```bash
  pnpm test -- packages/db/src/schema/calculations/calculations.schema.test.ts packages/validation/src/media/index.test.ts
  pnpm --filter @elevenhouse/db typecheck
  rg -n "matrix_pdf_jobs|matrix_report_pdf" packages apps deployment docs --glob '!docs/superpowers/**'
  ```

  Expected: tests/typecheck pass; the legacy identifier search is empty.
  Integration tests wait for the verified local reset in Task 11.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/db packages/validation/src/media
  git commit -m "refactor(db): generalize calculation PDF jobs"
  ```

### Task 3: Make recalculation invalidate downloads and schedule object cleanup

**Files:**

- Modify: `packages/domain/src/calculations/calculation-store.ts`
- Modify: `packages/domain/src/calculations/calculation-use-cases.ts`
- Modify: `packages/domain/src/calculations/calculation-use-cases.test.ts`
- Modify:
  `packages/db/src/adapters/calculations/drizzle-calculation-store.ts`
- Modify:
  `packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts`
- Modify:
  `packages/db/src/adapters/calculations/drizzle-calculation-pdf-job-store.ts`

- [ ] **Step 1: Add failing invalidation tests**

  Cover a calculation with zero, one, and multiple PDFs. Recalculation must,
  within its result-replacement transaction:
  - enqueue one deduplicated `calculation.pdf.delete-requested.v1` event per
    Media id with `available_at = now + 1 hour`;
  - delete generic jobs and artifacts in FK-safe order;
  - retain the unreferenced Media row until cleanup succeeds;
  - make the old job unavailable through owner/current lookup immediately;
  - leave unrelated calculations and Media untouched.

- [ ] **Step 2: Confirm RED**

  ```bash
  pnpm test -- packages/domain/src/calculations/calculation-use-cases.test.ts
  ```

- [ ] **Step 3: Implement transaction-owned invalidation**

  Add a focused persistence operation rather than leaking table deletion order
  into API services. The deletion event payload contains only `mediaAssetId`.
  Its deduplication identity must make repeated replacement safe.

- [ ] **Step 4: Run unit and type checks**

  ```bash
  pnpm test -- packages/domain/src/calculations/calculation-use-cases.test.ts
  pnpm --filter @elevenhouse/domain typecheck
  pnpm --filter @elevenhouse/db typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/domain/src/calculations packages/db/src/adapters/calculations
  git commit -m "fix(calculations): invalidate PDFs on recalculation"
  ```

### Task 4: Introduce one API-owned calculation PDF lifecycle

**Files:**

- Create:
  `apps/astrologer-api/src/modules/calculations/pdf/calculation-pdf.tokens.ts`
- Create:
  `apps/astrologer-api/src/modules/calculations/pdf/calculation-pdf.service.ts`
- Create:
  `apps/astrologer-api/src/modules/calculations/pdf/calculation-pdf.service.test.ts`
- Modify:
  `apps/astrologer-api/src/modules/calculations/calculations.module.ts`
- Modify: `apps/astrologer-api/src/modules/calculations/calculations.tokens.ts`
- Create: `apps/astrologer-api/src/modules/matrix/matrix-pdf.service.ts`
- Create: `apps/astrologer-api/src/modules/matrix/matrix-pdf.service.test.ts`
- Create: `apps/astrologer-api/src/modules/matrix/matrix-pdf.controller.ts`
- Modify: `apps/astrologer-api/src/modules/matrix/matrix-report.service.ts`
- Modify: `apps/astrologer-api/src/modules/matrix/matrix-report.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/matrix/matrix-report.controller.ts`
- Modify: `apps/astrologer-api/src/modules/matrix/matrix.module.ts`
- Modify: `apps/astrologer-api/src/modules/matrix/matrix.e2e.test.ts`
- Modify: `apps/astrologer-api/src/modules/media/media.module.ts`

- [ ] **Step 1: Write failing generic service tests**

  Cover latest/request/download for:
  - authenticated owner and a current non-archived saved calculation;
  - expected checksum mismatch;
  - unsaved/missing/archived/foreign calculation;
  - idempotent same-fingerprint reuse and retry after terminal failure;
  - ready download only when job checksum equals the current calculation;
  - private ready Media asset with `calculation_report_pdf` purpose;
  - five-minute signed URL without leaking storage metadata;
  - public error projection that excludes internal failure details.

- [ ] **Step 2: Confirm RED**

  ```bash
  pnpm test -- apps/astrologer-api/src/modules/calculations/pdf/calculation-pdf.service.test.ts
  ```

- [ ] **Step 3: Implement the generic service**

  Provide method-neutral operations that accept a validated source locator and
  render-contract id from the method facade. Compute `documentFingerprint` as
  SHA-256 over canonical JSON containing only current checksum, locale, selected
  source identity, and the currently deployed render contract.

- [ ] **Step 4: Write failing Matrix migration tests**

  Preserve the existing Matrix HTTP paths and response compatibility. Verify
  current ready report selection, report revision/checksum binding, CSRF on
  request, ownership, idempotency, and the newly required current-checksum
  validation on download.

- [ ] **Step 5: Split and migrate Matrix PDF**

  `MatrixReportService` remains responsible for report/AI behavior only.
  `MatrixPdfService` supplies the Matrix locator and delegates lifecycle work to
  `CalculationPdfService`. `MatrixPdfController` retains:

  ```text
  GET  /matrix/calculations/:id/report/pdf
  POST /matrix/calculations/:id/report/pdf
  GET  /matrix/calculations/:id/report/pdf/:jobId/download
  ```

- [ ] **Step 6: Run focused API tests**

  ```bash
  pnpm test -- apps/astrologer-api/src/modules/calculations/pdf/calculation-pdf.service.test.ts apps/astrologer-api/src/modules/matrix/matrix-pdf.service.test.ts apps/astrologer-api/src/modules/matrix/matrix-report.service.test.ts apps/astrologer-api/src/modules/matrix/matrix.e2e.test.ts
  pnpm --filter @elevenhouse/astrologer-api typecheck
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add apps/astrologer-api/src/modules/calculations apps/astrologer-api/src/modules/matrix apps/astrologer-api/src/modules/media
  git commit -m "refactor(api): centralize calculation PDF lifecycle"
  ```

### Task 5: Add Numerology PDF API with approved-content selection

**Files:**

- Create:
  `apps/astrologer-api/src/modules/numerology/numerology-pdf.service.ts`
- Create:
  `apps/astrologer-api/src/modules/numerology/numerology-pdf.service.test.ts`
- Create:
  `apps/astrologer-api/src/modules/numerology/numerology-pdf.controller.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.module.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`
- Modify:
  `packages/db/src/adapters/calculations/drizzle-calculation-store.ts`
- Modify:
  `packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts`

- [ ] **Step 1: Write failing service tests**

  Cover both Numerology modes and selection rules:
  - latest approved interpretation by `approvedAt DESC`, `updatedAt DESC`,
    `id DESC`;
  - no approved interpretation still permits deterministic export;
  - draft/unapproved/unsaved content is excluded and does not change the
    fingerprint;
  - a newly approved current interpretation changes the fingerprint and
    invalidates reuse;
  - the source locator contains only calculation checksum and optional approved
    interpretation id;
  - foreign, archived, stale-checksum, and non-Pythagorean requests fail.

- [ ] **Step 2: Confirm RED**

  ```bash
  pnpm test -- apps/astrologer-api/src/modules/numerology/numerology-pdf.service.test.ts
  ```

- [ ] **Step 3: Implement the Numerology facade and routes**

  Add strict endpoints:

  ```text
  GET  /numerology/calculations/:id/report/pdf?locale=ru|en
  POST /numerology/calculations/:id/report/pdf
  GET  /numerology/calculations/:id/report/pdf/:jobId/download
  ```

  The POST body is the shared request contract. Mutation keeps the existing
  cookie + CSRF convention. All three endpoints delegate lifecycle behavior to
  `CalculationPdfService`.

- [ ] **Step 4: Add failing and passing e2e route tests**

  Verify validation, auth/CSRF, owner isolation, route response schemas, both
  result modes, job polling, and current-checksum download rejection.

- [ ] **Step 5: Run focused API tests**

  ```bash
  pnpm test -- apps/astrologer-api/src/modules/numerology/numerology-pdf.service.test.ts apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts
  pnpm --filter @elevenhouse/astrologer-api typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/astrologer-api/src/modules/numerology packages/db/src/adapters/calculations
  git commit -m "feat(numerology): add PDF export API"
  ```

### Task 6: Generalize BullMQ delivery, processing, cleanup, and shutdown

**Files:**

- Create: `apps/workers/src/calculation-pdf/calculation-pdf.queue.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.queue.test.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.outbox-relay.ts`
- Create:
  `apps/workers/src/calculation-pdf/calculation-pdf.outbox-relay.test.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.processor.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.processor.test.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.registry.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.registry.test.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.storage.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.storage.test.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.cleanup.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.cleanup.test.ts`
- Delete: `apps/workers/src/matrix-pdf.queue.ts`
- Delete: `apps/workers/src/matrix-pdf.queue.test.ts`
- Delete: `apps/workers/src/matrix-pdf.outbox-relay.ts`
- Delete: `apps/workers/src/matrix-pdf.outbox-relay.test.ts`
- Delete: `apps/workers/src/matrix-pdf.processor.ts`
- Delete: `apps/workers/src/matrix-pdf.processor.test.ts`
- Delete: `apps/workers/src/matrix-pdf.storage.ts`
- Delete: `apps/workers/src/matrix-pdf.storage.test.ts`
- Modify: `apps/workers/src/main.ts`

- [ ] **Step 1: Write failing queue/relay tests**

  Require queue `calculation.pdf` with job names
  `render-calculation-pdf` and `delete-calculation-pdf`; Redis data contains only
  job id or Media id. Use five attempts, exponential backoff, `0.5` jitter,
  deterministic BullMQ ids, bounded relay batches, abandoned-lock recovery, and
  publish-after-add semantics.

- [ ] **Step 2: Confirm RED**

  ```bash
  pnpm test -- apps/workers/src/calculation-pdf/calculation-pdf.queue.test.ts apps/workers/src/calculation-pdf/calculation-pdf.outbox-relay.test.ts
  ```

- [ ] **Step 3: Implement generic queue and relay**

  Route both outbox event names to the single queue. Expose an awaitable relay
  shutdown that stops polling and waits for the current claimed batch before
  closing BullMQ/Postgres resources.

- [ ] **Step 4: Write failing processor/registry/storage/cleanup tests**

  Cover:
  - ready-job no-op and atomic claim;
  - registry dispatch by `module:methodCode`;
  - permanent unsupported/stale/invalid source errors using BullMQ
    `UnrecoverableError` and persisted terminal failure;
  - retryable Postgres/Redis/S3 failures left retryable;
  - deterministic owner/job S3 key, private PDF metadata, idempotent overwrite,
    SHA-256 and byte/page metadata;
  - idempotent object deletion, missing-object success, Media-row deletion only
    after object deletion, and retry on storage failure;
  - structured `error`, `failed`, `stalled`, and `completed` observations.

- [ ] **Step 5: Implement processor, registry, storage, and cleanup**

  Keep rendering in the worker event loop at bounded concurrency `2`, matching
  the measured renderer workload. Do not add sandbox processes until metrics
  justify them. On SIGINT/SIGTERM: stop relay intake, await its in-flight work,
  close worker/queue, then close Redis and Postgres.

- [ ] **Step 6: Run focused worker tests**

  ```bash
  pnpm test -- apps/workers/src/calculation-pdf
  pnpm --filter @elevenhouse/workers typecheck
  ```

- [ ] **Step 7: Verify legacy worker files are gone**

  ```bash
  rg -n "matrix-pdf|matrix\.pdf|matrix_pdf" apps/workers packages/domain packages/db --glob '!docs/superpowers/**'
  ```

  Expected: empty except intentional Matrix renderer/source names inside the
  generic calculation PDF directory.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/workers/src packages/domain/src packages/db/src
  git commit -m "refactor(workers): generalize calculation PDF pipeline"
  ```

### Task 7: Extract shared PDF layout and preserve Matrix rendering

**Files:**

- Create: `apps/workers/src/calculation-pdf/pdf-layout.ts`
- Create: `apps/workers/src/calculation-pdf/pdf-layout.test.ts`
- Create: `apps/workers/src/calculation-pdf/calculation-pdf.documents.ts`
- Create: `apps/workers/src/calculation-pdf/matrix-pdf.source.ts`
- Create: `apps/workers/src/calculation-pdf/matrix-pdf.source.test.ts`
- Create: `apps/workers/src/calculation-pdf/matrix-pdf.renderer.ts`
- Create: `apps/workers/src/calculation-pdf/matrix-pdf.renderer.test.ts`
- Delete: `apps/workers/src/matrix-pdf.renderer.ts`
- Delete: `apps/workers/src/matrix-pdf.renderer.test.ts`

- [ ] **Step 1: Write shared-layout and Matrix regression tests**

  Lock deterministic bytes and page count for the same input; RU/EN headings;
  Onest font embedding; header/footer/page numbers; content wrapping; long
  Cyrillic names; multi-page sections; and inert rendering of markup-like text.
  Assert Matrix semantics and visible content remain unchanged through the
  generic registry.

- [ ] **Step 2: Confirm RED**

  ```bash
  pnpm test -- apps/workers/src/calculation-pdf/pdf-layout.test.ts apps/workers/src/calculation-pdf/matrix-pdf.source.test.ts apps/workers/src/calculation-pdf/matrix-pdf.renderer.test.ts
  ```

- [ ] **Step 3: Extract the layout and migrate Matrix renderer**

  The source assembler loads the current ready Matrix report and rejects stale
  report id/revision/checksum. The renderer accepts a typed Matrix document,
  never performs database access, and returns `{ bytes, pageCount }`.

- [ ] **Step 4: Run renderer regression tests and typecheck**

  ```bash
  pnpm test -- apps/workers/src/calculation-pdf/pdf-layout.test.ts apps/workers/src/calculation-pdf/matrix-pdf.source.test.ts apps/workers/src/calculation-pdf/matrix-pdf.renderer.test.ts
  pnpm --filter @elevenhouse/workers typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/workers/src/calculation-pdf apps/workers/src/matrix-pdf.renderer.ts apps/workers/src/matrix-pdf.renderer.test.ts
  git commit -m "refactor(pdf): share layout and migrate Matrix renderer"
  ```

### Task 8: Render complete individual and compatibility Numerology PDFs

**Files:**

- Create: `apps/workers/src/calculation-pdf/numerology-pdf.source.ts`
- Create: `apps/workers/src/calculation-pdf/numerology-pdf.source.test.ts`
- Create: `apps/workers/src/calculation-pdf/numerology-pdf.renderer.ts`
- Create: `apps/workers/src/calculation-pdf/numerology-pdf.renderer.test.ts`
- Modify: `apps/workers/src/calculation-pdf/calculation-pdf.documents.ts`
- Modify: `apps/workers/src/calculation-pdf/calculation-pdf.registry.ts`

- [ ] **Step 1: Write failing source-assembler tests**

  Validate calculation owner/module/method/current checksum and strict canonical
  result parsing. Require the locator-selected interpretation to remain the
  current winner under `approvedAt`, `updatedAt`, `id`; reject stale locators.
  Exclude draft and AI provenance. Support `null` interpretation.

- [ ] **Step 2: Write failing renderer completeness tests**

  Individual PDF must contain:
  - identity/calculation header;
  - life path, birthday, expression, soul, and personality numbers;
  - personal year, all 12 personal months, and personal day;
  - source digits, all four working numbers, all nine psychomatrix cells;
  - all eight strength lines with raw value, level, and localized level label;
  - optional approved interpretation.

  Compatibility PDF must contain both full individual results plus pair number,
  exactly 22 comparisons, exactly four zones, category/total counts, conclusion,
  and optional approved interpretation. Do not convert raw force-line counts to
  a fictitious 1-10 score.

  Test RU and EN, empty repeated digits, maximum repeated digits, long names,
  long approved text, multi-page output, deterministic bytes, and inert markup.

- [ ] **Step 3: Confirm RED**

  ```bash
  pnpm test -- apps/workers/src/calculation-pdf/numerology-pdf.source.test.ts apps/workers/src/calculation-pdf/numerology-pdf.renderer.test.ts
  ```

- [ ] **Step 4: Implement source assembler and renderer**

  Register `numerology:pythagorean_ru` through the same registry used by Matrix.
  Keep section composition in focused functions so a future Vedic renderer can
  reuse layout primitives without importing Pythagorean calculation logic.

- [ ] **Step 5: Run all PDF worker tests**

  ```bash
  pnpm test -- apps/workers/src/calculation-pdf
  pnpm --filter @elevenhouse/workers typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/workers/src/calculation-pdf
  git commit -m "feat(numerology): render complete calculation PDFs"
  ```

### Task 9: Enable the existing Numerology PDF action in the frontend

**Files:**

- Modify: `apps/astrologer-web/src/features/numerology/api/numerologyApi.ts`
- Create: `apps/astrologer-web/src/features/numerology/api/numerologyApi.test.ts`
- Modify:
  `apps/astrologer-web/src/features/numerology/model/numerologyQueries.ts`
- Modify:
  `apps/astrologer-web/src/features/numerology/model/numerologyQueries.test.ts`
- Modify:
  `apps/astrologer-web/src/features/numerology/model/numerologyHooks.ts`
- Create:
  `apps/astrologer-web/src/features/numerology/model/numerologyPdfModel.ts`
- Create:
  `apps/astrologer-web/src/features/numerology/model/numerologyPdfModel.test.ts`
- Modify:
  `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`
- Modify:
  `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify:
  `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`

- [ ] **Step 1: Write failing API/query tests**

  Verify strict response parsing, encoded ids, GET locale query, POST checksum +
  locale + CSRF, download lookup, polling only while queued/processing, and
  current-result query isolation.

- [ ] **Step 2: Write failing pure-state tests**

  Require:

  ```text
  unsaved/preview -> disabled, "PDF", tooltip "Сначала сохраните расчёт"
  saved/current/no job -> enabled, "PDF"
  queued/processing -> disabled, "PDF готовится…"
  ready -> enabled, "Скачать PDF"
  failed -> enabled retry, visible error, "Повторить"
  ```

  A dirty or unapproved interpretation must not disable export; locale must come
  from `useI18n`, and reload must restore the latest current job.

- [ ] **Step 3: Confirm RED**

  ```bash
  pnpm test -- apps/astrologer-web/src/features/numerology/api/numerologyApi.test.ts apps/astrologer-web/src/features/numerology/model/numerologyQueries.test.ts apps/astrologer-web/src/features/numerology/model/numerologyPdfModel.test.ts apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
  ```

- [ ] **Step 4: Implement API, hooks, controller, and view wiring**

  Reuse the existing toolbar button and canonical layout. Poll every 1500 ms
  while active. Request with the currently displayed saved checksum. Open only
  the authorized short-lived download URL. Show a tooltip on disabled unsaved
  state and an actionable retry error on failed state.

- [ ] **Step 5: Run frontend tests and typecheck**

  ```bash
  pnpm test -- apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
  pnpm --filter @elevenhouse/astrologer-web typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
  git commit -m "feat(numerology): enable PDF export UI"
  ```

### Task 10: Harden runtime configuration, deployment, and canonical documentation

**Files:**

- Modify: `apps/workers/src/runtime-config.ts`
- Modify: `apps/workers/src/runtime-config.test.ts`
- Modify: `apps/workers/src/readiness.ts`
- Modify: `apps/workers/src/readiness.test.ts`
- Modify: `.env.example`
- Modify: `deployment/compose/compose.production.yml`
- Modify relevant deployment environment example discovered by
  `rg -n "WORKERS_MATRIX_PDF|REDIS" deployment docs .env.example`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/development/commands.md`
- Modify: `docs/development/testing-strategy.md`
- Modify: `docs/product/full-functional-scope.md`
- Modify: `docs/product/roadmap.md`
- Add an ADR under `docs/decisions/` only if no existing calculation-PDF ADR
  can be amended.

- [ ] **Step 1: Write failing runtime/readiness tests**

  Rename Matrix-specific environment keys to
  `WORKERS_CALCULATION_PDF_*`; validate concurrency, relay interval/batch,
  abandoned-lock timeout, retry/backoff/jitter, S3 settings, and readiness of
  Postgres, Redis, and private object storage. Reject missing/unsafe production
  values.

- [ ] **Step 2: Confirm RED**

  ```bash
  pnpm test -- apps/workers/src/runtime-config.test.ts apps/workers/src/readiness.test.ts
  ```

- [ ] **Step 3: Implement configuration and deployment hardening**

  Add worker `stop_grace_period: 60s`. Document Redis AOF and
  `maxmemory-policy=noeviction` as production invariants, not application
  fallbacks. Remove every old Matrix-specific env key.

- [ ] **Step 4: Synchronize canonical docs**

  Document generic ownership, public routes, private presigned download,
  recalculation invalidation/cleanup, worker operation, required tests, both
  Numerology modes, approved-content rule, and future-method extension point.
  Mark the roadmap item complete only after implementation evidence exists.

- [ ] **Step 5: Run focused checks and legacy scan**

  ```bash
  pnpm test -- apps/workers/src/runtime-config.test.ts apps/workers/src/readiness.test.ts
  pnpm --filter @elevenhouse/workers typecheck
  rg -n "WORKERS_MATRIX_PDF|matrix_report_pdf|matrix_pdf_jobs" . --glob '!node_modules/**' --glob '!.git/**' --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**'
  ```

  Expected: tests/typecheck pass; legacy scan is empty.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/workers/src .env.example deployment docs
  git commit -m "docs(pdf): operationalize calculation export worker"
  ```

### Task 11: Rebuild and verify the local database baseline

**Files:** Verification only unless the reset reveals a schema/seed defect.

- [ ] **Step 1: Prove the target is local before destructive work**

  ```bash
  docker compose ps postgres
  docker port "$(docker compose ps -q postgres)" 5432/tcp
  lsof -nP -iTCP -sTCP:LISTEN | rg 'postgres|5432|55432'
  ```

  Stop if the container is absent, the published port is ambiguous, or the
  resolved `DATABASE_URL` host is non-local. Do not substitute another database.

- [ ] **Step 2: Reset only the verified local database**

  Load the existing local environment only after Step 1 proves that its
  `DATABASE_URL` resolves to the inspected local container and published port:

  ```bash
  set -a
  source .env
  set +a
  pnpm db:reset
  ```

  Expected: baseline applies from an empty local database and seed completes.
  Secrets come from the existing local environment and are never printed or
  committed.

- [ ] **Step 3: Run calculation persistence integration tests**

  ```bash
  set -a
  source .env
  set +a
  INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-pdf-job-store.integration.ts packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
  ```

  Expected: generic job lifecycle, concurrency/idempotency, recalculation
  invalidation, and delayed cleanup events pass against real PostgreSQL.

- [ ] **Step 4: Commit any reset-discovered implementation correction**

  Only if needed, rerun the failing focused test, stage only the specifically
  corrected owned files after inspecting `git diff --name-only`, and commit
  them as `fix(db): align calculation PDF baseline`.

### Task 12: Perform full automated, PDF, and authorized browser verification

**Files:**

- Temporary only: `tmp/pdfs/individual-ru.pdf`
- Temporary only: `tmp/pdfs/compatibility-ru.pdf`
- Temporary only: `tmp/pdfs/individual-en.pdf`
- Temporary only: `tmp/pdfs/rendered/*.png`
- Modify product code/tests only when a verification failure proves a defect.

- [ ] **Step 1: Run the repository-wide gate**

  ```bash
  pnpm verify
  ```

  Expected: lint, typecheck, all unit tests, and all builds pass with exit code
  zero. Fix root causes, rerun the narrow failing test, then rerun `pnpm verify`.

- [ ] **Step 2: Inspect existing process state without changing lifecycle**

  ```bash
  lsof -nP -iTCP:5174 -sTCP:LISTEN
  lsof -nP -iTCP -sTCP:LISTEN | rg '5174|3000|3001|3002|6379|5432|55432'
  ps aux | rg 'apps/(astrologer-api|workers)|vite.*5174' | rg -v rg
  ```

  Use already running services. If current API/worker code is not loaded or a
  required process is absent, report that exact lifecycle blocker rather than
  starting or restarting it without permission.

- [ ] **Step 3: Generate and structurally inspect representative PDFs**

  Through focused test fixtures or the running worker, write the three temporary
  PDFs. Verify:

  ```bash
  pdfinfo tmp/pdfs/individual-ru.pdf
  pdfinfo tmp/pdfs/compatibility-ru.pdf
  pdftotext tmp/pdfs/individual-ru.pdf - | rg 'Линии силы|Персональный год|Психоматрица'
  pdftotext tmp/pdfs/compatibility-ru.pdf - | rg '22|Совместимость|Итог'
  pdftoppm -png -r 144 tmp/pdfs/individual-ru.pdf tmp/pdfs/rendered/individual
  pdftoppm -png -r 144 tmp/pdfs/compatibility-ru.pdf tmp/pdfs/rendered/compatibility
  ```

  Inspect every rendered page image with `view_image` at original detail for
  clipping, overlap, missing glyphs, broken page breaks, weak contrast, footer
  collisions, and accidental metadata. Correct and repeat until clean.

- [ ] **Step 4: Test the real Numerology flow through Computer Use on 5174**

  In the already authorized tab:
  1. Open Golubev Anton's current saved individual Pythagorean calculation.
  2. Confirm toolbar/layout remain canonical and PDF is enabled.
  3. Request PDF; observe `PDF готовится…`, then `Скачать PDF`.
  4. Download/open it and verify identity, all deterministic sections, raw force
     line counts, and current approved interpretation only if one exists.
  5. Open Koshkina Yana and the saved compatibility calculation.
  6. Request/download and verify both participants, pair number, all 22
     comparisons, four zones, counts, conclusion, and optional approved text.
  7. Switch app locale and verify a newly requested/current-fingerprint PDF uses
     the selected locale.
  8. Create an unsaved/dirty preview and verify disabled `PDF` plus tooltip
     `Сначала сохраните расчёт`.
  9. Verify refresh restores queued/ready state and failed state offers retry.
  10. Recalculate a saved result and verify the old download is rejected while
      a new job can be requested.

  Capture screenshots for the relevant toolbar states and both downloaded PDFs.

- [ ] **Step 5: Regression-test Matrix through its unchanged routes/UI**

  Request, poll, and download a Matrix PDF for an owned current calculation.
  Verify old checksum download rejection after recalculation and no visible
  change to Matrix report/AI behavior.

- [ ] **Step 6: Scan for prohibited leakage and dead implementation**

  ```bash
  rg -n "provider|model|prompt|sourceLocator|documentFingerprint|bucket|objectKey" apps/astrologer-web/src packages/contracts/src
  rg -n "matrix_pdf_jobs|matrix_report_pdf|WORKERS_MATRIX_PDF" . --glob '!node_modules/**' --glob '!.git/**' --glob '!docs/superpowers/**'
  git status --short
  git diff --check
  ```

  Review every first-search hit for intentional internal naming versus public
  leakage. The legacy search must be empty. `git diff --check` must pass.

- [ ] **Step 7: Request final code review and address findings**

  Use `superpowers:requesting-code-review`; because delegation is disabled by
  current project instructions unless the user explicitly authorizes it,
  perform the skill's structured self-review locally if no reviewer agent is
  authorized. Re-run affected focused tests and `pnpm verify` after fixes.

- [ ] **Step 8: Final implementation commit**

  If final fixes exist, inspect `git diff --name-only`, stage only the specific
  owned fix files, and commit as
  `fix(pdf): close calculation export verification gaps`. Skip this commit when
  no final fixes exist. Do not commit `tmp/pdfs/`.

## Final Acceptance Evidence

- Generic contracts/domain/schema/API/worker paths contain no retained
  Matrix-only job implementation.
- Baseline migration resets a verified local database and both real persistence
  integration suites pass.
- Matrix routes remain compatible and enforce current checksum on download.
- Numerology individual and compatibility PDFs contain the complete canonical
  Pythagorean result, without fabricated 1-10 force-line scores.
- Only the current approved interpretation may appear; AI commercial metadata
  never appears.
- Recalculation blocks the old download immediately and produces a delayed,
  idempotent private-object cleanup event.
- Worker retry, permanent failure, observability, readiness, graceful shutdown,
  and `60s` Compose grace behavior are tested.
- `pnpm verify` passes from repository root.
- PDF text/metadata and every rendered page have been inspected.
- The actual individual and compatibility flows pass in the already authorized
  Computer Use tab on port `5174`.
