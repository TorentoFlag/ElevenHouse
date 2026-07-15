# Calculation PDF Export Design

Date: 2026-07-15
Status: approved product and architecture design; implementation pending
Scope: one production PDF export contour for saved Matrix, Numerology, and
future calculation methods

> This document is an implementation design artifact. After implementation,
> durable decisions must also be reflected in the canonical architecture, API,
> deployment, testing, and product documents.

## 1. Purpose

Replace the Matrix-specific PDF pipeline with one calculation-owned export
pipeline and add complete Pythagorean Numerology PDF export. A future method,
such as Vedic Numerology, must join this contour by supplying a typed source
assembler and renderer rather than copying queue, storage, job, API, or
observability infrastructure.

The feature is complete when an authenticated astrologer can request, monitor,
and download a private PDF for any current saved Numerology calculation while
the existing Matrix PDF routes continue to work through the same internal
pipeline.

## 2. Locked Product Decisions

- PDF export is available for every current saved calculation. An approved
  interpretation is optional.
- If a current approved interpretation exists, the PDF includes it. Draft,
  unapproved, or unsaved interpretation text is excluded.
- If more than one interpretation is approved, select exactly one current
  interpretation by `approved_at DESC`, then `updated_at DESC`, then `id DESC`.
- A draft does not block export of the deterministic calculation report.
- Recalculation invalidates the previous PDF immediately. An old PDF is not a
  calculation version and cannot remain downloadable.
- The active application locale selects the document locale. There is no PDF
  setup modal or method-specific export configuration.
- Numerology individual and compatibility modes are both supported.
- The canonical Numerology toolbar and three-column result layout remain
  unchanged apart from enabling the existing PDF action and its states.
- AI provider, model, prompt, prompt metadata, and internal provenance are not
  exposed in the PDF, API response, queue payload, file name, or UI.
- There is no calculation-method version history and no retained legacy PDF
  implementation.

## 3. Sources And Research

The design follows, in precedence order:

1. The user's decisions in the Numerology production-completion workflow.
2. ElevenHouse architecture, worker, database, media, security, and design
   runbooks.
3. The current Matrix PDF implementation as migration input, not as an
   architecture boundary to preserve.
4. Official BullMQ guidance for production workers, idempotency, retries,
   graceful shutdown, events, metrics, and CPU-heavy processors.
5. AWS guidance for transactional outbox and private presigned S3 downloads.
6. Docker Compose shutdown semantics.

Primary references:

- https://docs.bullmq.io/guide/going-to-production
- https://docs.bullmq.io/patterns/idempotent-jobs
- https://docs.bullmq.io/guide/retrying-failing-jobs
- https://docs.bullmq.io/guide/workers/graceful-shutdown
- https://docs.bullmq.io/guide/workers/sandboxed-processors
- https://docs.bullmq.io/guide/events
- https://docs.bullmq.io/guide/metrics
- https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- https://docs.docker.com/reference/compose-file/services/#stop_grace_period

## 4. Current-State Findings

The existing implementation already provides useful production foundations:

- `apps/workers` is a deployable Node process and a separate production
  container from `astrologer-api`;
- Matrix PDF creation uses BullMQ, PostgreSQL, a transactional outbox, private
  object storage, bounded retries, deterministic job ids, readiness checks,
  and graceful signal handlers;
- calculation artifacts and private Media assets already model the generated
  file;
- authorized downloads already use a five-minute presigned URL.

The migration must also resolve these directly related gaps:

- `matrix_pdf_jobs` makes a Matrix implementation detail the queue and schema
  boundary, so adding methods would duplicate the workflow;
- calculation replacement deletes `calculation_artifacts`, while the Matrix
  job has an `ON DELETE RESTRICT` artifact foreign key;
- Matrix download authorization verifies ownership and readiness but does not
  require the job checksum to equal the current calculation checksum;
- worker and queue `error`, `failed`, and `stalled` events are not explicitly
  observed;
- the outbox relay in flight is not awaited during shutdown;
- production Compose has no worker-specific `stop_grace_period`, so the Docker
  default is ten seconds;
- retries have exponential backoff but no jitter and do not distinguish
  permanent input errors from transient infrastructure errors;
- Redis AOF and `maxmemory-policy=noeviction` are external production
  requirements but are not currently expressed as an operational invariant.

The existing renderer is not CPU-heavy enough to justify sandboxing now. A
local targeted test performed three renders, including a long multi-page
Cyrillic report, in 178 ms total test time. The design keeps rendering behind a
port so that a sandboxed process or worker-thread pool can be introduced without
changing the API, job schema, or calculation modules if production metrics show
material event-loop blocking or stalled jobs.

