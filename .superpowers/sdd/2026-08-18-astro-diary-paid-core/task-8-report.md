# Task 8 report: AstroDiary paid-core integration and acceptance

Date: 2026-08-18

Verdict: **BLOCKED**. Initial paid activation, the real local PostgreSQL journal
lifecycle, authenticated non-empty browser interactions, security checks, RU/EN
presentation, responsive states, and repository verification passed. The complete
paid-core acceptance did not pass because three independent gates remain open:
there is no runnable recurring-renewal production path for client subscriptions,
hosted ArcPay redirect/callback was not accepted against a configured sandbox
provider, and the Superdesign tool/canvas is unavailable.

## Implemented and fixed

Task 8 found and fixed one paid-core integration defect:

- The relationship-scoped client purchase endpoint filtered every subscription
  product out because it admitted only `once` and `pack` payment models. This made
  the canonical `sub.sub.async.solo` AstroDiary product impossible to purchase
  through the real client flow.
- `ClientCommerceService.findOrderableProducts` now admits a subscription only
  when `isCanonicalAstroDiaryPaidProduct(product)` is true. Generic subscription
  products remain excluded.
- `clientPurchaseOptionSchema` now accepts the `sub` payment model returned by that
  server-authorized canonical product.
- A network-level Nest regression test proves that the canonical Diary
  subscription is listed and a generic same-shape subscription is not exposed.

TDD evidence:

1. The new E2E test initially returned HTTP 200 with `products: []`.
2. After the narrow service/contract change it returned the canonical Diary
   product with `paymentModel: "sub"` and kept the generic subscription hidden.

The final review also found and fixed a recovered-draft attachment defect:

- client and astrologer draft response contracts now include the draft's existing
  ordered `attachmentIds`;
- the PostgreSQL reader hydrates those IDs from
  `astro_diary_draft_attachments` in ordinal order;
- both web mutation models preserve the acknowledged IDs when a recovered draft is
  saved again, instead of sending `attachmentIds: []` and silently detaching media;
- API, real-PostgreSQL, and browser-model tests cover both participant roles.

This does not add attachment upload UI. It preserves the paid-core capability for
already prepared attachment IDs that the write contracts already accepted.

GitNexus pre-edit impact:

- `ClientCommerceService.findOrderableProducts`: LOW; direct callers
  `listPurchaseOptions` and `getAvailableSlots`; no indexed execution process.
- `clientPurchaseOptionSchema`: LOW; no indexed upstream process.
- Final unstaged `detect_changes`: LOW, no affected indexed execution process.

A suspected astrologer-api dependency failure was traced to a stale `dist`
artifact. A fresh build restored the existing `@Inject(SystemClock)` source
composition and the API booted; no speculative source fix was made.

## Intake and authority

- Checkout: `/Users/anton/Finext/ElevenHouse`, branch `main`.
- Initial index: empty.
- Initially unowned dirty paths preserved: `AGENTS.md`, `CLAUDE.md`, untracked paid
  core plan and design spec.
- Owned production/test paths:
  - `apps/public-api/src/modules/client-commerce/client-commerce.service.ts`
  - `apps/public-api/src/modules/client-commerce/client-commerce.e2e.test.ts`
  - `packages/contracts/src/client-commerce.ts`
  - client/astrologer AstroDiary draft contracts, reader, web mutation models, and
    their focused API/DB/web tests
  - the SDD progress ledger
  - this report
- No push, PR, deploy, remote mutation, external account write, or purchase was
  performed.

The DB target was verified before local reset/mutation as
`postgresql://...@localhost:5432/elevenhouse`, user `elevenhouse`, backed by the
healthy local Docker container `elevenhouse-postgres-1` on port 5432.

## Automated verification

All commands below were run in this checkout on 2026-08-18.

### Database and initial gates

- `pnpm db:reset` — passed the committed migration lineage and seed (8 categories,
  396 entries, 16 templates).
- Contracts/domain/DB typecheck and build — passed for all three packages.
- Real PostgreSQL AstroDiary suites:

  ```text
  INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration \
    packages/db/src/adapters/astro-diary/drizzle-astro-diary-subscription-activation-integrity.integration.ts \
    packages/db/src/adapters/astro-diary/drizzle-astro-diary-paid-core-command-uow.integration.ts \
    --reporter=dot
  → 2 files, 32 tests passed
  ```

### API and web gates

- Public commerce + public AstroDiary + astrologer AstroDiary E2E:
  `pnpm test ... --reporter=dot` — 3 files, 14 tests passed.
