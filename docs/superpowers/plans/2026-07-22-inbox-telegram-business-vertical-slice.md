# Inbox Telegram Business Vertical Slice Plan

**Status:** in progress
**Owner:** Codex, shared `main` checkout
**Started:** 2026-07-22

## Purpose / Big Picture

Deliver the first visible end-to-end Messaging surface for astrologers around
one provider path: Telegram Business / Secretary bot. The astrologer should be
able to open `/inbox`, see real channel connection state, read real Messaging
threads, open a thread, link or create a CRM client for an unlinked external
chat, send a text reply through the existing Messaging API, and receive realtime
freshness through the SSE client.

This slice intentionally does not implement Telegram MTProto or Instagram
adapters. They remain first-class planned modes in contracts/schema/ADR.

## Progress

- [x] 2026-07-22: User approved focusing end-to-end on one channel before
      implementing MTProto or Instagram.
- [x] Add `/inbox` route and navigation item in `astrologer-web`.
- [x] Build production Inbox page/controller/view from existing Messaging API
      and realtime client.
- [x] Cover connection empty/error/success, thread empty/list/detail, unlinked
      chat link/create-client, composer disabled/sending/error states.
- [x] Verify focused frontend tests and affected `astrologer-web`
      typecheck/build.
- [x] Check browser/design parity availability without process lifecycle
      changes; record blocked browser acceptance.
- [x] 2026-07-25: User chose Hookdeck for stable local Telegram webhook testing
      and changed message detail loading from latest `N` to all persisted thread
      messages.
- [x] 2026-07-25: Add authenticated CSRF-protected Telegram Business start flow:
      ElevenHouse creates/reuses one pending channel connection, opens the public
      bot link, and the Telegram `business_connection` webhook claims it active.
- [ ] Complete browser/design parity when an attachable browser surface is
      available.

## Surprises & Discoveries

- 2026-07-22: Native browser prompt was rejected during implementation in favor
  of inline forms for linking an existing CRM client ID and creating a new
  manual client from the unlinked chat.
- 2026-07-22: A Vite `astrologer-web` process was already listening on
  `localhost:5174`, but Chrome DevTools MCP could not attach because its Chrome
  profile was already locked by an existing browser process.

## Decision Log

- 2026-07-22: Execute Telegram Business UI vertical slice first; defer MTProto
  and Instagram implementation until the single-channel user journey is proven.
- 2026-07-22: Use existing `features/messaging/api` and SSE client first. Add
  backend/API only if the visible workflow exposes a real missing production
  contract.
- 2026-07-25: Use Hookdeck CLI as the default local Telegram Business webhook
  gateway. Cloudflare quick tunnels are not stable enough for repeated webhook
  testing; named Cloudflare tunnels remain an infrastructure alternative.
- 2026-07-25: Thread detail reads load all persisted messages by default.
  Pagination remains supported only when a caller explicitly supplies `limit`
  and `offset`; thread list reads remain paginated.
- 2026-07-25: Telegram Business connect uses a safe public bot username in
  `astrologer-api` config. The API never needs the Bot API token; provider token
  ownership stays with `notification-worker` and webhook verification.

## Outcomes & Retrospective

- `/inbox` is now a protected `astrologer-web` route with navigation entry.
- The page reads Messaging channel connections, threads and selected thread
  details from existing API clients.
- The page subscribes to Messaging SSE and invalidates exact Messaging query
  keys on realtime events.
- Outbound send, mark-read, link existing client and create manual client use
  existing HTTP mutations; state-changing commands keep CSRF/idempotency in the
  API client layer.
- Browser/design parity remains blocked until an attachable browser surface is
  available or process/browser authority is expanded.

## Context and Orientation

Reference visual sources:

- `docs/architecture/design-reference-inventory.md` rows for CRM clients and
  Inbox/messages.
- `ElevenHouseDesign/app/inbox.jsx`
- `ElevenHouseDesign/app/inbox-data.jsx`
- `ElevenHouseDesign/app/mobile-inbox.jsx`
- screenshots `dinbox.png`, `dinbox2.png`, `mchat_link.png`.

Current implementation foundation:

- `packages/contracts/src/messaging.ts`
- `apps/astrologer-api/src/modules/messaging/*`
- `apps/notification-worker/src/messaging-delivery.*`
- `apps/astrologer-web/src/features/messaging/api/messagingApi.ts`
- `apps/astrologer-web/src/features/messaging/realtime/messagingRealtimeClient.ts`
- `scripts/dev/telegram-business-webhook.mjs`
- `docs/development/agent-runbooks/10-telegram-business-hookdeck.md`

## Interfaces and Dependencies

Frontend depends on shared Messaging contracts and `application.http`; it must
not copy backend DTOs. Durable writes remain HTTP mutations with CSRF and
`Idempotency-Key`; realtime SSE invalidates reads and does not send messages.

The owning app is `apps/astrologer-web`. Page-specific composition stays under
`apps/astrologer-web/src/pages/inbox`; API/query/realtime model stays under
`apps/astrologer-web/src/features/messaging`.

## Plan of Work

1. Add route/navigation with RED tests.
2. Add Messaging query/mutation/realtime invalidation model with RED tests.
3. Add Inbox controller and view tests for real states.
4. Implement page CSS and components against design reference language.
5. Verify targeted frontend tests and affected package gates.
6. Attempt browser/design parity without starting services; record blockers if
   existing runtime is unavailable.

## Concrete Steps

Run commands from `/Users/anton/Finext/ElevenHouse`:

```bash
pnpm test apps/astrologer-web/src/router.test.tsx \
  apps/astrologer-web/src/layouts/AstrologerNavigationDrawer/AstrologerNavigationDrawer.test.tsx

pnpm test apps/astrologer-web/src/features/messaging/model/messagingQueries.test.ts \
  apps/astrologer-web/src/pages/inbox/InboxPageView.test.tsx \
  apps/astrologer-web/src/pages/inbox/InboxPage.test.tsx

pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
git diff --check
```

## Validation and Acceptance

Automated acceptance:

- Route and navigation tests prove `/inbox` is inside the protected app shell.
- Query/model tests prove realtime invalidates exact Messaging keys.
- View tests prove connection empty state, thread list/detail, unlinked client
  actions and send disabled/pending/error states.
- API client tests already prove CSRF/idempotency and contract parsing.

Runtime/visual acceptance:

- Open existing local production route `/inbox` as an authenticated astrologer.
- Compare desktop and mobile states with `dinbox.png`, `dinbox2.png` and
  `mchat_link.png`.
- Inspect console/network/focus states.

If the required app/API/browser surface is not already available, this
acceptance remains blocked rather than replaced by component tests.

## Idempotence and Recovery

No process lifecycle, DB reset/migration, external Telegram writes, commits,
pushes or deploys are authorized by this task. The slice uses existing local
files and automated tests only unless the user grants additional authority.

## Artifacts and Notes

Design QA artifacts, when runtime is available, belong under
`.design-qa/inbox-telegram-business-vertical-slice-2026-07-22/`.