## 5. Chosen Architecture

### 5.1 Ownership

`Calculations` owns the generic export lifecycle:

- PDF eligibility for a saved, current, owner-scoped calculation;
- job identity and status;
- idempotency and current-result checks;
- calculation artifact association;
- invalidation on recalculation;
- public-safe job and download contracts.

Method modules own only method-specific source assembly and rendering:

- `Matrix` supplies its current ready report source and Matrix renderer;
- `Numerology` supplies the validated Pythagorean result, optional current
  approved interpretation, and Numerology renderer;
- a future method supplies the same two ports.

`Media` owns private object metadata and short-lived authorized downloads.
`apps/workers` owns asynchronous execution, retries, upload, and completion.

### 5.2 Generic Ports

The domain exposes focused interfaces equivalent to:

- `CalculationPdfJobStore`: enqueue/reuse, owner-scoped lookup, worker claim,
  completion, terminal failure, and invalidation;
- `CalculationPdfSourceAssembler`: validate the current calculation and turn a
  method-specific source locator into a typed render document;
- `CalculationPdfRenderer`: render one validated document to bytes and return
  page-count metadata;
- `CalculationPdfObjectStorage`: idempotently put and delete a private PDF.

The worker composition root registers assemblers and renderers by the existing
`calculation_records.module` and `method_code`. Unsupported pairs fail as
permanent configuration errors; there is no generic formula DSL.

### 5.3 Process Boundary

The API never renders a PDF. It commits the job and outbox event, then responds
with job state. The separate `apps/workers` process relays the event to Redis,
claims the database job, assembles the authoritative current source, renders,
uploads, and records completion.

The initial implementation keeps the pure renderer in the worker event loop
with bounded concurrency. This matches measured workload. The renderer port is
the explicit future isolation seam if job-duration or stalled-event evidence
requires a sandboxed processor.

## 6. Persistence Model

### 6.1 `calculation_pdf_jobs`

Replace `matrix_pdf_jobs` with one generic table containing:

- `id`;
- `calculation_id` and `owner_user_id` with a composite owner foreign key;
- `module` and `method_code`, copied from the locked current calculation for
  dispatch and integrity checks;
- `result_checksum`;
- `locale` (`ru | en`);
- a bounded `source_locator` JSON object containing identifiers and checksums,
  never names, birth data, report text, or AI metadata;
- `document_fingerprint`, a SHA-256 digest of the result checksum, locale,
  selected approved content identity, and currently deployed render contract;
- `status` (`queued | processing | ready | failed`);
- `artifact_id` and `media_asset_id`;
- bounded internal `failure_code` and `failure_reason`;
- created and updated timestamps.

The deployed render-contract input exists only to invalidate cached output when
the current PDF layout or content contract changes. It is not exposed as a
product version, does not select old behavior, and does not retain an old
renderer.

A partial unique index covers owner, calculation, result checksum, locale, and
document fingerprint for every non-failed job. PostgreSQL is the authoritative
idempotency boundary. Redis job id uniqueness is an additional delivery guard,
not the source of truth.

### 6.2 Source Locators

Source locators are strict discriminated objects validated before persistence
and again in the worker:

- Matrix: report id, report revision, report result checksum, and locale;
- Numerology: optional approved interpretation id plus the calculation result
  checksum; `null` means a deterministic report without an approved
  interpretation.

The full render payload is not stored in the job or Redis. The worker loads the
current owner-scoped source from PostgreSQL and rejects a locator that is stale,
missing, or inconsistent.

### 6.3 Artifacts And Media

- Continue using `calculation_artifacts` with `artifact_type = 'pdf'`.
- Replace the Matrix-specific media purpose with
  `calculation_report_pdf`.
- Store every object in the private bucket under an owner/job-scoped key.
- Do not expose storage bucket or key through frontend contracts.
- Store MIME type, byte size, SHA-256 checksum, and ready/failed state.

### 6.4 Recalculation And Cleanup

Calculation replacement remains one-current-result behavior:

1. Lock the current owner-scoped calculation.
2. Record private object-deletion outbox events, identified only by Media asset
   id, for its PDF artifacts.
3. Remove the generic PDF jobs and calculation artifacts in a foreign-key-safe
   order within the same transaction that replaces the result.
4. Make every previous download endpoint fail current-checksum validation as
   soon as the transaction commits.