- Public API and astrologer API typecheck/build — passed.
- Client and astrologer AstroDiary UI/model/API tests plus client router contract —
  18 files, 47 tests passed.
- Client web and astrologer web typecheck/build — passed.
- Exact owned-file ESLint — passed with zero warnings/errors.

### Repository gate

`pnpm verify` passed:

- lint: 0 errors; four pre-existing React hook warnings outside owned paths;
- typecheck: 43/43 Turbo tasks successful;
- tests: 22 files, 66 tests passed;
- build: 28/28 Turbo tasks successful.

Vite reported the existing large-chunk warnings for admin/client/astrologer web;
these are warnings, not failures, and are outside the scoped integration fix.

Two command-construction attempts were corrected and are not hidden:

- workspace-local Vitest paths returned “No test files found” because the root
  config expects repo-root paths;
- `pnpm test:unit` does not exist in this repository.

The corrected root `pnpm test <repo paths>` command is the passing evidence above.

### Final-review attachment regression

The final review ran the recovered-attachment tests red before production changes:

- both API draft reads were rejected by the strict response schemas as unrecognized
  `attachmentIds`;
- both web recovered-draft tests failed before an update request could preserve the
  IDs;
- both real-PostgreSQL draft reads returned drafts without their attached media IDs.

After the narrow fix, five focused API/page/composer files passed 24/24 and the
real-PostgreSQL paid-core command integration suite passed 21/21. The first full
repository gate then found two old API-test fixtures that still omitted the newly
required field; those fixtures were corrected and the fresh gate passed:

- exact owned-file ESLint: zero warnings/errors;
- affected package typecheck: 21/21 Turbo tasks;
- affected package build: 19/19 Turbo tasks;
- `pnpm verify`: lint with zero errors and four unrelated existing hook warnings,
  typecheck 43/43, unit tests 66/66, build 28/28;
- `git diff --check`: passed.

These checks do not close the external ArcPay, recurring-renewal, or Superdesign
gates.

## Real local paid journey

### Identities and product

Actual passwordless auth and independent browser contexts were used:

- astrologer user `d6d118cf-8f32-47dd-b1a8-9371281aed26`,
  `task8.astro.20260818@example.test`;
- client user `c7f73563-854d-444c-b930-07b3ab755cea`,
  `task8.client.20260818@example.test`.

The astrologer UI created and published `Task 8 AstroDiary`, product
`c3ed86a7-0a91-4d88-9576-ddfb1410c809`, revision 2, RUB 150000 minor, monthly,
4 reflection cycles, 2-workday response SLA, 7-calendar-day client window,
Mon-Fri, `Europe/Moscow`. The public profile was published at the direct handle
`task8-astro-20260818`; the client joined through that direct astrologer link,
creating the real relationship. No journal, timeline row, or relationship was
fabricated.

The local seed has no published platform tariff. The exact production tariff
authority store and the same local subscription prerequisite used by the real-PG
suite supplied the astrologer's local `products` capability. A real finance policy
and risk snapshot were also required because the generic seed contains neither.

### Order, checkout, capture, and activation

After the fix, the authenticated purchase-options response exposed exactly the
canonical Diary product. The actual client UI displayed the product, price, format,
and buyer contact form. The browser order request contained CSRF and a stable
`Idempotency-Key` and created a real `pending_payment` order.

The local UI/provider contour could not complete hosted checkout:

- `127.0.0.1` initially needed to be added to the in-memory local public API origin
  allowlist; `.env` was not edited.
- the real checkout endpoint then returned typed `503 payment_checkout_unavailable`
  because no usable local ArcPay checkout provider/session is configured.

As a downstream integration diagnostic, the actual production checkout preparation,
sealed artifact, verified webhook ingress, canonical provider read, finance capture,
and subscription capture-dispatch UoWs were run against the UI-created order rather
than inserting an order, subscription, journal, or paid state directly. This proves
the production UoWs after provider acceptance, but it is not a substitute for a
hosted ArcPay redirect/callback and is not payment-provider acceptance. The proven
downstream contour was:

- order `97978024-a8e6-483a-8c89-7d47675aac6b` → `paid`;
- subscription `f490ce7f-079b-41ca-8047-d57bee10176f` → `active`, version 2;
- journal `a7b4a803-d1d6-4a0c-8159-064458a10d3a` created immediately;
- allowance `{ total: 4, available: 4, reserved: 0, consumed: 0, released: 0 }`.

