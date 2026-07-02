# Astrologer Products Backend Design

Date: 2026-07-02

## Context

This design covers the backend for the astrologer products section in `astrologer-web`.
The `ElevenHouseDesign` folder is only a visual and product reference. Production
code must not reuse its frontend architecture, component boundaries or state model.

The products section is part of the authenticated astrologer surface. It belongs in
`apps/astrologer-api`, not in the transitional `ops-api`. Admin and moderator
workflows remain outside this scope.

Primary local sources reviewed:

- `docs/README.md`
- `docs/architecture/overview.md`
- `docs/architecture/repository-structure.md`
- `docs/architecture/backend-modules.md`
- `docs/architecture/account-role-model.md`
- `docs/api/api-boundaries.md`
- `docs/product/roadmap.md`
- `docs/product/full-functional-scope.md`
- `docs/decisions/0001-monorepo-and-app-boundaries.md`
- `docs/decisions/0003-nestjs-modular-backend.md`
- `docs/decisions/0004-payments-notifications-workers.md`
- `docs/decisions/0006-drizzle-database-tooling.md`
- `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`
- `ElevenHouseDesign/app/products-data.jsx`
- `ElevenHouseDesign/app/products.jsx`
- `ElevenHouseDesign/app/product-constructor.jsx`
- `ElevenHouseDesign/app/mobile-products.jsx`
- `ElevenHouseDesign/uploads/ElevenHouse - Функциональное ТЗ.md`

External primary sources reviewed:

- NestJS modules, providers, authorization, CSRF and OpenAPI docs.
- Drizzle schema and migration docs.
- OWASP CSRF Prevention Cheat Sheet.
- Stripe idempotency docs.
- BullMQ idempotent jobs and deduplication docs.

## Product Surface From The Reference

The products page shows an astrologer-owned catalog:

- product count and filters: all, active, draft, archived;
- catalog lifetime summary: active count, total sales, catalog revenue, bestseller;
- product cards with type, status, title, price, unit, delivery format, duration or
  SLA, included items, lifetime sales, lifetime revenue and average rating;
- product actions: edit, status changes, duplicate and copy direct product link.

The constructor creates a full product configuration, not just a display card. The
backend must represent:

- product type: `single`, `pack`, `async`, `sub`, `mini`, `course`, `custom`;
- title, subtitle, cover media and intro video;
- price in minor units and explicit currency;
- delivery formats: `video`, `audio`, `chat`, `text`, `file`, `channel`;
- execution mode: `live`, `async`, `instant`;
- payment model: `once`, `pack`, `sub`, `free`;
- package settings: session count, discount and future validity rules;
- subscription settings: period and trial days;
- duration, SLA, participant mode and group size;
- astrology methods and systems;
- client data requirements;
- access grants;
- included items;
- optional modifiers and whether they create client artifacts;
- status: `draft`, `active`, `archived`.

## Scope

In scope:

- authenticated astrologer product CRUD and status transitions;
- product duplication;
- list, detail and lifetime summary responses;
- contract schemas for API payloads and responses;
- domain use cases and ports;
- Drizzle schema and adapter;
- a lifetime analytics reader port with a null implementation until orders,
  payments and reviews exist.

Out of scope:

- public product purchase flow;
- booking, orders, payments, wallet, subscriptions and reviews implementation;
- product moderation;
- media upload/storage implementation;
- admin product operations;
- period-based analytics and compare views;
- frontend implementation.

## Architecture

Use the existing modular pattern:

```text
apps/astrologer-api/src/modules/products/
  products.module.ts
  products.controller.ts
  products.service.ts
  products.tokens.ts

packages/contracts/src/products.ts
packages/domain/src/products/
packages/db/src/schema/products/
packages/db/src/adapters/products/
```

`ProductsController` remains thin. It handles route binding and delegates to
`ProductsService`. The service parses shared contract schemas, resolves the
authenticated astrologer owner account and calls domain use cases.

`packages/domain` declares product use cases, entities and ports. It must not import
`packages/db`.

`packages/db` owns Drizzle tables, migrations and the concrete store adapter.

## API Surface

All routes require an authenticated astrologer session.

