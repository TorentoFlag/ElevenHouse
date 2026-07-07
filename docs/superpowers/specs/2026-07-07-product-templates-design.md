# Product Templates Design

Date: 2026-07-07
Status: design ready for user review
Scope: platform product templates, product creation flow, seed data, contracts, db, astrologer workspace

## Goal

Create a production foundation for default expert product templates. Templates
are platform-owned starting points that an expert can choose and adapt into
their own draft product. They are not demo products, not products owned by a
fake user, and not frontend-only defaults hidden in React code.

The first release should make product creation easier for many expert types:
astrologers, psychologists, coaches, mentors, educators and other service
providers. Template wording must therefore describe the product mechanics rather
than a narrow expertise domain.

## Inputs Reviewed

- User decision on 2026-07-07: build the correct platform-template contour.
- `AGENTS.md`
- `docs/development/agent-runbooks/00-task-intake.md`
- `docs/development/agent-runbooks/04-database-and-migrations.md`
- `docs/development/agent-runbooks/05-api-contracts-security.md`
- `packages/db/scripts/seed.ts`
- `packages/db/src/schema/products/*`
- `packages/db/src/adapters/products/drizzle-products-store.ts`
- `packages/contracts/src/products.ts`
- `packages/validation/src/products/index.ts`
- `apps/astrologer-web/src/features/products/model/productDraft.ts`
- `apps/astrologer-web/src/features/products/model/productTypeDefinitions.ts`
- `apps/astrologer-web/src/features/products/model/productCopy.ts`

## Product Principles

1. A template is platform-owned seed data. A product is expert-owned business
   data.
2. Applying a template creates a normal draft product for the signed-in expert.
   The resulting product must be editable, publishable, duplicatable and
   archivable through the existing product flow.
3. Templates must be profession-neutral. They can mention sessions, questions,
   materials, lessons, access and support, but not astrology-specific concepts
   such as natal chart or lunar forecast.
4. Templates must respect existing product type invariants. For example,
   subscription templates create `sub/async` products and package templates
   create `pack/live` products.
5. Templates are idempotent seed data. Re-running seed updates platform
   template copy and payload without creating duplicates.
6. Existing expert products are not rewritten when a template seed changes.
7. Template API responses are read-only to astrologer users. Admin editing is a
   future internal workflow and does not belong in `astrologer-api`.
8. The existing frontend default drafts may remain as a local resilience layer,
   but the product creation UI should prefer server-provided templates once the
   template API exists.

## Release Slice

### Included

- Platform product template schema and seed data.
- RU and EN template copy from the start.
- Read-only astrologer API to list active templates.
- API command to create a draft product from a selected template.
- Shared contracts for template list and create-from-template responses.
- Domain use case that applies a template payload through the same product
  validation and persistence path as manual product creation.
- `astrologer-web` product creation flow using templates as the first step.
- Tests for seed data validity, contract parsing, domain behavior, API behavior
  and frontend mapping.

### Deferred

- Admin UI for editing templates.
- Per-expert custom template libraries.
- Marketplace or public template discovery.
- AI-generated product templates.
- Template analytics, popularity scoring and personalization.
- Template version history in the UI.

## Template Catalog

The initial seed set should be broad enough to support the current product
types without overfitting to a specific profession.

| Code | Type | RU title | Purpose |
| --- | --- | --- | --- |
| `individual_consultation` | `single` | Индивидуальная консультация | One live 1:1 session with a clear result. |
| `quick_answer` | `mini` | Быстрый ответ | A compact paid answer to one question. |
| `recorded_review` | `async` | Разбор в записи | Client sends context, expert returns a recording or file. |
| `consultation_package` | `pack` | Пакет встреч | Several sessions sold together with a package benefit. |
| `mini_course` | `course` | Мини-курс | Lessons, materials and practice without a large course setup. |
| `expert_subscription` | `sub` | Подписка эксперта | Recurring access to content, channel or community. |
| `custom_format` | `custom` | Свой формат | Flexible full constructor starter for complex offers. |

Template payload examples:

- `individual_consultation`: `single`, once, live, 60 minutes, video, question,
  included items: consultation, action plan, recording or summary.
- `quick_answer`: `mini`, once, instant, chat/text, question, included items:
  one question, concise answer, response window.
- `recorded_review`: `async`, once, async, video/file, question/event,
  included items: recorded review, written notes, response deadline.
- `consultation_package`: `pack`, pack, live, 3 sessions, video/chat,
  included items: three meetings, between-session support, package validity.
- `mini_course`: `course`, once, async, video/file, course access, included
  items: lessons, workbook/materials, practice task.
- `expert_subscription`: `sub`, subscription, async, month, channel/content,
  included items: regular materials, closed channel, monthly live session.