5. Keep the now-unreferenced private Media rows until the cleanup worker loads
   them by id, then delete invalidated objects and their Media rows
   asynchronously and idempotently after a safety delay. Reconcile failed
   deletions.

The safety delay prevents a rare in-flight upload from recreating an object
after deletion. These inaccessible objects are cleanup work, not user-visible
history. No previous result or renderer remains selectable.

## 7. Events, Queue, And Worker Execution

### 7.1 Event And Queue

- Outbox event: `calculation.pdf.requested.v1`.
- Event aggregate: generic PDF job id.
- Event payload: job id only.
- Queue: `calculation.pdf`.
- Job name: `render-calculation-pdf`.
- BullMQ job id: deterministic from the database job id.

Job, artifact, Media asset, and outbox event are created atomically. The relay
claims events in bounded batches, handles abandoned publishing locks, and marks
an event published only after BullMQ accepts it.

### 7.2 Processing Sequence

1. Load job by globally unique id inside the worker only.
2. Return immediately if the database job is already ready.
3. Atomically claim queued/processing work and validate current calculation,
   owner, module, method, checksum, source locator, artifact, and private Media
   asset.
4. Assemble a typed render document through the method registry.
5. Render deterministic bytes.
6. Compute SHA-256 and upload to the fixed private storage key.
7. Atomically mark the job, artifact, and Media asset ready with byte and page
   metadata.

If upload succeeds but database completion fails, a retry overwrites the same
private key with deterministic output and safely attempts completion again.

### 7.3 Retry Classification

Retry with bounded exponential backoff and jitter for transient PostgreSQL,
Redis, network, and object-storage failures.

Fail without further retries for:

- missing, archived, or unsupported calculation;
- changed result checksum;
- stale or invalid source locator;
- invalid persisted method result;
- unsupported locale or renderer key;
- document input exceeding explicit size bounds;
- deterministic renderer validation errors.

The database is marked failed before a BullMQ unrecoverable failure is emitted.
A failed job does not block a later fresh request.

### 7.4 Concurrency And Shutdown

- Keep bounded worker concurrency, initially the existing default of two.
- Do not add a fake Promise timeout that cannot interrupt CPU-bound JavaScript.
- Record duration and stalled events. Introduce sandboxing only on measured
  need.
- On `SIGINT` or `SIGTERM`, stop the relay timer, await an in-flight relay,
  close the BullMQ worker so active jobs finish, then close queue, health server,
  and PostgreSQL.
- Configure a production `stop_grace_period` long enough for bounded PDF work;
  the initial value is 60 seconds.

## 8. API Contracts

### 8.1 Shared Public Shape

Move public-safe PDF job and download schemas into a calculation PDF contract
that method contracts can reuse. Public job fields are:

- id;
- calculation id;
- result checksum;
- locale;
- status;
- artifact and Media ids, retained for the existing Matrix contract but never
  accepted as authorization by themselves;
- public-safe failure code and message;
- created and updated timestamps.

Do not expose module-internal source locators, storage keys, fingerprints,
provider metadata, or raw internal failure details.

### 8.2 Matrix Compatibility

Keep the existing Matrix HTTP paths and frontend behavior:

- `GET /matrix/calculations/:calculationId/report/pdf`;
- `POST /matrix/calculations/:calculationId/report/pdf`;
- `GET /matrix/calculations/:calculationId/report/pdf/:jobId/download`.

They delegate to the generic calculation PDF use cases after Matrix verifies its
ready report source. Matrix PDF content remains unchanged in this migration;
only infrastructure and current-result safety change.

### 8.3 Numerology Routes

Add the equivalent Numerology routes:

- `GET /numerology/calculations/:calculationId/report/pdf`;
- `POST /numerology/calculations/:calculationId/report/pdf`;
- `GET /numerology/calculations/:calculationId/report/pdf/:jobId/download`.

The enqueue request contains `expectedResultChecksum` and `locale`. Status GET
accepts the same `locale` as a strict query parameter so RU and EN artifacts do
not replace each other in the UI. Mutation requests use cookie authentication
and CSRF; the database partial unique index makes repeated POST requests
idempotent without requiring a new frontend header convention.

GET returns the latest job applicable to the current calculation and locale, or
`null`. Download requires all of the following:

- authenticated owner;
- matching calculation and job ids;
- current non-archived calculation;
- job result checksum equal to the current calculation checksum;
- ready job, artifact, and private Media asset;
- expected generic PDF media purpose.

Only then does the API create a new five-minute presigned download URL.

## 9. Numerology Document Contract

### 9.1 Shared Content

