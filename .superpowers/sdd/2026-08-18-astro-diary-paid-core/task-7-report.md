# Task 7 report: client-web AstroDiary paid core

Date: 2026-08-18

Status: **IMPLEMENTED; AUTHENTICATED VISUAL ACCEPTANCE PARTIAL**

## Implemented

- Added the authenticated relationship-scoped client route
  `/me/astrologers/:astrologerId/journal` and a cabinet link shown only for
  non-blocked astrologers returned by the server-owned `/me/overview` read.
- Added a responsive client AstroDiary workspace with the Task 5 provisional
  measurements: desktop app shell, `60px` feature toolbar, `300px` journal rail,
  selected detail/timeline/composer, and mobile list-to-detail/back behavior.
- Added RU/EN subscription-neutral copy, semantic headings/regions, live and
  alert states, keyboard-visible focus, textarea focus transfer, and `44px`
  action targets.
- Added validated journal list, selected summary, and server-cursor timeline
  reads. The route astrologer is accepted only when the authenticated server
  relationship and returned journal both match it; the URL never grants
  ownership.
- Added client entry draft create/update/publish with shared schemas, CSRF,
  expected journal/draft versions, stable per-identical-intent idempotency keys,
  and exact selected-query invalidation.
- Added stale/error recovery that preserves the unsaved body/mood buffer while
  server authority refetches. Draft identity/version is never retained as a
  browser-owned authority overlay.
- Added a narrowly required participant-scoped
  `GET /astro-diary/journals/:journalId/client-entry/draft` contract/API/reader
  contour. Without it, a fresh page mount after an acknowledged private save
  could not safely update or publish and would attempt another create. The new
  read returns only the owning client's unpublished `client_entry` draft and
  conceals foreign/astrologer access as the existing safe not-found result.

Unsupported attachment upload, AI suggestions, reflection-prompt creation,
exports, profile/chart deep links, and browser-side unread mutation are absent.
No discovery, catalog, cross-astrologer browsing, fake journal rows, optimistic
cursor/version/allowance, `localStorage`, or `sessionStorage` business state was
introduced.

## Behavioral TDD evidence

Initial RED was observed across eight focused suites because the client route,
API/model/query modules, workspace components, and page did not exist. A later
recovery refinement produced three explicit RED failures:

- public API draft hydration returned `404` instead of `200`;
- the client API function did not exist;
- a fresh page mount rendered an empty editor instead of the saved server draft.

Fresh focused GREEN command:

```text
pnpm exec vitest run --config vitest.config.ts apps/client-web/src/features/astro-diary apps/client-web/src/pages/astro-diary apps/client-web/src/router.contract.test.ts apps/public-api/src/modules/astro-diary/astro-diary.e2e.test.ts apps/astrologer-api/src/modules/astro-diary/astro-diary.e2e.test.ts --reporter=dot
```

Result: `10` files passed, `35` tests passed. Coverage includes relationship and
journal ownership, loading/empty/no-subscription/read-only states, fail-closed
draft authority, create/update/publish, remount hydration, stale text recovery,
stable idempotent retry, exact invalidation, server-cursor paging, and mobile
list/detail navigation.

## Verification

All commands were run from `/Users/anton/Finext/ElevenHouse` against the final
Task 7 code before staging.

- Real local PostgreSQL:
  `INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm exec vitest run --config vitest.integration.config.ts packages/db/src/adapters/astro-diary/drizzle-astro-diary-paid-core-command-uow.integration.ts --reporter=dot`
  — `1` file, `21` tests passed, including owning-client hydration and
  foreign/astrologer denial.
- Sequential dependency builds for contracts, domain, and DB — passed.
- Contracts, domain, DB, public API, astrologer API, and client-web typechecks —
  passed.
- Public API and client-web focused builds — passed. Vite retained the existing
  large-chunk warning (`index` about `931 kB`, session chunk about `504 kB`).
- Focused ESLint over every Task 7 client and narrow backend/contract file —
  passed with no findings.
- `git diff --check` — passed.
- `pnpm verify` — passed:
  - lint: `0` errors and four unrelated pre-existing React-hook warnings;
  - typecheck: `43/43` tasks successful;
  - tests: `20` files, `63` tests passed;
  - build: `28/28` tasks successful.
- `pnpm docs:check:test` — not runnable because the package script references
  missing `scripts/agent-docs/check-agent-docs.test.mjs`.
- `pnpm docs:check` — failed on the pre-existing unowned `AGENTS.md` size and
  missing public/astrologer AstroDiary module entries in unowned architecture
  docs introduced before Task 7. These documentation issues were not hidden or
  expanded into this client feature scope.

## Local runtime and browser evidence

- Rebuilt and restarted the local public API. `/health` returned `status: ok`.
  The new client-draft route returned `401` without a session, proving the route
  is registered behind the public session guard rather than falling through to
  `404`.
- Registered a local-only client through the real passwordless product flow;
  the configured local `dev_console` notification worker delivered the OTP.
- Authenticated Chrome rendered `/me` with the truthful zero-relationship
  server state, then opened the exact AstroDiary route with an unrelated valid
  UUID. The page rendered the relationship-not-found state and did not expose
  a journal/composer.
- Captured and inspected the desktop state and a `390x844` mobile state. The
  mobile shell removed the desktop rail and preserved the title/private label,
  centered empty treatment, and back navigation without horizontal overflow.
- Browser console inspection found no new application error. The only warning
  was the existing React Router `HydrateFallback` development warning.

The authenticated local client had no related astrologer or paid journal. A
real relationship-scoped no-subscription state and non-empty list/timeline/
save/publish flow therefore remain unobserved in the browser; component/network
tests cover them until Task 8 supplies the real purchase/capture/activation
fixture. No direct database substitute was used to manufacture browser access.

## Security and state self-review

- Relationship and journal selection are both filtered by authenticated server
  reads before detail, timeline, or draft queries are enabled.
- Actor, role, journal ownership, allowance, cycle, cursor, timestamps, draft
  IDs, and versions are never accepted from client-authored authority state.
- The saved-draft read checks participant role, journal participation, author,
  `client_entry` kind, and the unpublished `cycle_id is null` shape.
- Mutations include only shared-contract user-editable fields plus expected
  versions; CSRF and idempotency headers remain mandatory.
- Read-only and pending/error authority states do not mount the write composer.
- Failed requests do not show success. Identical retries reuse the same key;
  changed intent receives a new key.

## GitNexus and residual risk

Pre-edit queries could not resolve the client-web functions or the public
controller/service/shared reader type in the current index, so those results
were reported as `UNKNOWN`. The Drizzle reader factory reported `CRITICAL`
transitive risk (`284` symbols, `85` processes), but its d=1 result contained
only the paid-core integration test; the broad process fan-out was composition-
root/index inflation. The implementation only adds a new reader method and does
not alter existing read behavior. Focused HTTP, real-DB, typecheck, build, and
repository verification are the stronger evidence.

Final Superdesign visual sign-off remains blocked because the tool/canvas is
unavailable. Task 5's Chrome-measured reference is the provisional handoff, not
an approved canvas. Non-empty RU/EN desktop/mobile parity, keyboard traversal,
draft save/publish/stale/read-only/error screenshots, and exact visual diffing
remain the Task 8 acceptance gate.

## Preserved unowned work

Left unstaged and uncommitted:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/superpowers/plans/2026-08-18-astro-diary-paid-core.md`
- `docs/superpowers/specs/2026-08-18-astro-diary-design.md`