- `custom_format`: `custom`, full constructor seed with neutral title,
  one-time payment, flexible delivery and no narrow method assumptions.

## Data Model

Add platform-owned template tables under the products module:

- `product_templates`
  - `id uuid primary key`
  - `code text not null`
  - `type text not null`
  - `status text not null` with values `active`, `archived`
  - `title text not null`
  - `subtitle text`
  - `description text`
  - `locale text not null` with values `ru`, `en`
  - `sort_order integer not null`
  - `payload jsonb not null`
  - `created_at timestamptz not null`
  - `updated_at timestamptz not null`

Use one row per locale and code. The unique identity is `(code, locale)`. The
payload stores a create-product-compatible template body without owner-specific
fields, media ids or status. It should be parsed through shared product
contracts before it can create a product.

Rationale: a single JSON payload avoids duplicating every product child table
for platform templates while still keeping the resulting product normalized in
the existing `products` tables after creation. This is acceptable because
templates are read-mostly seed data and not transactional sales objects.

## Domain Model

Add a product-template domain contour:

- `ProductTemplate`
- `ProductTemplateStore`
- `listProductTemplates`
- `createProductFromTemplate`

`createProductFromTemplate` receives the signed-in expert id, template code,
locale and current time. It loads an active template, parses and normalizes the
template payload as a `CreateProductRequest`, converts it to `ProductCreateInput`
with the caller as `ownerUserId`, and creates a draft product through the
existing `ProductStore`.

Expected failures:

- template not found or archived -> not found;
- invalid template payload -> domain validation error;
- product store failure -> propagated through existing product error mapping.

## API Surface

Add routes to `astrologer-api` because these are authenticated workspace
actions:

- `GET /products/templates?locale=ru`
  - returns active templates ordered by `sortOrder`;
  - does not expose archived templates;
  - does not require CSRF because it is read-only.

- `POST /products/templates/:templateCode/drafts`
  - creates a draft product owned by the signed-in expert;
  - requires CSRF because it mutates state;
  - returns the normal `ProductResponse`;
  - must not accept `ownerUserId`, status or arbitrary payload overrides from
    the caller.

No public-api route is needed in this release. No admin-api route is added until
the admin backend exists.

## Frontend Flow

Update the `astrologer-web` product creation flow:

1. The create modal loads platform templates.
2. The first screen presents template cards grouped or labeled by product type.
3. Selecting a template can either:
   - open a local draft prefilled from the template payload; or
   - call create-from-template immediately and open the saved draft.

Recommended behavior for this release: call create-from-template immediately
and open the saved draft. It guarantees the user is editing a real server draft,
keeps media/upload/update behavior consistent, and avoids a split between
unsaved template state and saved product state.

If templates fail to load, the modal can still expose existing product-type
creation as a secondary action, but the error must be visible. This is a
resilience path, not a fake success.

## Seed Strategy

Add `packages/db/scripts/product-template-seed-data/` with an `index.ts`
facade, mirroring the dictionary seed structure. `packages/db/scripts/seed.ts`
upserts templates by `(code, locale)` and updates copy, payload, status and
sort order.

Seed data must be validated in tests before insertion:

- unique `(code, locale)`;
- active templates have non-empty copy;
- payload parses as `CreateProductRequest`;
- payload type matches the template type;
- no `coverMediaId`, owner id or status inside payload;
- templates cover all current product types.

## Migration Strategy

This is a schema change. Follow the repository Drizzle policy:

1. Add schema in `packages/db/src/schema/products/`.
2. Export it from the products schema index.
3. Regenerate the current migration with the repo script.
4. Reset the local development DB only after an explicit user request or when
   required for verification.

The migration should include:

- `product_templates` table;
- `(code, locale)` unique constraint;
- status, type, locale and sort-order checks;
- index for active locale listing.

## Testing

Minimum verification:

- product template seed data tests;
- schema/migration test proving the table, unique constraint and checks exist;
- db adapter integration test for listing and applying templates;
- domain tests for not-found, archived and invalid-payload behavior;
- contracts tests for list response and create-from-template request/response;
- API service/controller tests for auth context, CSRF on POST and no caller
  owner override;
- frontend model tests for template grouping and create flow state;
- targeted browser QA for selecting a template, editing the draft and saving.

Use `corepack pnpm` for repo commands.

## Acceptance Criteria

- A fresh development seed inserts the platform product templates.
- An astrologer can list active templates in their workspace.
- An astrologer can create a draft product from any active template.
- The created product belongs to the signed-in astrologer.
- The created product passes the same product contracts and invariants as a
  manually created product.
- Templates are profession-neutral and available in RU and EN.
- Re-running seed updates templates without duplicates.
- Existing products are not modified by template seed changes.
