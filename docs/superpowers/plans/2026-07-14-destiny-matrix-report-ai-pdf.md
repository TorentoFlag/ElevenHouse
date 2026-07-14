# Destiny Matrix Report, AI Draft And PDF Implementation Plan

> Execute locally without subagents. Use strict TDD, preserve user changes, and
> do not reset or migrate a database without separate explicit authority.

**Goal:** Complete the remaining Matrix backend with an editable checksum-bound
report, schema-constrained AI drafting, and private idempotent asynchronous PDF
generation.

**Architecture:** `Matrix` owns the strict report model, report persistence port,
AI context construction, PDF job model and API orchestration. The existing
provider-neutral `AiGenerationService` remains the only OpenAI integration and
uses Structured Outputs. PostgreSQL stores one current report per owned Matrix
and durable PDF job state. An outbox relay publishes a deterministic BullMQ job
to `apps/workers`; the worker renders a private PDF, uploads it to the private
object-storage bucket, and atomically completes the media/calculation artifact.

**External guidance used:**

- OpenAI Structured Outputs: strict JSON Schema, explicit refusal handling and
  Zod/schema alignment.
- OWASP prompt-injection guidance: treat selected notes as untrusted data,
  clearly separate instructions and data, validate output and retain explicit
  human approval.
- BullMQ idempotent-job guidance: atomic/simple processors and deterministic
  custom job ids.
- Playwright PDF guidance informed the print contract, but the worker uses a
  pure Node renderer so deployment does not acquire an undeclared Chromium
  runtime dependency.

## Product And Safety Constraints

- Reports exist only for saved owner-scoped `matrix` / `ladini_22`
  calculations.
- One current report is retained. Every save increments `revision` and binds the
  report to the current result checksum.
- `stale` is derived by comparing report and calculation checksums.
- AI always creates a `draft`; only an explicit astrologer save can set `ready`.
- AI receives the validated Matrix result, catalog summaries, locale, optional
  projection, participant first names/neutral labels, and explicitly selected
  current note excerpts. It receives no full CRM rows, contact data or unrelated
  notes.
- Selected stale or unknown notes are rejected.
- Notes are delimited as untrusted data. The model has no tools and cannot save,
  link, mark ready, generate PDF or message a client.
- Provider failure or malformed/refused output never overwrites the current
  report.
- PDF generation requires a current `ready`, non-stale report and an expected
  result checksum.
- PDF jobs are idempotent by owner, calculation, report revision, result
  checksum and locale. Retries must converge on one ready artifact.
- PDFs are private. Download uses an authenticated short-lived signed URL; no
  public or publication route is added.
- Future chat remains frontend-only disabled UI and sends no request.

## Task 1: Strict Report And PDF Contracts

Create `packages/contracts/src/matrix-report.ts` and tests, then export it.

Define strict schemas for:

- report content with all required sections and nullable year projection;
- GET response with nullable report, current checksum and derived stale state;
- manual save `{ locale, status, content, expectedResultChecksum }`;
- AI draft request `{ locale, noteIds, projectionYear, expectedResultChecksum }`;
- PDF enqueue request and job response;
- authenticated download response with a short-lived URL and expiry.

RED: reject unknown fields, blank/oversized sections, duplicate note ids,
invalid locale/status/checksum and malformed PDF state. GREEN: contracts and
package typecheck. Commit `feat: define Matrix report contracts`.

## Task 2: Report Domain And AI Context

Add report types, store port, use cases, plain-text projection and AI-context
builder under `packages/domain/src/matrix/report/`.

RED tests:

- get/upsert remain owner + calculation scoped;
- manual save normalizes content, increments revision through the store and
  binds current checksum;
- AI context exposes only allowed fields and explicitly selected note excerpts;
- stale notes are excluded/rejected by orchestration input;
- report staleness is derived and recalculation never deletes content;
- PDF eligibility rejects draft/stale reports.

Commit `feat: add Matrix report domain`.

## Task 3: Schema-Constrained AI Prompt

Create `packages/ai/src/prompts/matrix-report-draft.v1.ts` and tests.

- `qualityDraft` model profile, RU/EN, bounded output tokens;
- exact report-content Zod schema and matching strict JSON schema;
- system prompt forbids medical/legal/financial/fatalistic guarantees;
- notes and participant labels are escaped, delimited and declared data;
- no tools or actions;
- prompt id/version are persisted with output.

Commit `feat: add Matrix report AI prompt`.

## Task 4: Persist Reports And Durable PDF Jobs

Add `matrix_report_drafts` and `matrix_pdf_jobs`, owner-composite foreign keys,
checks, indexes and a Drizzle adapter. Extend media purpose with private
`matrix_report_pdf`, add generated-media creation/completion methods, and add
calculation-artifact create/complete/fail operations needed by the worker.

The PDF enqueue transaction creates or reuses the deterministic job, processing
media row, generating calculation artifact and outbox event. Regenerate only the
single checked-in baseline. Do not run `db:reset` or `db:migrate`.

Commit `feat: persist Matrix reports and PDF jobs`.

## Task 5: Expose Report, AI And PDF API

Routes:

```text
GET  /matrix/calculations/:calculationId/report
PUT  /matrix/calculations/:calculationId/report
POST /matrix/calculations/:calculationId/report/ai-draft
GET  /matrix/calculations/:calculationId/report/pdf
POST /matrix/calculations/:calculationId/report/pdf
GET  /matrix/calculations/:calculationId/report/pdf/:jobId/download
```

GET routes require authentication but no CSRF. PUT/POST require CSRF. AI uses
the existing rate limit, safety identifier, `store: false`, refusal/error
mapping and usage recorder. The download route verifies owner/calculation/job
before issuing a short-lived private signed URL.

Commit `feat: expose Matrix report and PDF workflow`.

## Task 6: Idempotent PDF Worker

Generalize outbox claims by explicit event type so notification and PDF relays
cannot steal each other's events. Add BullMQ queue/relay/processor to
`apps/workers` with deterministic job ids and bounded exponential retries.

The processor:

1. locks/claims the queued job;
2. revalidates report revision, checksum, ready and non-stale state;
3. renders a deterministic A4 PDF using a bundled Cyrillic-capable font;
4. uploads bytes to the private bucket with checksum metadata;
5. atomically marks media, artifact and job ready;
6. records bounded failure state on final failure.

Unit-test duplicate jobs, retry convergence, stale input, rendering, escaping,
upload metadata and state transitions. Commit `feat: generate private Matrix PDFs`.

## Task 7: Documentation And Verification

Synchronize backend modules, API boundaries, deployment/worker docs, design
inventory and Matrix production status.

Run targeted suites, then:

```bash
pnpm verify
git diff --check
git status --short
```

No live AI call is required for deterministic tests; provider behavior is
verified through the existing injected client boundary. No DB reset/migration
application is performed. Commit `docs: record Matrix report backend`.