```text
GET  /products
GET  /products/summary
GET  /products/:productId
POST /products
PUT  /products/:productId
POST /products/:productId/publish
POST /products/:productId/move-to-draft
POST /products/:productId/archive
POST /products/:productId/duplicate
```

State-changing routes require CSRF through the existing route policy layer.

Product creation, update and status transitions are state-changing browser routes.
They are not booking/order/payment commands, so they do not require
`Idempotency-Key` in the first implementation. When a route starts creating orders,
bookings, payment attempts or other financial state, it must opt into idempotency.

## Product Model

Use normalized tables for fields that the application needs to query, validate or
evolve independently. Do not store the whole constructor payload as opaque JSON.

Primary table:

- `products.id`
- `products.owner_user_id`
- `products.type`
- `products.status`
- `products.title`
- `products.subtitle`
- `products.price_minor`
- `products.currency`
- `products.cover_media_id`
- `products.intro_video_url`
- `products.execution_mode`
- `products.payment_model`
- `products.duration_minutes`
- `products.duration_label`
- `products.sla_label`
- `products.package_session_count`
- `products.package_discount_percent`
- `products.subscription_period`
- `products.trial_days`
- `products.participant_mode`
- `products.group_size`
- timestamps

Child tables:

- `product_delivery_formats`
- `product_required_client_data`
- `product_methods`
- `product_access_grants`
- `product_included_items`
- `product_modifiers`

All rows are scoped by `product_id`, and product queries must also check
`owner_user_id` through the parent product.

## Analytics

Product analytics is lifetime-only for this section.

The first implementation must not persist fake sales, revenue or ratings on the
product record. Those metrics belong to future `Orders`, `Payments/Ledger` and
`Reviews` contours.

Declare a `ProductAnalyticsReaderPort`:

```ts
export type ProductLifetimeAnalytics = {
  readonly productId: string;
  readonly salesCount: number;
  readonly grossRevenueMinor: number;
  readonly currency: string;
  readonly averageRating: number | null;
  readonly reviewsCount: number;
};
```

The initial `NullProductAnalyticsReader` returns zero sales, zero revenue and
`null` rating for every product. The public response shape is stable now; only the
adapter changes when source modules exist.

Catalog summary reads product counts from `Products` and metrics from
`ProductAnalyticsReaderPort`. Until real sources exist, summary returns:

- product counts from the product table;
- total sales `0`;
- gross revenue `0`;
- bestseller `null`.

## Domain Rules

- An astrologer can only read and mutate their own products.
- `draft` products are not visible to clients and cannot be purchased.
- `active` products are available for future purchase flows.
- `archived` products cannot receive new purchases, but future active obligations
  must remain executable by booking/orders/sessions modules.
- Price changes affect future purchases only. Existing orders and subscriptions
  will keep their captured commercial terms in their own modules.
- Money is stored in minor units with explicit currency.
- Product commands never update sales, revenue or ratings.
- Status transitions are explicit use cases.

## Contracts

Contracts must be shared through `packages/contracts`, following the current Zod
pattern used by dictionary contracts.

Responses include an `analytics` object even while the null implementation is used:

```ts
analytics: {
  salesCount: number;
  grossRevenueMinor: number;
  currency: "RUB";
  averageRating: number | null;
  reviewsCount: number;
}
```

## Testing

Use TDD for implementation.

Required coverage:

- contract schemas accept valid constructor payloads and reject invalid enum values,
  negative money, invalid currency, invalid package/subscription fields and empty
  titles;
- domain use cases enforce ownership and status transitions;
- DB adapter stores and reads normalized product configurations;
- API service maps contract/domain errors to HTTP errors;
- e2e tests cover authenticated list, create, update, publish, archive and duplicate
  flows with CSRF on mutations;
- null analytics reader keeps response shape stable with zero/null metrics.

## Documentation Updates

Update API boundary documentation to reflect the active split:

- `astrologer-api` owns authenticated astrologer workflows such as products;
- `admin-api` owns internal roles;
- `ops-api` is transitional and must not receive new admin/moderator workflows.

## Open Decisions

No blocking product decision remains for the first backend slice. The implementation
should build the product management surface and analytics port now, leaving real
analytics aggregation for the future orders/payments/reviews modules.