A temporary local runtime harness duplicated the production fixture composition and
was deleted after use; it is not part of the delivery. Its first attempt used future
webhook timestamps and correctly failed a DB constraint. The successful retry used
current transport timestamps. Its final diagnostic SELECT referred to a nonexistent
`remaining_units` alias after the production mutation had already committed; a
separate read-only join confirmed the successful activation and actual `available`
column. This diagnostic error was not a product failure.

Local diagnostics left two non-paid orders in the local-only DB:

- `892fb129-d651-4898-a019-7c9c22d3390d` — `pending_payment`;
- `9fe57033-a437-4215-84f9-09935c9502c5` — `pending_payment`.

They are explicitly reported rather than mistaken for successful purchases.

### Client entry and astrologer reply

The real client route
`/me/astrologers/d6d118cf-8f32-47dd-b1a8-9371281aed26/journal` showed one
server-owned journal and allowance 4. Through the UI the client:

- created draft `f2255ceb-17a0-4445-951b-45889689eec1` (201, `outcome: applied`);
- published it (201, five domain event IDs);
- observed allowance decrease to 3 and the published timeline item.

The real astrologer `/astro-diary` route then showed “Нужен ответ” and the computed
deadline. Through the UI the astrologer:

- created reply draft `bc6bdab7-445c-4ef7-bcab-0ac86cf102a0` (201);
- published it (201, four domain event IDs);
- observed the closed cycle and “Сейчас ход клиента”.

Both sessions then read the same two-item cursor timeline (`nextCursor: 2`,
`visibleMaxCursor: 2`, `hasMore: false`). Every draft/publish request carried the
role-specific session cookie, CSRF header, expected server versions, and stable
`Idempotency-Key`; the response echoed the idempotency key.

### Terminal read-only state

The production lifecycle function `endSubscriptionAtPaidBoundary` was applied via
the transactional source-event UoW at `2026-09-19T00:00:00Z`, after the real paid
period end `2026-09-18T19:17:53.295Z`. It produced:

```text
state=ended, version=3
client_subscription.period_ended.v1
client_subscription.entitlement_changed.v1
```

Both authenticated UIs kept the complete timeline and rendered the bilingual
archived/read-only banner with no composer. The client API rejected a direct new
draft with `403 paid_access_ended`. The astrologer API rejected a direct reply with
`409 no_open_cycle`; no mutation was written. Both summaries reported
`access.mode=read_only`, `subscriptionState=ended`, `currentPeriod=null`, and
`allowance=null`.

## Security evidence

- Relationship scoping: only the linked astrologer's product was exposed; there was
  no catalog/discovery query.
- Foreign random journal detail and timeline returned the same 404
  `astro_diary_not_found` for both client and astrologer sessions.
- Real mutations required authenticated role cookies, trusted origin, CSRF, UUID
  path identities, optimistic versions, and idempotency keys.
- Paid access was server-owned: allowance and read-only state changed only after
  PostgreSQL lifecycle transitions, never in browser storage.
- Browser console errors after acceptance were the two deliberate foreign-journal
  404 probes. Client web also emitted the existing React Router
  `No HydrateFallback element` warning; no Diary mutation/network failure remained.

## Visual and interaction acceptance

Chrome DevTools was used for real authenticated network-backed states at desktop
`1440×741` and mobile `390×844`, in RU and EN. Desktop astrologer geometry matched
the Task 5 measured reference contour:

- app content begins at x=248 after the 248px sidebar;
- top bar `x=248, 1192×68`;
- Diary toolbar `x=248, y=68, 1192×60`, padding `0 20px`;
- workspace `x=248, y=128, 1192×613`;
- rail `300×613`; selected row `299×63` (Task 5 reference row was 60px);
- detail `x=548, y=128, 892×613`, header padding `14px 22px`;
- contextual card width 680px; document horizontal overflow was false.

The 3px selected-row height difference is recorded as residual pixel variance, not
silently called exact parity. The principal layout, dark/accent token language,
master/detail hierarchy, bubbles, archived banner, and responsive state transition
match the Task 5 reference package.

Mobile evidence covered:

- journal/client list only at first;
- row selection replacing the list with detail;
- explicit back control;
- active timeline, client/astrologer bubbles, allowance badge;
- archived/read-only timeline and banners;
- no squeezed two-column layout or horizontal overflow.

Keyboard focus was exercised on the client mobile detail: first Tab focused
“Назад к журналам”, second Tab focused “Написать запись”; both had the computed
`2px solid rgb(244, 196, 48)` focus outline. Draft text entry, Tab transition,
save/publish disabled/enabled states, and live status text were also exercised.

