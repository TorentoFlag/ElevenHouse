# Admin Design Surfaces

Use this file with the [design routing index](../design-reference-inventory.md).
Admin, moderator and super-admin workflows belong only to `admin-web` and
`admin-api`; they must not be added to `public-api` or `astrologer-api`.

| Design area / reference | Production surface and ownership | Current readiness and boundary |
| --- | --- | --- |
| Overview/analytics (`admin.jsx`, `admin-data.jsx`) | `admin-web` + `admin-api`; `PlatformAnalytics`, `Users/Roles`, `Verification`, `Moderation`, `Payments`, `Disputes`, `AuditLog` | `missing` except authenticated admin/security/database and finance-policy audit foundation; frontend remains a shell placeholder. Requires internal authorization and read models. |
| User operations/payout terms (`admin.jsx`) | `admin-web` + `admin-api`; `Users/Roles`, `AstrologerProfile`, `Payouts`, `PlatformPlans`, `AuditLog` | `partial`: finance policy/risk/payout-status contour and finance settings surface exist; user operations are missing. Every override/action must use a domain use case and audit trail. |
| Verification queues (`admin.jsx`) | `admin-web` + `admin-api`; `Verification`, `AstrologerProfile`, `KYC`, `AuditLog` | `missing` beyond admin foundation. Verification is protected workflow state, not an astrologer-editable profile field. |
| Moderation queues (`admin.jsx`) | `admin-web` + `admin-api`; `Moderation`, `Content`, `Reviews`, `PublicPage`, `Products`, `AuditLog` | `partial`: Reviews moderation queue, real anonymous author visibility, version/reply approval and rejection, dispute restore/hide, case status updates, party-scoped case messages, internal visibility and audit timeline are production-backed in `admin-web` + `admin-api`. Broader content/public-page/product moderation remains missing beyond Reviews. |
| Disputes/refunds (`admin.jsx`) | `admin-web` + `admin-api`; `Disputes`, `Orders`, `Payments`, `Refunds`, `Wallet/Ledger`, `AuditLog` | `partial`: candidate queue/review, super-admin WebAuthn authorization, sealed payout evidence and V2 refund-approval outbox exist. Approval is not provider refund success: only canonical payment-worker evidence can settle a refund outcome. Browser/design and live-provider acceptance remain pending. |
| Admin plans (`admin-plans.jsx`, `plans-data.jsx`) | `admin-web` + `admin-api`; `PlatformPlans`, `Billing`, `Entitlements`, `AuditLog` | `partial/implemented`: audited tariff draft/update/next-version/publish plus fail-closed fiscal-profile and saved-card-disclosure APIs exist; `?section=tariffs` is server-backed. Published terms are immutable; UI creates the next version. Browser/design acceptance remains pending. |
| Platform settings/legal (`admin.jsx`) | `admin-web` + `admin-api`; `PlatformSettings`, `LegalDocuments`, `FeatureFlags`, `AuditLog` | `missing` beyond admin foundation. Settings require authorization, versioning and audit, never local toggles. |
| Admin communications (`AdmCompose`) | `admin-web` + future notification/admin API; `Notifications`, `Support`, `AuditLog` | `missing`; operator messages need provider/template integration and sender/action evidence. |

## Evidence Boundary

Finance policy, browser security, CSRF and idempotency boundaries are in
[API boundaries](../../api/api-boundaries.md). Refund initiation/decision
ownership is defined by
[ADR 0013](../../decisions/0013-refund-initiation-and-decision-ownership.md).
Do not treat an administrative review state as external-provider settlement or
refund completion.