Every Numerology PDF includes:

- ElevenHouse branding, document title, locale, and page numbering;
- calculation mode and Pythagorean method name;
- participant calculation name and date of birth, without CRM contact data;
- selected period/year where the saved result contains it;
- a concise symbolic/non-diagnostic disclaimer.

Birth time and place are not presented as Pythagorean formula inputs because
the active method does not use them. They remain client data, not invented
calculation factors.

### 9.2 Individual Mode

Render all persisted, validated Pythagorean output available to the product:

- all five key numbers: life path, birthday, expression, soul, and personality;
- requested personal year, all twelve personal months, and personal day when
  each respective value exists;
- psychomatrix source digits, four working numbers, and all nine digit cells;
- all eight force lines with cells, raw value, level, and level label;
- method explanation sufficient to understand how the displayed values were
  produced;
- the current approved interpretation, if one exists, under a neutral
  astrologer-approved heading.

Force-line values remain method values. They are not converted into a false
1-to-10 score.

### 9.3 Compatibility Mode

Render:

- both participant identities and dates of birth;
- both complete individual results using the fields above;
- pair number;
- all 22 typed comparisons, including block, code, both values, difference,
  relation, and explanation;
- all four compatibility zones with comparison codes, counts, relation, and
  explanation;
- key-number, psychomatrix, strength-line, and total relation counts;
- the typed compatibility conclusion with its counts and explanation;
- the current approved compatibility interpretation, if one exists.

### 9.4 Draft Exclusion

If no approved interpretation exists, omit the interpretation section. Do not
print an empty section, draft text, source type, model id, prompt identifier, or
approval workflow metadata.

## 10. PDF Rendering And Visual System

- Keep TypeScript rendering in `apps/workers` and reuse the proven `pdf-lib`,
  Fontkit, and bundled Onest fonts.
- Extract shared branded PDF layout primitives from the Matrix renderer only
  where they are genuinely cross-method: page setup, fonts, wrapping,
  headings, cards/tables, footers, and pagination.
- Keep method-specific document composition in separate renderer files.
- Render A4 portrait with deterministic metadata based on job creation time.
- Treat all saved interpretation markup as inert text. Emit no JavaScript,
  attachments, forms, remote resources, or executable actions.
- Bound text lengths, list sizes, table dimensions, and total render input.
- Support Cyrillic and Latin output, long participant names, page breaks, and
  multi-page compatibility content without clipping.

## 11. Frontend UX

The existing toolbar action is wired without changing the page composition.

States:

- unsaved preview: disabled `PDF`, tooltip `Сначала сохраните расчёт`;
- saved/current and no job: enabled `PDF`;
- enqueue/polling: disabled `PDF готовится…` with progress affordance;
- current ready job: enabled `Скачать PDF`;
- failed job: visible non-technical error and `Повторить`;
- recalculated or checksum-stale result: clear old job state and refetch;
- network polling error: retain recoverable state and allow retry.

Clicking `Скачать PDF` requests a fresh authorized URL and downloads the file.
The UI never stores or reuses an expired presigned URL. Refreshing the page
restores the latest current job through GET polling state.

The interpretation editor remains independent:

- a draft or dirty unapproved edit does not disable deterministic PDF export;
- only persisted approved text can be included;
- approving a different current interpretation changes the document
  fingerprint, so the next request creates the new current PDF.

## 12. Error Semantics

Map internal errors to stable public categories:

- `CALCULATION_PDF_NOT_FOUND`;
- `CALCULATION_PDF_NOT_READY`;
- `CALCULATION_RESULT_CHANGED`;
- `CALCULATION_PDF_SOURCE_STALE`;
- `CALCULATION_PDF_UNSUPPORTED`;
- `CALCULATION_PDF_GENERATION_FAILED`.

The UI receives localized safe messages. Logs retain job id, calculation id,
method key, attempt, duration, and normalized internal failure classification,
but not participant names, birth data, interpretation text, presigned URLs,
storage credentials, or AI metadata.

## 13. Observability And Operations

Add structured events for:

- outbox publish success/failure and delay;
- job queued, active, completed, failed, retried, and stalled;
- render duration, page count, and byte size;
- S3 upload and cleanup duration/failure;
- queue depth and oldest queued age where the current observability stack can
  expose them without adding a parallel monitoring system.

Readiness checks PostgreSQL, Redis queue, and BullMQ worker connectivity.
Liveness reports only process health. A dependency outage makes readiness fail
without pretending the worker is healthy.