The DevTools connector captured and visually inspected desktop/mobile screenshots
inline, but refused both `/tmp` and repository file paths as outside its configured
artifact roots. Therefore Task 8 has no durable screenshot path/hash. Task 5's
reference screenshots remain at their reported ephemeral `/tmp` paths; the exact
Task 8 DOM metrics, a11y snapshots, network requests, and inline screenshots are the
available evidence.

## Blocked, skipped, and residual risk

### Recurring renewal production path

Recurring renewal is **BLOCKED** and was not approximated with a partial scheduler
or fake provider path:

- `requestRenewalCharge` exists only as an uncalled domain transition in
  `packages/domain/src/client-subscriptions/client-subscription-lifecycle.ts`;
- `createDrizzleClientSubscriptionCommandUnitOfWork` can persist a caller-supplied
  transition, but no production app composes it for renewal selection/requesting;
- `apps/payment-worker/src/main.ts` schedules platform-tariff renewal only, not
  client-subscription renewal;
- `drizzle-client-subscription-capture-dispatch-uow.ts` issues and replays only
  `captureKind: "initial"`, despite the sealed domain receipt supporting a renewal
  target;
- the reusable saved-card setup/charge contour is bound to
  `platform_tariff_subscriptions`, so there is no client-subscription credential,
  recurring consent, economic-intent, or provider-charge authority to dispatch;
- `applyRenewalCapture` and the same-journal period projection are implemented and
  tested as downstream domain/DB mechanics, but no real provider capture can reach
  them through a production client-subscription renewal route.

Closing this gate requires a separately designed scheduler/claim boundary, a
client-subscription recurring-payment credential and consent authority, finance
intent/provider dispatch and reconciliation, and renewal capture/failure routing.
That is not a narrow final-review patch.

### Hosted ArcPay acceptance

Hosted ArcPay checkout is **BLOCKED**. The local `.env` has neither the public-API
finance-checkout enablement/payment-method configuration nor payment-worker ArcPay
credentials/webhook signing configuration. Both contours default disabled in
runtime config, and the authenticated checkout returned typed
`503 payment_checkout_unavailable`. No external sandbox write was authorized or
performed. The production-UoW fallback described above remains useful downstream
evidence, but cannot be ruled a provider PASS.

### Superdesign acceptance

Final Superdesign signoff is **BLOCKED**:

```text
command -v superdesign
→ no executable

pnpm exec superdesign --version
→ Command "superdesign" not found
```

There is no callable Superdesign skill, MCP tool, CLI, or identified AstroDiary
canvas. Production/HTML screenshots were not presented as a fake Superdesign canvas.

### Partial / exact limitations

- The authenticated browser journey is partial at payment: it created the real
  order, then continued only through the explicitly separated production-UoW
  diagnostic because hosted ArcPay was unavailable.
- Screenshot files could not be persisted by the DevTools connector.
- Selected-row desktop height is 63px versus the Task 5 reference 60px.

### Intentionally deferred

- No deploy, push, PR, remote provider call, production data mutation, attachment
  upload, voice, AI derivative delivery, or notification delivery acceptance.
- The paid-core plan intentionally covers text/mood and existing attachment IDs;
  later attachment/voice/AI slices remain outside Task 8.

## Unowned changes preserved

The following were present before Task 8 and were not edited, staged, reverted, or
included in the scoped delivery:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/superpowers/plans/2026-08-18-astro-diary-paid-core.md`
- `docs/superpowers/specs/2026-08-18-astro-diary-design.md`

## Final ruling

- Initial-capture and AstroDiary command/journal code gates: **PASS**.
- Recovered draft attachment preservation: **PASS** for contracts, DB reader, API,
  and both web mutation models; no upload UI was added.
- Recurring client-subscription renewal: **BLOCKED**; no production execution path.
- Hosted ArcPay redirect/callback: **BLOCKED**; the UoW diagnostic is not provider
  acceptance.
- Real local non-empty runtime journey: **PARTIAL** at the payment-provider boundary;
  the post-capture journal interaction and terminal read-only contour passed.
- Security/foreign-access/read-only checks: **PASS**.
- Browser RU/EN desktop/mobile behavior: **PASS**, with the recorded 3px row variance
  and unavailable durable screenshot paths.
- Approved Superdesign canvas/signoff: **BLOCKED**.
- Overall Task 8 verdict: **BLOCKED** on recurring renewal, hosted ArcPay acceptance,
  and approved Superdesign acceptance.
