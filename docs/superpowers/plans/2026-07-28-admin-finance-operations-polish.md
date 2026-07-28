# Admin Finance Operations Polish

## Outcome

Admin finance operators can narrow payout and reconciliation queues through
server-backed filters without losing ledger/audit semantics or moving business
filtering into the browser.

## Scope

In scope:

- Typed admin payout queue status filters for operational groups.
- Typed reconciliation exception evidence filters.
- `admin-api` query validation with `400` for unknown filter values.
- DB adapter filtering for reconciliation evidence/provider/environment.
- `admin-web` controls that reload real admin-api queue data.
- Targeted contract, API, UI and HTTP flow tests.

Out of scope:

- Automatic provider payouts.
- Refund write commands.
- User search, verification, moderation and platform settings.
- A new payment microservice boundary.

## Sources

- Product truth: current approved finance contour with manual payout requests in
  admin until Arc Pay exposes terminal payouts.
- Architecture truth: `docs/api/api-boundaries.md`, finance domain/store
  contracts, admin-api module boundary.
- Visual truth: `ElevenHouseDesign/admin.jsx` via
  `docs/architecture/design-reference-inventory.md`; admin finance remains in
  the existing dark internal-operations language.
- Implemented evidence: contracts, admin-api controller/service, DB adapters,
  admin-web API client/page, targeted tests.

## Definition Of Done

- Default payout queue behavior remains `open`.
- Operators can filter payouts by `open`, `ready`, `processing`, `failed`,
  `terminal` and `all`.
- Operators can filter reconciliation exceptions by evidence type:
  `all`, `payment`, `settlement`, `payout`, `provider_event`.
- Bad query values fail observably instead of silently defaulting.
- UI filter changes call admin-api-backed methods, not local array filtering.
- Tests cover contracts, admin-api HTTP behavior and admin-web API/UI behavior.

## Verification

- `pnpm exec vitest run packages/contracts/src/payouts.test.ts packages/contracts/src/reconciliation.test.ts apps/admin-api/src/modules/finance-policies/finance-policies.e2e.test.ts apps/admin-web/src/features/finance-policies/api/adminFinancePoliciesApi.test.ts apps/admin-web/src/features/finance-policies/ui/FinancePoliciesPage.test.tsx`
- Affected typecheck/build commands after implementation.
- Browser/design acceptance depends on live local admin-web/admin-api
  availability and authenticated admin state.