Production Redis must use persistence appropriate to the environment, with AOF
enabled and `maxmemory-policy=noeviction`. This is a deployment prerequisite
and must be documented and verified separately from application tests.

## 14. Verification Strategy

Follow TDD from narrow contracts outward.

### 14.1 Domain And Contracts

- public schema acceptance/rejection;
- strict source-locator validation;
- current-checksum eligibility;
- approved interpretation selection and draft exclusion;
- idempotent enqueue/reuse;
- failed-job replacement;
- unsupported renderer handling.

### 14.2 Database

- composite owner and calculation constraints;
- unique non-failed document identity;
- atomic job/artifact/media/outbox creation;
- worker claim and completion transitions;
- retry-safe completion;
- recalculation after a ready or processing PDF;
- foreign-key-safe invalidation and object-deletion outbox creation;
- owner isolation.

### 14.3 Worker

- generic registry dispatch for Matrix and Numerology;
- transient retry and permanent failure classification;
- duplicate delivery and ready short-circuit;
- upload-success/completion-failure replay;
- error/failed/stalled listeners;
- graceful shutdown awaiting an in-flight relay;
- RU/EN rendering, deterministic bytes, and inert markup.

### 14.4 API And Frontend

- authentication, CSRF, ownership, checksum, and archived-state errors;
- individual and compatibility enqueue/status/download;
- no-approved-interpretation success;
- approved-interpretation inclusion;
- disabled preview tooltip;
- generating, ready, failed, retry, refresh, and recalculation states;
- no exposure of internal metadata.

### 14.5 PDF Evidence

For representative individual and compatibility fixtures in RU and EN:

1. Generate the real PDF through the worker path.
2. Inspect metadata and page count with `pdfinfo`.
3. Extract text with `pdftotext` or `pypdf` to confirm required sections and
   draft exclusion.
4. Render every page to PNG with Poppler.
5. Visually inspect typography, spacing, long names, matrices, tables,
   wrapping, section transitions, footers, page numbering, and absence of
   clipping or black-square glyphs.

Final browser evidence uses the already-open authenticated Chrome tab on
`localhost:5174` through Computer Use. It covers one individual PDF and one
compatibility PDF without approving or exposing unrelated client data.

### 14.6 Verification Ladder

Run targeted tests and typechecks first, then the full repository verification
required by the ElevenHouse runbook. Do not claim completion if worker-backed
generation, private download, PNG inspection, or browser flow remains untested.

## 15. Schema And Deployment Work

This design changes the database schema. Implementation must:

1. verify the active local ElevenHouse PostgreSQL instance and actual Docker
   port using the canonical commands;
2. rebuild the current baseline migration rather than append an incremental
   ALTER chain;
3. perform the destructive local `db:reset` only against the verified local
   database;
4. seed the required local test data;
5. verify Matrix and Numerology paths after reset;
6. update the worker image, runtime environment names, Compose grace period,
   deployment examples, and operational documentation.

Runtime settings become calculation-generic rather than Matrix-specific. The
existing values remain initial defaults: relay interval 1 s, batch size 25,
five attempts, 1 s exponential backoff seed, concurrency two, and a 60 s
container shutdown grace period.

## 16. Deliberately Out Of Scope

- client-cabinet publication or public PDF links;
- email, chat, Telegram, or notification delivery;
- password-protected PDFs or digital signatures;
- batch export and ZIP archives;
- custom templates, logos, color pickers, or PDF setup modal;
- historical calculation/PDF browsing;
- browser print-to-PDF;
- moving rendering into a new microservice;
- sandboxed rendering without production CPU/stall evidence;
- adding Vedic formulas or UI in this implementation.

## 17. Acceptance Criteria

- Matrix and Numerology use one calculation PDF job, outbox, queue, storage,
  and worker infrastructure.
- Matrix-specific PDF job schema and duplicated worker implementation are
  removed.
- Existing Matrix routes remain functional and current-checksum safe.
- Saved Pythagorean individual and compatibility calculations produce complete
  RU/EN PDFs.
- Approved interpretation is included; draft and internal AI metadata are not.
- Unsaved previews cannot enqueue; current saved calculations can.
- Repeated requests do not create duplicate active/ready artifacts.
- Recalculation is not blocked by PDF foreign keys and immediately revokes old
  downloads.
- Private URLs are owner-authorized, generated on demand, and expire after the
  configured short TTL.
- Retry, permanent failure, stalled jobs, graceful shutdown, and cleanup are
  observable and tested.
- Generated PDFs pass structural, text, rendered-PNG, and Computer Use browser
  verification.
