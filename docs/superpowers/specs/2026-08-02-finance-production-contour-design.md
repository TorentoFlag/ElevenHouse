# ElevenHouse Finance Production Contour Design

**Status:** approved by the user on 2026-08-03 for implementation through a
living master ExecPlan and dependency-ordered child plans.

**Scope owner:** ElevenHouse Finance bounded context across `client-web`,
`astrologer-web`, `admin-web`, their owning APIs, `payment-worker`, shared
contracts/domain and PostgreSQL adapters.

**Research accessed:** 2026-08-02.

**Pre-launch rollout amendment (2026-08-03):** the user subsequently declared
the current ElevenHouse production database disposable and free of real users,
payments and accounting/legal records. For this one rollout, legacy financial
inventory, subscriber conversion, opening-balance migration and forward data
conversion are removed from scope. The complete current shared schema is
installed from one verified baseline by an exact-target destructive production
reset after implementation and tests. This amendment supersedes only the legacy
migration/reset statements below; all financial integrity, reconciliation and
post-launch forward-migration requirements remain in force. See ADR 0012.

## 1. Outcome

ElevenHouse operates one ArcPay merchant account. All client and platform-plan
pay-ins are accepted by ElevenHouse. Astrologers are not ArcPay submerchants and
do not receive provider-side split settlements.

The completed contour must let:

1. an administrator create, validate, publish and archive versioned tariffs;
2. an astrologer buy a paid ElevenHouse tariff and be charged recurrently
   through an ArcPay saved-card mandate owned by ElevenHouse;
3. backend and frontend enforce tariff entitlements before paid-only sections or
   commands are available;
4. a linked client buy a one-time product from a specific astrologer through
   ArcPay Hosted Checkout;
5. ElevenHouse record the captured sale in an append-only double-entry
   operational ledger and calculate the astrologer's payable using the exact
   tariff version effective for that order;
6. risk, fulfillment and settlement gates move payable funds through pending,
   reserved and available buckets without changing the total silently;
7. an astrologer request a payout to an approved card or bank account;
8. an authorized administrator review the request, execute the bank transfer
   manually and record bank evidence before the request becomes paid;
9. refunds, partial refunds, chargebacks, provider fees and reconciliation
   exceptions produce explicit, idempotent financial records;
10. Russian and English user interfaces expose truthful loading, pending,
    failure, retry and terminal states in the visual language of
    `ElevenHouseDesign/`.

Completion means the whole observable flow is implemented and evidenced across
contracts, domain, PostgreSQL, APIs, workers and all affected frontends. A
passing unit test alone does not complete this contour.

## 2. Approved product decisions

- ArcPay is the single acquiring provider and merchant pay-in balance for
  ElevenHouse.
- No submerchant, connected-account or split-payment model is introduced.
- ArcPay settlement balances and payouts belong to ElevenHouse, not to an
  individual astrologer.
- The astrologer balance is an internal ElevenHouse payable subledger.
- Astrologer payouts are manual in the current contour: card or bank account,
  admin queue, bank-side execution, then recorded evidence.
- ArcPay does not execute the current astrologer payout flow. A future payout
  terminal or provider adapter may replace only the execution edge, not the
  ledger or payout aggregate.
- The commission for every client order comes exclusively from the effective
  tariff version. A separate finance policy cannot provide a competing
  commission value.
- Published tariff versions and captured order economics are immutable. There
  are no existing subscriptions to convert in the authorized disposable
  pre-launch database. Versioning is required from the first new subscription
  regardless.
- Every paid capability is protected server-side on its mapped reads, commands
  and jobs. The decision is operation-specific: existing historical data and
  already-paid obligations may stay readable, while new paid work is blocked.
  A frontend lock is presentation, not authorization.
- Current client purchases are one-time. Recurring client subscriptions to an
  astrologer's content or services are intentionally outside this delivery.
- Client pay-ins and ElevenHouse tariff renewals use `one_stage` capture.
  `two_stage` remains disabled until a complete authorize/capture/void lifecycle
  is separately designed and implemented.
- The initial enabled finance currency is RUB, matching the current contracts
  and ledger. Currency remains explicit on every record; another currency needs
  a separate pricing, settlement, payout, fiscal and reconciliation rollout,
  never implicit conversion.
- The pre-launch reset creates an exact zero trial balance. A bank cash-pool
  identity may exist as a directory record, but no opening-balance/control
  journal or monetary seed exists. The first `bank_cash` movement requires a
  real ArcPay settlement and deduplicated bank-statement evidence.
- ArcPay/acquirer fees and ArcPay chargeback-processing fees are ElevenHouse
  expenses. They are not deducted from the astrologer's already calculated net
  amount a second time.
- A partial refund proportionally reverses both ElevenHouse commission and the
  astrologer payable, using cumulative integer allocation so a final full refund
  exactly reverses the original sale.
- A ledger reversal is posted only after the provider outcome is confirmed.
  Approval of a refund temporarily blocks the corresponding payable so it
  cannot be paid out while the provider result is pending.

## 3. In scope and non-scope

### In scope

- Admin tariff catalog, immutable versions, publishing, archival, pricing,
  commission, feature entitlements and limits.
- Astrologer platform-plan purchase, saved-card consent, initial charge,
  recurring invoices, renewal, cancellation at period end, payment-method
  replacement, payment history and receipts.
- Central entitlement resolution and access gates across the astrologer
  frontend, API commands, workers and public availability of paid features.
- One-time client order, checkout, provider return/polling and authoritative
  fulfillment.
- ArcPay webhook inbox, provider reads, settlement ingestion and reconciliation.
- Operational double-entry ledger, wallet projections, holds, reserves, payout
  reservations, refund/chargeback reversals and policy-approved negative/
  recovery balances.
- Manual payout methods and request/admin execution flow.
- Client service dispute and admin refund decision/execution flow required to
  reach a provider refund safely.
- Fiscal configuration snapshots and receipt status/link storage for pay-ins
  that use ArcPay embedded fiscalization.
- Finance UI for astrologer, checkout/status UI for client, and tariff, payout,
  dispute/refund, reconciliation and finance overview UI for admin.
- Security, audit, observability, concurrency, recovery, load and test evidence.

### Intentionally outside this delivery

- ArcPay submerchants, recipient accounts, split allocations or per-astrologer
  provider balances.
- Automatic payouts to astrologers, payout schedules, instant payout and ArcPay
  payout-create integration.
- Recurring client subscriptions to astrologer content or services. The design's
  client `Подписки` screen is future visual input only.
- Mid-period paid-plan switching, proration and automatic platform-plan refunds
  until those product rules are explicitly approved. The initial contour
  supports purchase from the base plan, renewal and cancellation at period end.
- Multi-provider acquiring, currency conversion, credit products, lending or
  stored-value wallet behavior.
- Treating operational ledger output as statutory accounting or tax reporting.
  General-ledger mapping and tax declarations remain owned by accounting.

## 4. System model

### 4.1 Three independent money domains

```text
ArcPay merchant domain
  payment -> captured -> settlement batch -> ArcPay ledger/balance -> payout to ElevenHouse

ElevenHouse operational subledger
  astrologer_pending -> astrologer_reserved / astrologer_available
                       -> astrologer_payout_pending -> paid or returned

ElevenHouse bank domain
  incoming merchant settlement -> unrestricted bank cash
                               -> manual outgoing astrologer transfer
```

These states must never be collapsed:

- ArcPay `available` is provider-side merchant settlement state, not cash
  confirmed in the ElevenHouse bank account.
- Astrologer `available` is an ElevenHouse liability eligible for a payout
  request, not money stored for the astrologer at ArcPay.
- A manual payout can be marked paid only from bank evidence, not from an ArcPay
  settlement status or an admin button click.

### 4.2 Architecture boundary

Finance remains a strict bounded context in the existing modular monolith with
the separately deployable `payment-worker`. This preserves atomic PostgreSQL
transactions for orders, payments and ledger effects while retaining provider
ports and events as future extraction points.

- `packages/domain` owns aggregates, use cases, state transitions and ports.
- `packages/db` owns Drizzle schema, constraints, locks, transactions and
  adapters.
- `public-api` owns client order, checkout, return-state and dispute endpoints.
- `astrologer-api` owns tariff billing reads/commands, entitlements, finance
  reads, payout methods and payout requests.
- `admin-api` owns tariff administration, payout operations, refunds/disputes,
  reconciliation, sensitive reveal and audit-sensitive finance commands.
- `payment-worker` owns all secret-authenticated server-to-server ArcPay I/O,
  durable webhook processing, card-setup/checkout preparation, subscription
  charges, refunds, settlement ingestion, hold/reserve release and finance
  reconciliation jobs. Browser commands persist an intent plus outbox job and
  return a truthful
  `preparing_provider_session` state; a short-lived read endpoint supplies the
  ArcPay redirect/action when the worker has created it.
- `notification-worker` sends charge notices, billing failures, receipts,
  payout status and dispute notifications from outbox events.

No controller calls ArcPay or posts ledger rows directly. No external provider
call is made while a database transaction or wallet row lock is held. A shared
ArcPay client and distributed `(merchant_tenant, environment)` rate budget cover
all worker replicas; a process-local limiter is insufficient for ArcPay's
merchant-wide quota. The browser may submit card data only to ArcPay-hosted/
SDK fields and perform a returned 3DS action; it receives a one-time public
action and opaque tokenization artifact, never a server secret. The owning API
persists that artifact/intent for worker execution without logging card data.

## 5. Tariffs, platform subscriptions and entitlements

### 5.1 Tariff source of truth

`platform_plan` is the stable product identity. `platform_plan_version` is an
immutable published economic and entitlement contract with:

- plan code and localized display metadata;
- monthly/yearly price in minor units and explicit currency;
- platform commission in basis points;
- entitlement keys and versioned limits;
- draft, scheduled/effective, active or archived lifecycle metadata;
- effective timestamp and audit author.

Draft versions may be edited or deleted. A published version cannot be edited
or deleted; a correction creates a new version. The admin economics calculator
is preview-only and never writes an order or subscription.

Publishing a successor version affects new purchases from its effective time.
An existing paid subscription remains pinned to the version the astrologer
accepted, including its renewal price, commission and entitlements; it is never
migrated silently. Archival removes a version from new sale but does not break
subscriptions already pinned to it. A future migration to new terms requires a
separate explicit consent/notification workflow.

There must always be one effective base/Start version before client orders can
be created. Existing seed and prototype numbers are not silently promoted to
commercial truth: initial versions are explicitly reviewed and published by an
authorized administrator.

### 5.2 Commission resolution

When a client order is created, the server resolves the astrologer's effective
subscription and tariff version at that instant and snapshots:

- `plan_id` and `plan_version_id`;
- `platform_fee_bps`;
- computed gross, platform fee and astrologer net amounts;
- currency and integer-allocation revision.

The snapshot never changes if the astrologer later renews, cancels or buys a
different tariff. Hold and reserve policy may be snapshotted separately, but it
cannot override the tariff commission.

If no effective base tariff exists, or the subscription points to an unknown
published version, order creation fails before ArcPay is called. There is no
default percentage hidden in code.

### 5.3 Astrologer subscription lifecycle

```text
card setup:
setup_requested -> tokenization_required -> execution_pending
  -> requires_customer_action -> credential_active
  -> setup_failed | setup_expired

invoice attempt:
charge_queued -> provider_pending -> requires_customer_action
  -> captured | declined | failed | provider_unknown

subscription:
incomplete_setup -> awaiting_initial_payment -> active
  -> past_due -> active | canceled

active + cancel_at_period_end=true
  -> canceled at current_period_end
```

- The free/base tariff requires no saved-card charge.
- A platform subscription belongs to the astrologer role/profile, not to every
  role on an account that may also act as a client.
- Buying a paid tariff records explicit saved-card and recurring-charge consent,
  then starts ArcPay `/cards/setup`. The complete provider contour is
  `setup -> tokenize -> execute -> optional 3DS Method/challenge -> canonical
terminal read`; creating the setup intent alone does not produce a usable
  credential.
- The worker creates the setup intent. ArcPay hosted/SDK fields tokenize in the
  astrologer's browser so PAN/CVV go directly to ArcPay; the browser returns only
  the opaque tokenization artifact, the API persists the next operation intent,
  and the worker performs secret-authenticated execute/canonical reads. 3DS
  submission follows only the typed provider action.
- The browser tokenization artifact is transient, single-use and valid for only
  the provider-returned lifetime (currently 300 seconds). The restricted intent
  record stores its provider `expires_at` without logging the token and enqueues
  a deadline-priority execute job. The worker executes only when the remaining
  lifetime exceeds the configured worst-case call budget; otherwise it marks
  `tokenization_expired` and requires fresh browser tokenization. An expired or
  already-consumed artifact is never retried.
- ElevenHouse binds the confirmed credential to `(merchant_tenant,
environment, customer_id, card_token_id)` and stores only the opaque token,
  mask/brand/expiry metadata and consent evidence in a restricted credential
  record. PAN and CVV never enter this billing contour.
- A zero-amount card-setup `payment.captured` is correlated to purpose
  `platform_card_setup`. It may activate the saved credential but can never mark
  an invoice paid, fulfill an order or create a sale ledger posting.
- After a reusable token is authoritatively confirmed, ElevenHouse creates the
  first internal invoice and the worker calls `/payments/saved-card`.
- The subscription becomes active only after `payment.captured` for that
  invoice. Browser return is not proof.
- A captured ElevenHouse tariff invoice is company SaaS billing, never an
  astrologer sale. It creates no astrologer payable balance and never applies
  the tariff's client-sale commission to itself; revenue recognition follows
  the approved accounting profile.
- One invoice is unique by `(subscription_id, period_start)`. A charge attempt
  has a stable ArcPay `external_id` and one idempotency key for that logical
  attempt.
- The worker, not ArcPay, creates each later billing period/invoice and schedules
  each renewal charge. ElevenHouse owns cancellation, dunning and period state.
- A saved-card MIT may still return `next_action`. The attempt becomes
  `requires_customer_action`, the astrologer receives a secure authenticated
  handoff, and the attempt can become captured only after the challenge and
  canonical provider confirmation. An unattended worker never treats that
  state as a decline or successful renewal.
- A provider timeout or unknown response stays `provider_unknown`; the worker
  reads canonical payment state. The same mutation may be retried with its
  original key only inside ArcPay's documented 72-hour idempotency retention
  window. After that window, the attempt remains blocked in
  `provider_unknown`; canonical provider/webhook/settlement reconciliation must
  resolve it before any new mutation. A new key is allowed only for a new
  attempt after the prior attempt has a confirmed terminal result.
- Automatic retry timing and pre-charge notices come from a versioned billing
  operations policy. Automatic retry cannot be enabled with an absent policy.
- A failed renewal does not revoke already paid time. Access remains through
  `current_period_end`; after that instant the base tariff becomes effective.
- Cancellation stops creation of future periods and charges. Revoking consent
  marks the credential non-chargeable immediately and calls ArcPay
  `DELETE /cards/{card_token_id}`; refunds of past payments use the provider
  payment ID and do not justify retaining a recurring credential.
- Automatic paid-plan billing is not enabled in live mode until sandbox contract
  evidence covers setup tokenization/execution, both 3DS phases, frictionless and
  stepped-up MIT, token revocation, timeout recovery and customer/token scoping.

ArcPay recurring payment links are not the subscription source of truth because
the public contract does not expose a complete plan/subscription CRUD,
cancellation and lifecycle-webhook API.

Invoice and credential edge rules are deterministic:

- setup cancellation/expiry leaves the subscription `incomplete_setup` and
  creates no invoice payment;
- an initial-charge decline leaves the selected paid plan unapplied; the prior
  base plan remains effective;
- dunning exhaustion marks the invoice `uncollectible`; paid access lasts only
  through its already captured `current_period_end`, then resolves to base;
- a credential replacement creates a new version for future attempts; an
  in-flight attempt remains pinned to its original credential and cannot switch
  destination mid-operation;
- revocation prevents new charge jobs immediately and requires a fresh setup for
  reactivation;
- a late capture after cancellation, supersession or an already-created next
  attempt opens a billing incident. It never silently creates overlapping paid
  periods; the operator resolves activation versus refund from canonical
  evidence;
- `provider_unknown` has no time-based success/failure transition. Polling and
  incident escalation continue, and no sequential retry is created until the
  prior attempt is terminal.

### 5.4 Entitlement enforcement

One domain `EntitlementResolver` returns the effective `plan_version_id`,
entitlement keys, limits, expiry and reason. All consumers use this resolver or
its signed/versioned read model; frontend code does not infer access from a plan
name.

Every key in `PlatformPlanFeatureCode` must have one checked-in capability-
manifest entry containing its owning module, exact frontend routes/navigation,
read commands, mutation commands, worker jobs, fallback (`read_only` or
`unavailable`) and usage-counter semantics. `seats`, `bookings`, `ai_requests`
and `automations` additionally define an integer limit, scope, reset period,
reservation/commit/release events and concurrent-enforcement lock. `null` means
unlimited; zero is never overloaded to mean both none and unlimited. A tariff
version cannot be published if it contains an unknown/unmapped feature, a limit
without an atomic counter, or a feature whose module is not implemented. This
keeps future-looking prototype features visible to product work without selling
fake access.

- Every protected operation supplies both a capability and operation kind to
  the resolver. It returns `allow`, `read_only` or `deny`: historical reads and
  already-paid obligations may remain readable, while new work can be denied.
  Only `deny` or a new mutation attempted under `read_only` returns typed
  `403 entitlement_required`; the resolver never blocks permitted historical
  data merely because creation rights expired.
- Worker jobs reload current entitlement when entitlement is required at
  execution time; they do not trust stale browser or queue payload flags.
- Frontend route/navigation gates show the exact design-language lock and an
  upgrade call to action, and also handle a server-side 403 after races.
- Entitlement caches include the subscription/version revision and are
  invalidated by outbox events.
- Expiry never deletes user data. Paid-only workspaces become read-only or
  unavailable with an upgrade explanation, while already paid client
  obligations and deliverables remain accessible for fulfillment.
- New public sales that require an expired entitlement are blocked. Orders
  already paid retain the entitlement and commission snapshot required to
  finish their fulfillment.
- Repository contract tests enumerate every feature code and every protected
  route/command/job in the manifest, then fail on an unguarded or orphaned
  capability. Admin preview shows the affected surfaces before publication.

### 5.5 Current capability manifest

Repository audit shows that every current feature/limit is display-only today:
there is no resolver, guard, worker gate or commercial usage counter. The table
therefore classifies what may become publishable _after_ common enforcement is
implemented. `Live` means a real contour exists; `Partial` and `Absent` remain
unpublishable until the named gap is closed. On expiry, `RO` preserves existing
data/artifacts and blocks new work; `OFF` means no usable feature exists.

| Code         | Current owning surface                                                                        | Launch classification and expiry behavior                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `engine`     | `/chart-engine`; Charts/Calculations/Dictionary and `chart-worker`                            | Live after wiring; saved results RO, preview/job/recalculate OFF                                                                       |
| `pdf`        | calculation PDF endpoints from chart/numerology/matrix/HD; PDF worker                         | Partial: chart PDF currently supports natal only; existing downloads RO, new jobs OFF                                                  |
| `natal`      | `/chart-engine`, `POST /charts/natal/jobs`, `chart-worker`                                    | Live after wiring; saved chart RO, new calculation OFF                                                                                 |
| `synastry`   | `/chart-engine`, `POST /charts/synastry/jobs`, `chart-worker`                                 | Live after wiring; saved result RO, new job OFF; composite command mapping is unresolved                                               |
| `forecast`   | `/chart-engine`, transit/progression job commands                                             | Live after wiring; saved result RO, new job OFF                                                                                        |
| `solar`      | `/chart-engine`, solar-return job command                                                     | Live after wiring; saved result RO, new job OFF                                                                                        |
| `matrix`     | `/matrix`; Matrix/Calculations/AI/PDF                                                         | Live after wiring; saved calculations/reports/notes RO, new calculation/AI/PDF OFF                                                     |
| `numerology` | `/numerology`; Numerology/Calculations/AI/PDF                                                 | Live after wiring; saved calculations RO, new work OFF                                                                                 |
| `hd`         | `/human-design`; HumanDesign/Calculations/Charts/AI/PDF                                       | Live after wiring; saved calculations RO, new work OFF                                                                                 |
| `horar`      | `/chart-engine`, horary job command                                                           | Live after wiring; saved result RO, new job OFF                                                                                        |
| `vedic`      | no canonical Jyotish module/route/API/job                                                     | Absent, unpublishable, OFF                                                                                                             |
| `astrocal`   | `/astro-calendar`; range/generation/retry and worker                                          | Live after wiring; saved calendar RO, generation/retry OFF                                                                             |
| `child`      | frontend child mode currently calls ordinary natal backend command                            | Partial and unpublishable until a server-visible child purpose exists                                                                  |
| `page`       | no astrologer PublicPage editor; `/a/:handle` is currently only a direct-link join foundation | Absent, unpublishable, OFF                                                                                                             |
| `products`   | `/products`; templates, CRUD, publish/archive/duplicate                                       | Live after wiring; existing products RO, new mutation/sale OFF; paid obligations remain fulfillable                                    |
| `calendar`   | `/calendar`; Availability/Booking APIs                                                        | Partial: internal calendar exists, promised public online booking is incomplete; existing bookings remain fulfillable, new booking OFF |
| `crm`        | Clients/BirthData APIs embedded in other surfaces; no `/clients` workspace                    | Partial: backend foundation is not the promised CRM; data RO, CRM mutations OFF                                                        |
| `funnels`    | `/flows`; definition CRUD/validation/simulation                                               | Partial: runtime is explicitly `definition_only`; definitions/history RO, activation/run OFF                                           |
| `group`      | product metadata can say group, but Booking accepts solo only                                 | Absent as a group-session/webinar contour, unpublishable, OFF                                                                          |
| `ai`         | provider-backed interpretation drafts across chart/numerology/matrix/HD/reference             | Partial: real interpretations exist, promised AI nodes do not; saved drafts RO, generation OFF; split/rename required                  |
| `aicontent`  | no Content/AI-content route/API/job                                                           | Absent, unpublishable, OFF                                                                                                             |
| `triggers`   | AstroCalendar and Flows exist separately; no executable transit trigger                       | Absent, unpublishable, OFF                                                                                                             |
| `content`    | only product access-grant metadata; no content/subscription workflow                          | Absent, unpublishable, OFF                                                                                                             |
| `autopost`   | no SocialPublishing/provider contour                                                          | Absent, unpublishable, OFF                                                                                                             |
| `journal`    | no Journal/consent/sharing contour                                                            | Absent, unpublishable, OFF                                                                                                             |
| `video`      | no Sessions/video-provider/consent contour                                                    | Absent, unpublishable, OFF                                                                                                             |
| `recordings` | no Recordings/session/media-retention contour                                                 | Absent, unpublishable, OFF                                                                                                             |
| `inbox`      | `/inbox`; Messaging and delivery/media workers                                                | Partial: real supported adapters must be named; “all channels” is unpublishable; existing obligation threads need an allow-rule        |
| `analytics`  | no `/analytics`; product analytics uses an explicit unavailable adapter                       | Absent, unpublishable, OFF                                                                                                             |
| `refs`       | `/reference`; Dictionary CRUD/overrides/AI draft                                              | Live after wiring; entries RO, CRUD/AI generation OFF                                                                                  |
| `team`       | only a numeric `seatsLimit`; no workspace membership/invite/RBAC                              | Absent, unpublishable, OFF                                                                                                             |
| `whitelabel` | no PublicPage/Branding contour                                                                | Absent, unpublishable, OFF                                                                                                             |
| `api`        | no customer developer credentials/scopes/rate-limit surface                                   | Absent, unpublishable, OFF                                                                                                             |
| `priority`   | no support queue, SLA policy/routing or evidence                                              | Absent, unpublishable until the operational service exists                                                                             |

Publish invariants:

- only `Live` entries may appear in a published version; `Partial`/`Absent`
  entries remain visible only in draft/backlog tooling;
- `engine` is a prerequisite for chart-method keys; shared `pdf` and `ai` never
  grant access to an otherwise unavailable owning module;
- `astrocartography` and `composite` commands currently lack an unambiguous
  tariff key. Publication stops until product truth adds codes or explicitly
  maps them; `child` likewise needs a distinct server-visible purpose;
- `/settings` billing, `/finance`, auth/security/verification, payout access and
  fulfillment of already-paid client obligations are never hidden by a tariff
  feature;
- expiry/downgrade deletes nothing. Historical data/artifacts are RO while new
  sales, calculations, generations and automation starts are blocked.

### 5.6 Quota contract

The four current numeric limit fields are also display-only. Redis AI
anti-abuse limits are not commercial tariff usage, and the current AI usage
recorder is a no-op. Target counters are durable and idempotent:

| Limit         | Scope and atomic lifecycle                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seats`       | Workspace members including owner. Invite reserves, accept commits, expiry/revoke/removal releases under one membership/quota row lock. Until `team` exists, any value above one is invalid.                                                                                             |
| `bookings`    | Unique confirmed bookings from public and manual sources in the versioned usage window. Intent/payment hold reserves; confirmation commits; terminal payment failure/hold expiry releases. Whether a later cancellation returns usage is an explicit tariff policy field, never guessed. |
| `ai_requests` | Every provider-backed AI generation across owning modules, keyed by logical request. Reserve after validation, commit once a result is persisted, release if no result exists; an idempotent replay never consumes twice.                                                                |
| `automations` | Active flow definitions, not run count. Activation reserves/commits and pause/archive releases under the owner quota lock. It is unpublishable while flow runtime remains unavailable.                                                                                                   |

Every counted limit declares UTC anchor, window type/reset rule and
reserve/commit/release events in the tariff version; absence blocks publication.
`null` means unlimited. A numeric limit never enables a missing capability. The
current Start seed has AI/automation numbers without matching capabilities, so
all seed plans remain drafts until this validator passes.

## 6. One-time client purchase

The initial client commerce flow is:

```text
direct-link relationship
  -> public product and slot read
  -> booking hold where applicable
  -> order
  -> one active economic payment intent
  -> checkout_requested -> checkout_ready
  -> ArcPay Hosted Checkout (`one_stage`)
  -> signed webhook plus canonical provider read
  -> captured order and booking/product fulfillment
```

Rules:

- The client can buy only from an astrologer with an explicit direct-link or
  existing relationship. Finance adds no discovery surface.
- Price, currency, tariff commission and applicable risk/fiscal snapshots are
  resolved server-side before provider I/O.
- One order owns one economic payment intent. Provider sessions/operations may
  be retried sequentially, but two simultaneously active checkout sessions for
  the same order are forbidden by a database invariant.
- Economic capture is unique by order. A late second provider capture is
  quarantined as an over-capture incident and queued for operator/refund action;
  it can never post a second sale ledger transaction.
- Checkout creation is CSRF- and idempotency-protected. Provider idempotency is
  separate from browser-command idempotency and both are persisted.
- The public command does not call ArcPay synchronously. It commits the order,
  intent and outbox request, returns `checkout_requested`, and the frontend
  polls the authoritative read until the worker publishes `checkout_ready` with
  an allowlisted ArcPay URL/action, `provider_session_unknown`, or a terminal
  preparation failure. The same protocol prepares card-setup actions for
  platform billing.
- The current public ArcPay contract exposes checkout-session creation but no
  session read, lookup-by-`external_id` or cancellation command. If the create
  response is unknown, the local attempt becomes `provider_session_unknown` and
  may retry only with the same idempotency key inside the documented 72-hour
  retention window. After that window ElevenHouse never creates a replacement
  session automatically. Live enablement requires either a vendor-supported
  lookup/cancel contract or an approved abandonment protocol backed by a
  provider-documented session expiry plus evidence that no URL was persisted or
  delivered and no payment/webhook exists after expiry. Without that evidence,
  the incident and order remain blocked rather than risking a second session.
- Success/failure/cancel URLs return the browser only to a verifying state. The
  client polls an authoritative order/payment read endpoint until captured,
  definitively failed/declined/expired, or still unknown.
- `timeout` is non-terminal. It must not release a booking, display a definitive
  failure or create a new payment blindly.
- `payment.captured` is the only fulfillment signal for the current one-stage
  contour. `payment.authorized` does not fulfill.
- A free product does not enter ArcPay or the paid finance flow.

## 7. Provider webhook and payment lifecycle

### 7.1 Durable inbox

The webhook HTTP boundary performs, in order:

1. read the raw body within an explicit size limit and parse only the bounded
   transport envelope needed for storage;
2. validate HMAC and timestamp skew against the secret and environment of the
   receiving endpoint;
3. persist an encrypted/restricted durable inbox record keyed by
   `(provider, receiving_environment, webhook_id)`;
4. return 2xx quickly after durable storage;
5. process the inbox asynchronously and idempotently, including semantic
   validation of the claimed tenant/environment, livemode, payment, amount and
   currency against authoritative internal state and resolution to exactly one
   immutable `arc_provider_account_id`.

A validly signed event with an amount, currency, tenant, payment or semantic
mismatch is quarantined with a critical alert and no financial side effect. It
still receives 2xx after durable storage so a permanent 4xx does not disable a
dynamic ArcPay callback. An oversized or malformed envelope, invalid signature
or invalid timestamp is rejected before storage; a 5xx is returned only when a
cryptographically valid event cannot be stored reliably.

Each inbox item records processing status, attempts, error class and the last
business checkpoint. A crash after inbox storage or after one internal effect
must resume processing rather than being suppressed as a duplicate.

### 7.2 Provider contract

Ingress accepts any bounded, validly signed ArcPay envelope so a newly added
provider event cannot disable the callback. The processor dispatches only event
types present in the pinned contract; an unknown valid type is stored losslessly,
quarantined and alerted without a business side effect. In particular:

- partial refunds arrive through `payment.refunded` with cumulative payment and
  refund facts; there is no assumed `payment.partially_refunded` webhook;
- `reconciliation.exception` is an internal ElevenHouse event, not an ArcPay
  webhook;
- payout and subscription events are not assumed when absent from the public
  contract.

Transport replay is deduplicated by webhook ID. Economic effects are separately
unique by their semantic provider source: payment ID plus transition, refund ID,
chargeback case/source ID, or settlement entry ID. Every money-changing event is
correlated to the expected merchant tenant,
environment, provider payment, internal intent, amount and currency. Canonical
`GET /payments/{id}` facts repair out-of-order delivery. Provider event storage,
aggregate transition, unique ledger posting, inbox completion and outbox effects
share one PostgreSQL transaction after any required provider read has completed.
A crash before commit leaves no internal effect; a crash after commit sees the
unique source/checkpoint and cannot post twice. Provider mutations use a
persisted operation intent before I/O and a canonical-result transaction after
I/O; idempotency plus reconciliation, not a distributed transaction, closes the
external-call gap.

Each provider payment has one immutable internal purpose:
`client_order`, `platform_invoice` or `platform_card_setup`. Event dispatch is
purpose-specific, so a zero-value setup event cannot become a sale and a tariff
invoice cannot credit an astrologer wallet.

### 7.3 Payment state

```text
economic payment:
created -> checkout_opened -> pending / pending_3ds
       -> authorized | captured | declined | failed | expired | voided
pending states -> timeout/provider_unknown -> later canonical result

clearing evidence (separate projection):
unmatched -> settlement_seen -> provider_matched -> bank_matched
```

The provider-native status, including ArcPay `settled`, remains stored verbatim,
but settlement/clearing evidence does not advance the economic payment aggregate.
`provider_cleared` is a reconciliation projection only and cannot make an
uncaptured payment paid. An unknown attempt opens an operations incident after
the configured polling/escalation SLA, but it never becomes failed merely from
age; a new economic attempt remains forbidden until terminal provider evidence
or an operator reconciliation decision backed by provider evidence exists.

Refunds and chargebacks are child aggregates and append-only reversals, not
destructive rewrites of the payment history.

## 8. Fiscalization and receipts

ArcPay accepts `fiscal_items` on documented payment surfaces and can expose
normalized receipt status through `GET /payments/{id}/receipts`. This proves an
integration surface, not by itself who is the KKT user, whether a legal receipt
was created in every acquiring route, or whether a fiscal failure is atomic with
authorization/capture. ElevenHouse uses ArcPay embedded fiscalization only for a
transaction category and terminal combination proven in sandbox and approved by
legal/accounting. Any other approved mode uses a separately integrated KKT/OFD
adapter; the system does not issue an unplanned duplicate receipt.

The fiscal seller/KKT user is determined by the approved legal model of the
transaction, not by the pooled ArcPay balance or by who stores the receipt URL.
If ElevenHouse is the seller/Merchant of Record for that transaction category,
the receipt uses the approved ElevenHouse legal entity and INN. If ElevenHouse
acts as an agent or commissioner for the astrologer, the receipt must contain
the applicable agent and supplier details. The current public ArcPay
`fiscal_items` contract does not expose the Russian supplier/agent tags needed
to prove embedded agency fiscalization, so that specific ArcPay mode is a launch
blocker until ArcPay documents it and it passes a sandbox contract test. This
does not claim that every possible external KKT agency implementation is
impossible.

ElevenHouse stores:

- the versioned fiscal/accounting configuration snapshot used for the charge;
- transaction category and seller/fiscalization mode approved for it;
- item name, quantity, unit price, VAT/tax tag, payment object, payment method,
  measure, item code and required buyer contact fields when applicable;
- expected and observed receipt obligations for sale, refund or correction,
  with ArcPay payment/refund link where available, receipt type, receipt ID,
  normalized/native status, provider operation ID, OFD URL and safe error
  details;
- timestamps and retry/reconciliation state for asynchronous registration.

Every charge has an immutable fiscal snapshot. Its versioned integer algorithm
enforces `sum(quantity * unit_price after documented rounding) = payment amount`
in minor units before provider I/O. A partial refund allocates its cumulative
amount across the original immutable lines with a deterministic largest-
remainder rule and stable line ordering; each operation posts only the delta
from the prior cumulative allocation, and a final full refund exactly reverses
all original line totals. If ArcPay cannot prove the required partial-refund
receipt/correction behavior for the selected terminal, that transaction mode is
not enabled until an approved alternative KKT flow is integrated.

The values of VAT, payment object/method, seller/cash-register owner and refund
receipt behavior are not guessed from the product UI. They are supplied by an
approved legal/accounting configuration version for each transaction category,
including at least client purchase and ElevenHouse tariff purchase.

Fail-closed behavior is conditional and explicit:

- if the approved transaction mode requires embedded ArcPay fiscalization and
  mandatory fiscal fields are absent, ElevenHouse rejects the command before
  making any ArcPay request;
- if legal/accounting approves a different fiscalization mode, absence of
  `fiscal_items` alone does not block the charge, but the alternative receipt
  reference and reconciliation obligations remain mandatory.

Two independent vendor-contract gates must pass before a transaction category
is charged through ArcPay embedded fiscalization:

1. **Identity gate:** the actual merchant/KKT identity, INN, buyer-contact and
   agent/supplier fields accepted by that exact HPP or saved-card surface match
   the approved legal model.
2. **Atomicity gate:** sandbox evidence records the payment outcome for valid
   and invalid fiscal data, unavailable KKT/OFD and timeout cases. The public HPP
   schema accepting `fiscal_items` is not treated as proof that capture is
   prevented when registration fails.

`failed_before_charge` is used only when canonical evidence proves that neither
authorization nor capture occurred. A timeout, dropped connection or ambiguous
5xx remains `pending_confirmation` with its original operation identity and
idempotency key. A mutation retry is allowed only inside the documented 72-hour
retention window; later recovery uses canonical reads/webhooks/settlement and
blocks a new attempt. An authorized payment must be voided; it is not
reclassified as never charged. If payment is already captured while its receipt is pending,
unavailable or failed, the payment remains captured and a fiscal incident/
correction workflow is opened. Receipt failure never erases the payment or sale
ledger posting.

The client and astrologer billing history can display the stored receipt/OFD
link and honest pending/error state. Missing receipt evidence after a captured
payment creates an operations exception; it is never hidden by a fake receipt.

## 9. Operational ledger, availability and reserve

### 9.1 Ledger invariants

- Every journal transaction balances debit and credit independently per
  currency.
- Money is integer minor units plus explicit ISO currency; no floating-point
  arithmetic and no cross-currency journal transaction.
- Journal rows are append-only. Corrections are reversal plus replacement.
- Unique source keys prevent duplicate sale, refund, chargeback, reserve,
  release and payout postings.
- A source key's `source_id` is the immutable economic/provider/bank fact named
  by that operation (for example the provider payout or bank statement entry),
  not a caller-selected command UUID. Additional one-to-one evidence and
  coverage constraints are database-enforced where one journal key cannot
  encode both identities.
- Wallet balance projections can be rebuilt deterministically from the journal
  and are checked against stored read models.
- Controllers and admin UI never mutate a balance column directly.

Persisted allocation/link proofs are strict mirrors of their journal
transactions: transaction/source identity, entry order, account, side, amount,
and all four business links compare exactly. Their semantic/allocation edge IDs
additionally match the source-transition receipt one-to-one; those IDs are not
invented from journal rows that do not contain them. A proof digest detects
drift but does not authorize a posting or prove atomic commit. Returned payable
lots additionally require a source-transition receipt, and maker-checker
corrections or clearing/exposure matches require opaque receipts issued by
their trusted transactional ports; plain caller-created evidence objects fail
closed.

Every mutation that can touch a refund, chargeback or payout follows one global
PostgreSQL lock order, skipping only rows irrelevant to that operation:

1. order/payment/refund/chargeback aggregate roots in fixed type/ID order;
2. astrologer wallet row;
3. source lots in stable source/lot-ID order;
4. payout requests in ID order;
5. bank-liquidity rows in `(bank_cash_pool_id, currency)` order;
6. bank-exposure rows in ID order.

Payout creation, approval, start-processing, refund reservation and chargeback
processing all use this order plus their `expected_version` checks. Provider or
bank I/O never occurs while these locks are held.

This is an operational subledger, not a guessed statutory chart of accounts.
Approved accounting configuration maps its accounts to the statutory GL and tax
reporting. The target operational accounts are explicit and cannot be replaced
by one generic `platform_clearing` or `manual_adjustment` bucket:

| Account                                                                                                                       | Class / normal balance | Scope and meaning                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arc_provider_clearing`                                                                                                       | asset / debit          | Per `arc_provider_account_id` and currency, where the account fixes provider, tenant, environment and terminal/settlement scope; provider-confirmed merchant position from captures, fees, refunds, chargebacks and ArcPay payouts. A credit balance is a reconciliation exception, not silently accepted cash. |
| `arc_to_bank_clearing`                                                                                                        | asset / debit          | Per source ArcPay provider account, target bank cash pool and currency; ArcPay has confirmed an outgoing merchant payout but that pool's bank credit is not yet statement-matched.                                                                                                                              |
| `bank_cash`                                                                                                                   | asset / debit          | Per bank cash pool/currency; starts at zero for this launch and changes only from imported, deduplicated statement rows for that exact account/pool.                                                                                                                                                            |
| `astrologer_recovery_receivable`                                                                                              | asset / debit          | Per astrologer/currency; principal already paid but recoverable only under the approved commercial/legal policy. It projects as `negative_balance`.                                                                                                                                                             |
| `payout_inflight_refund_bridge`                                                                                               | control / debit        | Per refund, payout and currency; optional platform funding for refunded principal still trapped in `processing_manual`. It can be posted only by an approved bridge policy and must resolve to returned payable, recovery receivable or platform loss.                                                          |
| `chargeback_principal_suspense`                                                                                               | control / debit        | Per ArcPay provider account/currency; temporary provider principal loss awaiting an approved allocation. It is aged and blocked from final accounting closure while non-zero.                                                                                                                                   |
| `astrologer_pending`, `astrologer_available`, `astrologer_reserved`, `astrologer_payout_pending`, `astrologer_refund_pending` | liability / credit     | Per astrologer/currency; mutually exclusive source lots preserve the amount ElevenHouse owes and its availability/reservation state. Refund-pending lots are excluded from payout availability but are not an economic reversal before provider success.                                                        |
| `platform_commission_deferred`, `platform_subscription_deferred`                                                              | liability / credit     | Platform per currency; captured but not yet earned commission or SaaS tariff revenue.                                                                                                                                                                                                                           |
| `bank_outbound_clearing`                                                                                                      | control / credit       | Per bank cash pool/currency; an astrologer transfer is proven paid, but that pool's bank statement debit is not yet matched.                                                                                                                                                                                    |
| `platform_commission_revenue`, `platform_subscription_revenue`                                                                | income / credit        | Platform per currency; recognized only by the approved accounting-policy event.                                                                                                                                                                                                                                 |
| `provider_fee_expense`, `chargeback_fee_expense`, `platform_refund_loss`, `platform_chargeback_loss`                          | expense / debit        | Platform per currency; each expense has a typed source. Loss accounts are usable only when the principal policy allocates the amount to ElevenHouse.                                                                                                                                                            |
| `bank_unmatched_credit_suspense`                                                                                              | control / credit       | Per bank cash pool/currency; unidentified bank credits. They are never wallet funds or revenue by default.                                                                                                                                                                                                      |
| `bank_unmatched_debit_suspense`                                                                                               | control / debit        | Per bank cash pool/currency; unidentified bank debits pending a typed match. It is aged and alerted.                                                                                                                                                                                                            |

The target schema has a typed `source_kind`, `source_id` and unique
`source_operation_key` for every transaction, rather than relying only on a
nullable order or payout ID. Bank accounts additionally require
`bank_cash_pool_id`; provider accounts require `arc_provider_account_id`.
Account ownership/normal balance is constrained in the database. A generic manual adjustment is removed: corrections reverse a
specific source transaction and post a typed replacement under maker-checker
audit.

For the posting matrix below, `G` is client gross, `C` tariff commission,
`P = G - C` astrologer payable, `F` provider fee, `T` ElevenHouse tariff invoice,
`Q` manual payout, `M` ArcPay merchant payout, `B` chargeback principal and `X`
the part of `B` already allocated; `Y` is a later recovery-collection delta. On a chargeback win, `X = O + H + E`:
`O` is outstanding recovery receivable, `H` is astrologer principal already
removed from payable or collected, and `E` is the exact platform allocation;
`U = B - X` is unallocated suspense. For a refund,
`R = A + D + I + K`, where `A` is the astrologer component still present in
exact payable lots, `D` is its already-paid shortfall, `I` is principal inside a
bank-initiated/unknown payout, and `K` is the platform commission component.
Every row is one balanced, idempotent journal transaction unless stated
otherwise:

| Confirmed event                                               | Debit                                                                                                                                                                                           | Credit                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client sale captured                                          | `arc_provider_clearing G`                                                                                                                                                                       | `astrologer_pending P`; `platform_commission_deferred C`                                                                                                                                                         |
| ElevenHouse tariff invoice captured                           | `arc_provider_clearing T`                                                                                                                                                                       | `platform_subscription_deferred T`                                                                                                                                                                               |
| ArcPay/acquirer fee confirmed                                 | `provider_fee_expense F`                                                                                                                                                                        | `arc_provider_clearing F`                                                                                                                                                                                        |
| Commission or tariff revenue earned                           | applicable deferred account                                                                                                                                                                     | matching revenue account                                                                                                                                                                                         |
| Hold release with reserve                                     | `astrologer_pending P`                                                                                                                                                                          | `astrologer_available A`; `astrologer_reserved (P-A)`                                                                                                                                                            |
| Reserve released                                              | `astrologer_reserved`                                                                                                                                                                           | `astrologer_available`                                                                                                                                                                                           |
| Payout requested                                              | `astrologer_available Q`                                                                                                                                                                        | `astrologer_payout_pending Q`                                                                                                                                                                                    |
| Payout rejected/cancelled/definitively failed before transfer | `astrologer_payout_pending Q`                                                                                                                                                                   | the exact original `astrologer_available` lots                                                                                                                                                                   |
| Payout approved or bank work merely initiated                 | no journal entry                                                                                                                                                                                | a separate liquidity exposure is created/advanced                                                                                                                                                                |
| Payout proven paid with bank reference/time/evidence          | `astrologer_payout_pending Q`                                                                                                                                                                   | `bank_outbound_clearing Q`                                                                                                                                                                                       |
| Outbound bank statement debit matched                         | `bank_outbound_clearing Q`                                                                                                                                                                      | `bank_cash Q`                                                                                                                                                                                                    |
| Payout definitively rejected/returned before any bank debit   | `bank_outbound_clearing Q`                                                                                                                                                                      | new `astrologer_reserved Q` lot; no `bank_cash` entry                                                                                                                                                            |
| Returned payout credit after a matched bank debit             | `bank_cash Q`                                                                                                                                                                                   | new `astrologer_reserved Q` lot pending destination/risk review                                                                                                                                                  |
| ArcPay merchant payout confirmed                              | `arc_to_bank_clearing M`                                                                                                                                                                        | `arc_provider_clearing M`                                                                                                                                                                                        |
| Corresponding bank credit statement-matched                   | `bank_cash M`                                                                                                                                                                                   | `arc_to_bank_clearing M`                                                                                                                                                                                         |
| Refund approved and fully funded                              | exact source payable lots `A`                                                                                                                                                                   | `astrologer_refund_pending A`; `D`, `I` and `K` are locked in typed funding reservations, with no provider/revenue/recovery posting yet                                                                          |
| ArcPay refund definitively confirmed                          | `astrologer_refund_pending A`; approved `astrologer_recovery_receivable D` **or** `platform_refund_loss D`; approved `payout_inflight_refund_bridge I`; applicable deferred/revenue account `K` | `arc_provider_clearing R`                                                                                                                                                                                        |
| ArcPay refund definitively failed                             | `astrologer_refund_pending A`                                                                                                                                                                   | the exact original payable lots `A`; non-ledger funding reservations for `D`/`I`/`K` are released                                                                                                                |
| Bridged in-flight payout definitively fails before transfer   | affected `astrologer_payout_pending I` lots                                                                                                                                                     | `payout_inflight_refund_bridge I`; other payout lots follow normal failure release                                                                                                                               |
| Bridged in-flight payout is proven paid                       | approved `astrologer_recovery_receivable I` **or** `platform_refund_loss I`                                                                                                                     | `payout_inflight_refund_bridge I`                                                                                                                                                                                |
| Chargeback principal delta confirmed                          | `chargeback_principal_suspense B`                                                                                                                                                               | `arc_provider_clearing B`                                                                                                                                                                                        |
| Chargeback-processing fee separately confirmed                | `chargeback_fee_expense F`                                                                                                                                                                      | `arc_provider_clearing F`                                                                                                                                                                                        |
| Chargeback principal allocated                                | exact sale/payable lots, deferred/revenue reversal, approved recovery receivable or platform loss totaling `X`                                                                                  | `chargeback_principal_suspense X`                                                                                                                                                                                |
| Approved chargeback recovery collected                        | exact new astrologer payable lots `Y`                                                                                                                                                           | `astrologer_recovery_receivable Y`; collection/source links remain immutable                                                                                                                                     |
| Chargeback won                                                | `arc_provider_clearing B`                                                                                                                                                                       | `astrologer_recovery_receivable O`; new `astrologer_reserved H` lot; exact platform accounts `E`; `chargeback_principal_suspense U`. A returned fee separately debits provider clearing and credits fee expense. |
| Chargeback lost                                               | no duplicate principal posting                                                                                                                                                                  | the provider outcome becomes final; accounting allocation closes only when suspense is zero, otherwise it remains `allocation_blocked` with payouts frozen                                                       |
| Unknown bank statement debit                                  | `bank_unmatched_debit_suspense`                                                                                                                                                                 | `bank_cash`; later matching reclassifies suspense without moving cash twice                                                                                                                                      |
| Unknown bank statement credit                                 | `bank_cash`                                                                                                                                                                                     | `bank_unmatched_credit_suspense`; later matching reclassifies suspense without moving cash twice                                                                                                                 |

Refund and chargeback allocations always retain original sale, component and
payout-allocation IDs. If recovery from an astrologer has not been approved,
`astrologer_recovery_receivable` cannot be posted: refund execution remains
blocked unless an authorized platform-loss allocation fully funds it, while an
externally imposed chargeback remains in suspense and blocks payouts until its
principal allocation is approved.

Representative RUB sale:

```text
Client captured gross                    10,000.00
Tariff commission 4%                        400.00
Astrologer payable                         9,600.00
ArcPay/acquirer fee                          250.00  ElevenHouse expense
ElevenHouse net margin after provider fee    150.00
```

The capture posts a 10,000 asset/clearing increase against 9,600 astrologer
payable and 400 `platform_commission_deferred`. The 250 provider fee is a
separate platform expense and asset reduction; it does not reduce the 9,600
again. The 400 moves from deferred commission to earned platform revenue only
on the accounting-policy event approved for that product, normally authoritative
service/delivery fulfillment. The operational ledger does not silently decide
statutory revenue recognition at capture.

### 9.2 Availability gates

Captured astrologer payable begins in `astrologer_pending`. A single atomic,
idempotent release evaluates:

- capture is authoritative and not over-captured;
- applicable service completion, delivery or cancellation state;
- configured hold measured from service completion/delivery where applicable,
  not blindly from payment capture;
- provider settlement-ledger evidence is matched when the order's snapshotted
  risk policy has `provider_settlement_required=true`; a false snapshot skips
  this release gate but never suppresses clearing/reconciliation state or
  alerts;
- no refund, chargeback, reconciliation or manual risk block exists;
- remaining pending amount accounts for all prior partial reversals.

The approved initial default hold is 48 hours. Its service/delivery anchor and
value are versioned policy data, so an administrator may publish a different
approved version before it becomes effective. It is not hardcoded into payment
handling.

If the effective risk policy reserves 10% of the 9,600 payable, release posts
8,640 to available and 960 to reserved. The percentage may be zero. A separate
reserve-release operation later moves the remaining 960 to available after its
release condition and another dispute check. Reserve is temporary withheld
payable, not additional commission or ElevenHouse revenue.

Release eligibility is a typed registry, not a generic timestamp:

| Sellable product shape                    | Authoritative release input                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment_model=once`, live single session | Booking `completed`; `cancelled` and `no_show` first resolve through the snapshotted cancellation policy and any refund obligation              |
| asynchronous or instant delivery          | Explicit deliverable-created/delivered/accepted contract owned by the product module; paid activation is fail-closed until that contract exists |
| session pack                              | Per-session price allocation and fulfillment/refund progress; no whole-pack release from the first session                                      |
| mini/course/custom                        | A registered product-specific fulfillment adapter; an unknown combination cannot be published as a paid product                                 |
| client `payment_model=sub`                | Outside this delivery and not sellable through the one-time contour                                                                             |

The registry maps each supported product/execution combination to its hold
anchor, cancellation allocator and terminal evidence. A worker cannot infer
delivery from product labels or age. Unsupported combinations remain visible as
drafts but cannot be activated for paid sale.

## 10. Manual astrologer payout

### 10.1 Payout methods

Two typed method schemas are supported:

- `bank_card`: recipient identity plus a bank-side recipient/token reference and
  display mask whenever the manual bank supports it;
- `bank_account`: recipient identity and normalized bank/account fields required
  by the approved bank transfer instruction.

The default card workflow asks the authorized operator to enter or select the
recipient inside the bank's own interface; ElevenHouse does not persist full PAN
merely for convenience. If an approved bank process proves that full PAN
retention is unavoidable, that variant remains disabled until a separate
PCI/CDE enablement gate covers segmentation, KMS/envelope encryption, key
separation/rotation, least-privilege reveal, scans, retention/deletion and
incident response. CVV is never collected. An HMAC fingerprint, not a plain
hash, detects a changed destination without exposing guessable details.
Bank-account instructions and any bank-side recipient token are envelope-
encrypted at rest, masked in ordinary responses and revealed only through the
step-up/audit boundary.

Method lifecycle is explicit:

```text
pending_verification -> active -> replaced | revoked
                     -> rejected
```

Only `active` can be snapshotted into a request. Verification records actor,
ownership/name checks, duplicate fingerprint result, evidence and version;
replacement never mutates the prior method or request.

Each payout request contains an immutable beneficiary snapshot, schema version
and fingerprint. Editing the current payout method never mutates historical
requests. A request is never rebound to a replacement destination. A request in
`requested`, `under_review` or `approved` may be cancelled/rejected and release
its exact lots only while bank initiation is proven not to have started; a new
request then completes the full review and maker-checker cycle. A
`processing_manual` request stays pinned to its old immutable destination until
the bank outcome is definitive. Replacing/revoking the current method flags that
case for operator review but never releases or redirects its funds.

### 10.2 State machine and evidence

```text
requested -> under_review -> approved -> processing_manual -> paid
          -> rejected       -> cancelled
processing_manual -> failed
```

- The astrologer requests an amount from `available`; no tariff commission is
  applied at payout.
- Inside one short PostgreSQL transaction the wallet row is locked, current
  available funds are checked, and exact payable source lots are selected in
  stable `(became_available_at, source_id)` order. Partial lots are split
  deterministically, allocation rows summing to the request amount are
  persisted, and those allocations move `available -> payout_pending`. Two
  concurrent requests cannot spend the same lot or balance. Cancellation,
  rejection or failure normally releases those exact allocations; an allocation
  already consumed by a confirmed in-flight refund instead closes its bridge as
  defined in section 9.1. A paid payout retains all links as immutable
  sale-to-bank traceability for later refund recovery.
- Every administrative transition requires `expected_version`. The update is a
  compare-and-set; a stale operator receives a conflict and reloads current
  state.
- `approved` binds amount, currency, beneficiary fingerprint and the authorized
  `bank_cash_pool_id`. It also creates a bank-liquidity commitment under the
  `(bank_cash_pool_id, currency)` row lock/compare-and-set. Two approvals cannot
  reserve the same available bank cash.
- `processing_manual` means the operator has initiated bank-side work. An
  uncertain bank outcome stays in this state; it is neither failed nor retried
  blindly, and no payout-method edit can cancel or redirect it.
- `paid` requires a unique bank reference, actual transfer timestamp and private
  evidence document/hash. It debits the `payout_pending` liability exactly once
  against `bank_outbound_clearing` and advances, rather than discards, the bank
  liquidity exposure; only later statement matching debits that clearing
  account against `bank_cash` without paying the astrologer again.
- `failed`, `rejected` or `cancelled` releases its exposure exactly once only
  when bank evidence proves that no debit/transfer can still complete. It
  returns unaffected payout-pending lots to their recorded sources; a lot
  consumed by a confirmed bridged refund closes that bridge instead. An
  ambiguous initiated transfer remains `processing_manual`.
- A rejected/returned transfer after `paid` is a new case; the paid request is
  not edited backward. Definitive rejection before any bank debit clears
  `bank_outbound_clearing` directly into a new reserved payable lot. A return
  after a matched debit posts the incoming bank cash against that new lot. Any
  later debit contradicting a `returned_without_debit` proof is quarantined as a
  critical bank-reconciliation incident and cannot pay the astrologer twice.
- Negative balance, active chargeback/refund reservation, invalid method, risk
  block or insufficient bank liquidity prevents approval/execution with a typed
  reason.
- Payout-recipient identity/eligibility is checked against the approved
  verification policy. This is a payout-control/KYC boundary, not ArcPay
  submerchant onboarding.

Until a bank connector exists, bank liquidity is a first-class manual
capability: an authorized operator imports or attests a per-currency bank cash
snapshot for a specific `bank_cash_pool_id` with `as_of`, evidence, source and
expiry. Approval fails on a missing or stale snapshot. Statement rows, manual matches, outstanding liquidity
commitments and variances are retained for reconciliation; an entered number
without evidence is not treated as cash.

### 10.3 Bank liquidity without double counting

A `bank_cash_pool_id` identifies exactly one bank account or one explicitly
approved bank-native sweep pool with a non-overlapping statement source. The
same bank account/statement row cannot belong to two active pools; application-
defined pooling across unrelated accounts is prohibited.

A liquidity snapshot is eligible for payout approval only when it contains the
bank cash pool/account identity, unrestricted available balance, currency,
typed `balance_basis=unrestricted_available`, `as_of`, immutable source
checkpoint/evidence and the statement rows or explicit bank references included
through that checkpoint. A bare balance or screenshot
that cannot prove its cash pool or whether an open payout debit is already
included is retained as evidence but cannot authorize another payout.

Each payout has exactly one versioned bank exposure row bound to the selected
`bank_cash_pool_id` and currency. Its lifecycle is
`committed -> initiated_unreflected -> paid_unreflected -> statement_reflected
-> returned_reflected`, with terminal alternatives `released` after definitive
pre-transfer failure/cancellation and `returned_without_debit` after bank proof
that no debit occurred. States never overlap, and a unique constraint prevents a
second exposure for the same payout.
For an eligible snapshot `S`:

```text
available_bank_liquidity(S)
  = S.unrestricted_available_balance
  - open payout exposures not proven included in S.source_checkpoint
  - approved bank safety buffer
  - unresolved non-payout debit exposures not proven included in S
```

An exposure whose matched bank debit is included in `S` contributes zero to the
subtraction because that debit is already reflected in the balance. An approved
or paid transfer not included contributes its amount exactly once. If inclusion
cannot be determined, approval fails with `bank_evidence_ambiguous`; the system
does not choose between unsafe overstatement and silent double subtraction.
Incoming credits are not spendable until included in an eligible snapshot.

Snapshot adoption, payout approval, exposure transition, statement match and
coverage change all compare-and-set and lock the same
`(bank_cash_pool_id, currency)` liquidity row. A persisted unique coverage edge
links `(exposure_id, snapshot_id)` to the exact included statement row/source
checkpoint; the formula uses only the currently adopted snapshot version.
Approval creates `committed` in that transaction. Bank initiation and `paid`
advance the row; a statement from the same cash pool marks it reflected and
creates coverage atomically. A newer snapshot re-evaluates only that pool's
open exposures before it can become current. The pool-scoped `bank_cash` journal
is updated only from deduplicated statement facts, so evidence snapshots and
commitments never manufacture, transfer or remove cash across pools, and
approval cannot race a match or snapshot replacement.

Permissions are separated into finance read, payout review, payout approval,
sensitive destination reveal, bank execution and paid confirmation. Production
real-money enablement requires maker-checker separation for approval and final
confirmation; one actor cannot perform both sides of the same payout.

## 11. Disputes, refunds and chargebacks

### 11.1 Service dispute and provider refund are separate

The client dispute records the order, reason, description, evidence, parties and
timeline. An admin decision may reject it, approve a full refund or approve a
specific partial amount. The decision does not claim the bank refund has
already succeeded.

For a booking cancellation/no-show, the booking module evaluates the exact
snapshotted cancellation policy and returns a typed refund eligibility/amount
decision. Finance validates and executes that decision; browser code and an
admin form never recalculate the amount from dates.

An approved refund:

1. acquires the order/refund aggregate, wallet, source lots, payout requests and
   affected liquidity/exposure rows in the global order from section 9.1,
   calculates the cumulative client refund and corresponding astrologer/platform
   components, and creates an immutable refund allocation;
2. reclassifies the exact still-unpaid astrologer component from its current
   `pending`, `reserved` or `available` sale lots into
   `astrologer_refund_pending`. A request still in
   `requested/under_review/approved` may be atomically cancelled before bank
   initiation; its unaffected lots return to their recorded sources and its
   immutable amount is never edited. Cancelling an approved request releases its
   exposure and advances the locked cash-pool liquidity revision in that same
   transaction. `processing_manual` and paid payouts are never pretended to be
   recoverable;
3. records already-paid principal as `D` and principal in a
   `processing_manual` payout as typed `in_flight_payout_gap I`, then locks
   funding reservations for `D/I/K`. Approval makes no provider, revenue,
   expense, bridge or recovery-receivable posting. Without an approved platform
   bridge policy, `I > 0` leaves the refund in `blocked_payout_outcome` and no
   provider job is emitted until bank outcome turns that amount into recoverable
   lots or an already-paid shortfall. With that policy, the provider job may be
   emitted only after the whole cumulative delta is covered by reserved payable,
   authorized recovery/platform loss and a bridge reservation;
4. writes an outbox job with a stable provider idempotency key;
5. the worker calls `POST /payments/{id}/refunds` at ArcPay;
6. a definitive provider success or canonical read consumes
   `astrologer_refund_pending`, posts the single cumulative-delta economic
   reversal from the section 9.1 matrix and updates order/refund state;
7. a definitive failure returns each temporary amount to its recorded source
   lot; an unknown result remains processing and reconciles before any retry.

After a bridged refund succeeds, the exact payout allocation closes the bridge:
a definitive pre-transfer failure debits its `astrologer_payout_pending` lot;
confirmed payment reclassifies the bridge to approved recovery receivable or
platform loss. A later returned paid transfer follows the bank-return postings
and creates a new reserved payable lot. That returned lot may close an existing
refund recovery receivable only through a separately approved, source-linked
refund collection operation; when the bridge was allocated to
`platform_refund_loss`, it requires a distinct source-linked loss-recovery
operation that credits the exact original loss allocation. Neither operation is
currently defined by the approved vocabulary or matrix. Therefore the pure
bridge builders may exist, but a production bridge-to-paid policy remains
fail-closed until product, legal and accounting approve both return-resolution
contracts. A chargeback `recovery_collected` source or a generic correction must
not be reused for either path.

ArcPay/acquiring performs the actual return to the original client payment
method. ElevenHouse stores provider refund and receipt evidence.

### 11.2 Partial refund allocation

For a 10,000 captured order with 400 platform commission and 9,600 astrologer
payable, a cumulative 2,500 refund is 25% of gross. The cumulative target
reversal is 100 of the platform commission component and 2,400 astrologer
payable. Depending on fulfillment, the 100 reverses deferred commission, earned
revenue, or a deterministic combination of both. Each later partial refund posts
only the delta from the previous cumulative target. This prevents rounding drift
and guarantees that a final 100% refund reverses exactly 400 and 9,600.

`0 <= cumulative_refunded <= captured_amount` is enforced under a transaction
lock. Refund-versus-payout and two concurrent partial refunds are serialized.

### 11.3 Chargeback

`payment.chargeback` opens a critical case and blocks eligible payout funds once
authoritative. Its lifecycle is explicit:

```text
opened -> provisional_loss -> won_reversed | lost_final
```

Authoritative chargeback processing acquires its order/case, wallet, exact sale
source lots, payout requests, liquidity rows and bank exposures in the global
section 9.1 order. It persists case state, cumulative component allocation,
lot freeze/reclassification, journal postings, inbox checkpoint and notification
outbox atomically. A payout in `requested`, `under_review` or `approved` that
contains an affected lot may be cancelled in full before bank initiation; its
unaffected lots return to their recorded sources and the affected amount is
allocated to the chargeback. Cancelling an approved payout releases its exposure
and advances the locked cash-pool liquidity revision atomically. A
`processing_manual` or paid payout is never
cancelled or rewritten: the attributable shortfall becomes recovery exposure or
platform loss only under the approved principal policy. The
`approved -> processing_manual` command participates in the same locks, so it
cannot race past a chargeback freeze.

The freeze is a command gate, not permission to deny a later bank fact. If a
payout was already `processing_manual` and authoritative bank evidence later
proves the transfer, it still transitions to `paid` and consumes its exact
`payout_pending` allocations even when a refund or chargeback became active in
the meantime; that dispute then accounts for the already-paid amount as an
approved recovery exposure or platform loss. Conversely, an already-recorded
definitive pre-transfer/no-debit outcome conflicts with a later ordinary paid
transition. That contradiction is quarantined for an explicit correction flow
instead of posting both outcomes.

Transport duplicates, later cumulative amounts and won/lost evidence use unique
source-operation keys. No two chargeback/refund/payout transactions can consume
the same source-lot allocation.

Each transition has unique source evidence and balanced postings. A win reverses
the provisional principal loss and restores astrologer payable only to the
extent the approved principal policy allocated that loss to the astrologer; a
provider fee refund reverses platform expense only when separately confirmed.
The win transaction locks recovery collections and derives `O/H/E/U` from
cumulative facts. It credits only the still-outstanding recovery receivable;
principal already collected or previously removed from payable becomes a new
`astrologer_reserved` source lot instead of creating a credit receivable.
The provider chargeback-processing fee is an ElevenHouse expense under the
approved current model. ArcPay's pinned public `payment.chargeback` event does
not contain a fee amount, so authoritative principal is posted immediately and
the fee is a separate `provider_fee/confirmed` transaction only after its own
immutable provider evidence. The system never delays principal waiting for a
fee or substitutes an assumed zero/value. If principal was already paid, the historical payout is
never rewritten. Whether the unrecovered principal becomes astrologer debt,
platform loss or a fault-based allocation is a commercial/legal enablement gate;
the software does not create debt before that policy is approved.

The public ArcPay contract does not provide a complete chargeback outcome
webhook lifecycle. Evidence submission, won/lost resolution and recovery remain
audited internal operations until an official provider contract is available
and sandbox-tested.

## 12. Settlement and reconciliation

`payment.settled` means ArcPay included a payment in a settlement batch. It does
not by itself prove a bank credit or a fully matched reconciliation.

The settlement ingestor:

- polls `GET /settlement/ledger` separately for each immutable
  `arc_provider_account_id`, with a durable account-scoped cursor and overlapping
  time window;
- deduplicates by provider `entry_id` under a unique constraint;
- stores the documented ledger shape losslessly: required `entry_id`, `type`,
  `amount`, `currency`, `direction`, `reference_type`, `reference_id`; and any
  present documented optional fee, balance, occurrence, organization, terminal,
  bank-reference and status fields. Open strings remain opaque, including values
  unknown to current code. Payout status is not invented on ledger entries;
  ArcPay merchant-payout history is a separate endpoint and record type;
- hashes the exact raw response/page bytes before decoding and uses a lossless
  JSON-number parser for OpenAPI `int64` fields, producing bounded canonical
  decimal strings. Standard JavaScript number decoding is not authoritative
  because it loses integer precision above `2^53`; duplicate JSON object keys
  are rejected rather than accepted with last-key-wins semantics;
- correlates only the payment/refund/fee/reserve/merchant-payout value mappings
  proven by pinned sandbox fixtures; unknown combinations go to quarantine;
- records the source payload/digest and match reason;
- checks the provider balance equation and opens explicit exceptions;
- can restart from its checkpoint without losing or duplicating entries.
  Normalized page checkpoints are unique by cursor key, window generation and
  provider page cursor, which also detects multi-page pagination cycles without
  persisting an unbounded seen-cursor history.

`provider_cleared` is an internal evidence state created only after the expected
ArcPay settlement facts match a sandbox-proven, versioned correlation whitelist.
It remains disabled while the terminal lacks settlement scope/fixtures or the
portal behavior conflicts with the pinned OpenAPI. ArcPay
`GET /settlement/payouts` is read-only history of payouts from ArcPay to
ElevenHouse and is used only in this merchant reconciliation; it is never mapped
to astrologer payout requests.

Bank cash and outgoing manual transfers have separate, `bank_cash_pool_id`-
scoped reconciliation records.
An astrologer payout may be requested from internal available payable, but admin
approval/execution also checks unrestricted bank liquidity for the currency.
Manual bank evidence is acceptable in this contour; an automated bank connector
can later implement the same reconciliation port.

## 13. Target data ownership and constraints

The implementation may migrate existing finance tables, but it must converge on
one aggregate per concept rather than create parallel sources of truth.

| Area                | Owned records and key invariants                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tariffs             | `platform_plans`, immutable `platform_plan_versions`, versioned features/limits; one effective base version                                                                                                                                   |
| Platform billing    | subscriptions, billing periods/invoices, versioned saved-card credentials, consent records, setup/charge attempts and customer-action challenges; unique invoice per period                                                                   |
| Entitlements        | tariff-version grants/read model, capability manifest, limit counters/reset periods and revision; no frontend-owned access state                                                                                                              |
| Client commerce     | orders, one economic payment intent per order, asynchronous provider sessions/operations; one captured sale posting per order                                                                                                                 |
| External accounts   | immutable ArcPay provider-account identity `(provider, tenant, environment, terminal/settlement scope)` and bank cash-pool/account identity; no currency-only external account lookup                                                         |
| Provider ingress    | webhook inbox and atomic processing checkpoints; unique transport ID plus semantic payment/refund/chargeback source keys                                                                                                                      |
| Fiscal              | configuration versions, immutable charge/line/refund-allocation snapshots, receipt obligations and observed receipts; category/mode is explicit                                                                                               |
| Ledger              | explicit operational chart/normal balances, provider-account/cash-pool scope, typed source keys, posting matrix, wallet projections and hold/reserve/refund/payout lots; balanced and append-only                                             |
| Refunds/chargebacks | child aggregates, source-lot and typed funding reservations, cumulative component allocation, recovery collection history and provider evidence; cumulative refund bounded by capture                                                         |
| Settlement          | provider-account-scoped durable cursors, lossless deduplicated provider entries, versioned match whitelist and exceptions                                                                                                                     |
| Bank liquidity      | cash-pool-scoped checkpointed snapshots, deduplicated statement rows, one versioned exposure per payout, explicit exposure-to-snapshot coverage, outbound clearing and matches; balance basis, inclusion, freshness and variance are explicit |
| Payouts             | typed method lifecycle, immutable request destination/cash-pool snapshot, exact payable source-lot allocations, request version and evidence; unique bank reference                                                                           |
| Audit               | actor, permission, request ID, before/after state, monetary facts and fingerprints; no full sensitive values                                                                                                                                  |

DB constraints, not application prechecks alone, enforce uniqueness and
financial predicates. Cross-row wallet/payout invariants use a fixed row-lock
order; queue workers use short claims and `SKIP LOCKED` only for queue ownership,
not for calculating balances.

Untrusted wallet-operation input cannot supply its own resource authority. The
composition root resolves the exact effective limit-policy version and supplies
a separate decoder envelope; the domain checks policy identity/applicability,
array cardinality and decimal length against that envelope before enumeration
or `BigInt` conversion. HTTP and storage adapters enforce configured byte limits
before parsing. Missing or mismatched envelope/policy evidence fails closed.

## 14. API, events and jobs

Exact DTOs belong in `packages/contracts`; frontends do not copy them manually.
The implementation plan may preserve compatible route names, but target commands
are explicit rather than a generic unrestricted status setter.

### Client/public API

- product/availability/slot reads required by direct-link checkout;
- create booking intent and order;
- request/reuse the order payment intent, read
  `checkout_requested|checkout_ready|provider_session_unknown|failed`, and
  consume only the worker-produced Hosted Checkout action;
- read authoritative order/payment/receipt state after return;
- list client orders and submit/read service disputes.

### Astrologer API

- read tariff catalog/current subscription/invoices/payment method;
- start saved-card setup, confirm/poll setup, purchase tariff, cancel renewal and
  replace/revoke payment method;
- resolve own entitlements;
- read finance overview/operations/payout history;
- create/replace payout method and create payout request.

### Admin API

- list/create/update draft tariff versions, validate, publish/schedule and
  archive;
- finance overview and complete server-side exports;
- payout queue plus explicit review/approve/start-processing/mark-paid/mark-failed/
  reject commands carrying `expectedVersion`; approval also binds an authorized
  `bankCashPoolId`;
- permissioned sensitive destination reveal with step-up authentication;
- dispute/refund decision and provider-execution status;
- chargeback cases, settlement matches/exceptions and bank reconciliation;
- cash-pool-scoped, evidence-backed bank snapshots, exposure coverage and
  statement matching, all carrying the liquidity `expectedVersion`;
- fiscal, risk, hold, reserve and billing operations configuration versions.

### Durable events/jobs

- tariff version published and subscription/entitlement changed;
- platform invoice due, saved-card charge requested and provider-unknown
  reconciliation;
- provider session/setup preparation and customer-action-required notification;
- provider webhook stored/ready, captured sale, terminal payment and
  reconciliation exception;
- hold release, reserve release and balance projection rebuild;
- refund requested/executed/reconciled and chargeback received;
- payout requested/status changed and evidence recorded;
- notification events for charge notice/result, receipt, dispute and payout.

API transactions persist business state and transactional outbox records.
Workers reload authoritative state by identifier; queue payloads do not carry
trusted money, entitlement or sensitive destination details.

## 15. UI and design contract

`ElevenHouseDesign/` remains visual truth, not business/state-machine truth.

### 15.1 Exact reference map and missing-state rule

Wildcard screenshot names are not evidence: several legacy files named
`*-billing`, `*-chk`, `*-pay` and `*-adm-plan-*` render unrelated prototype
routes. Each implementation slice first opens the exact interactive design
route/state, records the component source and creates a deterministic reference
capture. Only a state verified in that capture may be compared later.

| Surface                    | Exact design route/state and source                                                                   | Production route/role                                 | Reference evidence                                                                                                                                    | Required production difference                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Astrologer finance         | `Кабинет -> Финансы`, `app/finance.jsx:FinanceView`                                                   | `/finance`, astrologer                                | `screenshots/fin-1.png` is legacy visual input on a `1440x900` canvas; fresh `1200x689` capture required                                              | Server-backed four-bucket wallet and real operations only                                                   |
| Astrologer finance mobile  | `Моб. кабинет -> Ещё -> Финансы`, `app/mobile-finance.jsx:MobileFinance`                              | `/finance`, astrologer                                | `screenshots/mfin.png` is a mobile frame inside a `1440x900` desktop canvas, not responsive evidence; fresh `390x844` and `320x568` captures required | Same aggregate/revision as desktop, responsive reflow rather than a desktop mock frame                      |
| ElevenHouse tariff billing | `Кабинет -> Настройки -> Тариф и оплата`, `app/settings.jsx` billing branch plus `app/plans-data.jsx` | `/settings`, astrologer                               | Fresh deterministic capture required; legacy `billing` filenames are not accepted blindly                                                             | Real setup/invoice/subscription lifecycle; click alone never changes plan                                   |
| Client one-time checkout   | `Страница астролога -> paid product -> checkout`, `app/page.jsx` checkout panel                       | `/a/:handle`, linked/direct client                    | Fresh deterministic captures required                                                                                                                 | Asynchronous prepare, redirect/3DS, verifying and canonical result states                                   |
| Client dispute             | `Клиент -> Консультации -> detail -> Сообщить о проблеме`, `app/client.jsx:508-599`                   | `/me`, linked client                                  | Fresh deterministic captures required                                                                                                                 | Real submission/timeline; no promise that money is already refunded                                         |
| Admin tariffs              | `Админка -> Тарифы`, `app/admin-plans.jsx`                                                            | new admin `/tariffs`, authorized admin                | Fresh route-verified captures required; the `01/02/03/04-adm-plan-*` names alone are not state proof                                                  | Draft/validate/publish/schedule/archive, immutable versions and audit                                       |
| Admin disputes             | `Админка -> Споры`, `app/admin.jsx` disputes branch                                                   | new admin `/finance/disputes`, finance operator       | `screenshots/adm-disputes.png`                                                                                                                        | Decision, provider execution and receipt/reconciliation remain separate                                     |
| Admin finance overview     | No exact current design state                                                                         | new admin `/finance/overview`, finance operator       | Must be authored and approved in `ElevenHouseDesign/` before production code                                                                          | Server-complete KPIs, filters, export lifecycle, data freshness and partial-data/error states               |
| Admin chargebacks          | No exact current design state                                                                         | new admin `/finance/chargebacks`, finance operator    | Must be authored and approved in `ElevenHouseDesign/` before production code                                                                          | Provider case, deadline/evidence, provisional loss, won/lost outcome, fee and principal-allocation decision |
| Admin payouts              | No exact current design state                                                                         | new admin `/finance/payouts`, payout operator         | Must be authored and approved in `ElevenHouseDesign/` before production code                                                                          | Manual card/account review, immutable destination, liquidity and bank evidence                              |
| Admin reconciliation       | No exact current design state                                                                         | new admin `/finance/reconciliation`, finance operator | Must be authored and approved in `ElevenHouseDesign/` before production code                                                                          | ArcPay, internal ledger and bank evidence shown as separate layers                                          |

New overview/chargeback/payout/reconciliation states use the existing admin
rail, dense card/table, status-pill, detail drawer and action-panel primitives.
They become visual truth only after the design route, fixture, RU/EN copy,
responsive states and captures are reviewed; production code is not used to
invent the reference retroactively.
Reference artifacts live under
`.design-qa/finance-production/reference/<surface>/<state>/<locale>/<viewport>/`
with screenshot and measured DOM/computed-style JSON. Matching production
artifacts use the same path below `production/`.

### 15.2 Astrologer finance semantics

The prototype's client-subscription `MRR` KPI and `Подписки` operation filter are
removed from this contour. Client recurring subscriptions are out of scope and
must not leak back through analytics. The normal KPI grid is exactly:

1. `Доступно к выплате` / `Available for payout`;
2. `В ожидании` / `Pending`;
3. `Резерв` / `Reserve`;
4. `Заявлено к выплате` / `Payout requested`.

`Отрицательный баланс` / `Negative balance` is a conditional critical banner or
replacement card with reason and recovery status, not a fifth always-visible
metric. Operation filters cover sales, refunds and payouts only. The tariff name
and commission are contextual facts; ElevenHouse platform-subscription billing
lives in Settings, not as client revenue.

The export is named `Финансовая выписка` / `Operational finance statement`. It
is explicitly not a tax declaration or statutory accounting document. Totals
are calculated over the complete server-side filter, not the loaded page, and
the UI covers queued generation, ready download, empty, failed/retry and expired
download-link states.

### 15.3 Platform-plan UI state matrix

The tariff/billing screen renders at least:

- base/no paid subscription and an unavailable-purchase readiness reason;
- setup consent, provider preparation, setup return/poll, 3DS Method/challenge,
  setup failed/expired and credential confirmed;
- initial invoice `charge_queued`, `provider_pending`,
  `requires_customer_action`, `provider_unknown`, declined/failed and captured;
- active monthly/yearly subscription with pinned version and next charge;
- renewal notice, renewal pending, dunning/retry schedule, `past_due` and
  `uncollectible`;
- cancel-at-period-end confirmation, canceled/paid-through date and reactivation;
- payment-method replacement, revocation and in-flight-old-credential warning;
- invoice/receipt pending, succeeded, unavailable/failed and operations support
  reference.

Choosing a plan creates a pending purchase intent. The current plan, commission
and entitlements do not change until the initial invoice is canonically captured.

### 15.4 Checkout, dispute, payout and admin state matrices

Client checkout covers product/slot/price review, server validation, booking
conflict, `checkout_requested`, `checkout_ready`, redirect/return,
`requires_customer_action`, verifying, captured, declined, expired,
`provider_session_unknown`, payment `provider_unknown`, retry only after a
terminal attempt, receipt pending/ready and support escalation. A browser return
never renders immediate fake success.

Client dispute covers eligible/ineligible with reason, evidence upload progress,
validation, submitted timeline, under review, decision rejected/partial/full,
refund processing/unknown/succeeded/failed and receipt link. Admin refund actions
label `decision recorded` separately from `refund confirmed by ArcPay` and show
`blocked_payout_outcome`, bridge authorization and the exact in-flight payout
resolution. Client copy remains truthful processing/support language without
exposing internal recovery policy.

The payout UI preserves only the reference layout primitives. It explicitly
excludes prototype SBP payout, instant payout, schedules/next-payout promises,
payout commission, fake ETA/success, promotions, per-astrologer provider toggles
and any implication that ArcPay pays the astrologer. Its visible states mirror
method verification, wallet reservation, review, approval, manual processing,
unknown bank outcome, paid evidence, failed/rejected/cancelled and returned
transfer.

Admin finance overview covers loading, empty, filtered, server-complete totals,
queued/ready/failed/expired exports, source freshness, partial-data warnings and
source-specific retryable versus blocking errors. No client-subscription MRR is
introduced by this overview.

Admin chargebacks cover `opened`, `provisional_loss`, `won_reversed` and
`lost_final`, provider evidence/deadlines, separately visible provider fee and
the approved or still-blocked principal-allocation decision. They do not reuse
the client service-dispute status or imply that recording a decision changed
provider or ledger state.

### 15.5 Responsive, localization and accessibility acceptance

Each required state is captured in both Russian and English with deterministic
fixtures and these viewport contracts:

| Surface       | Primary desktop | Compact/mobile                           |
| ------------- | --------------- | ---------------------------------------- |
| Astrologer    | `1200x689`      | `390x844`, plus `320x568` reflow check   |
| Client/public | `1200x800`      | `390x844`, plus `320x568` reflow check   |
| Admin         | `1440x900`      | `1024x768` compact and `390x844` stacked |

Desktop finance tables become labelled cards or a horizontally scrollable
semantic table with sticky context on narrow screens; no data column disappears
without an equivalent detail affordance. Dialogs become bottom sheets where the
reference does so. Long English text, large RUB values, UTC-to-user-timezone
dates, empty labels and validation messages are included in fixtures. Shared
i18n namespaces distinguish `platformSubscription` from future
`clientSubscription`; no literal `Подписки` is reused ambiguously.

Acceptance target is WCAG 2.2 AA: semantic headings/table relationships,
labelled dialogs/sheets, focus trap and focus return, visible focus, keyboard-only
completion, error summary/focus, associated field errors, non-color-only status,
contrast, 44x44 CSS-pixel touch targets, 200% zoom and 320 CSS-pixel reflow.
Async payment/refund/payout changes announce concise status through a polite live
region without repeating on every poll; terminal failure uses an assertive alert
only once. Screen-reader checks cover the KPI summary, mobile operation cards,
provider-pending updates and every destructive confirmation.

The interactive design reference was inspected on `localhost:8000`, including
the desktop and mobile Finance routes. Existing `fin-1.png` and `mfin.png` are
both `1440x900` legacy canvases; the latter contains a mobile frame and is not a
real narrow-viewport reflow capture. The prototype checkout changed to success
without a network payment, proving that behavior is visual input only. Fresh
deterministic reference captures at the viewport contracts above remain an
acceptance gate. Authenticated production Finance proof was blocked by auth,
and required client/admin services were unavailable during research;
implementation acceptance must repeat every mapped state against real
network-backed data.

## 16. Security and privacy

- Cookie-auth mutations use the owning API's CSRF policy and Origin/Referer
  allowlist. Browser and provider commands use persisted request hashes and
  idempotency keys.
- Admin permissions are granular. Internal role presence alone does not grant
  every finance mutation.
- Sensitive payout reveal/change, payout approval/start/paid confirmation,
  refund execution, chargeback-principal allocation, bank snapshot attestation/
  match, typed ledger correction and tariff/fiscal/risk-policy publication
  require step-up authentication and immutable audit records.
- Production finance step-up uses WebAuthn/passkey with user verification
  required; password re-entry, email OTP, recovery code or an existing session
  alone is insufficient. The server-issued challenge binds actor/session,
  action kind, aggregate ID, expected version and a canonical command-payload
  hash, including amount/currency, destination fingerprint or policy-version
  digest as applicable. The resulting proof is single-use and expires after at
  most five minutes. A separately enrolled backup passkey is allowed; account recovery
  cannot authorize a finance mutation in the recovery session and enters the
  approved cooling/manual-review policy. Identity must implement this contract
  before sensitive finance actions can be enabled.
- ArcPay keys, HMAC secrets and encryption keys are backend-only, environment
  isolated, rotatable and never rendered or logged.
- Logs exclude PAN, account numbers, saved-card tokens, webhook raw bodies,
  buyer contacts, secrets and evidence contents. Safe identifiers, masks,
  fingerprints and request IDs remain searchable.
- Webhook tenant and environment are bound to configured merchant identity.
- Provider/browser amounts, currency, customer and internal source are compared
  before a financial effect.
- Evidence documents use private object storage, owner/permission checks,
  malware/type/size validation and short-lived access URLs.
- Audit and financial retention satisfy the approved legal period; erasure
  requests cannot destroy records that must legally be retained, but access is
  minimized and purpose-recorded.
- Production card payouts use bank-side entry/tokenization by default. Any
  variant that stores full PAN requires the separate PCI/CDE gate in section 10.

## 17. Reliability, load and operations

- The central ArcPay client uses a distributed tenant/environment rate budget
  for the documented default 10 RPS/burst 20, honors `Retry-After` and uses
  exponential backoff with jitter. The original idempotency key is reused only
  inside ArcPay's documented 72-hour retention; after that, unknown operations
  reconcile and block rather than replay blindly.
- Scheduled workers use unique `(job_kind, subject, due_period)` keys and atomic
  claims so multiple replicas cannot create duplicate invoices, releases or
  postings. A lease is only a scan optimization; if it is ever used for
  correctness it carries a fencing token checked by every write.
- Work is claimed in bounded batches; transactions are short; provider calls
  happen after intent/outbox commit.
- Transaction serialization/deadlock errors retry the whole bounded transaction
  with a cap and observable terminal failure.
- Hot indexes cover provider IDs, active intent/order, due invoices, due holds,
  open payouts and reconciliation cursors. Partitioning is introduced only from
  measured volume, not preemptively.
- Read models and exports aggregate server-side with cursor pagination; admin
  totals never mean “first 50 rows”.
- Readiness checks PostgreSQL plus the queue/provider prerequisites needed by
  that process. Liveness does not falsely claim finance readiness.
- Inbox/outbox, ledger journal and cursors are replayable after worker restart.
  PITR/WAL backup and restore drills are part of operations acceptance.

Key metrics and alerts:

- webhook acknowledgement latency, signature failures, lag, duplicates,
  quarantine count and processing retries;
- captured-not-cleared age, provider balance delta and open reconciliation
  exception age;
- journal imbalance/rebuild mismatch and negative wallet count;
- subscription invoices overdue, provider-unknown charge age and dunning
  failures;
- due hold/reserve backlog and release failures;
- payout queue age, paid-without-evidence, paid-not-bank-matched and bank
  liquidity by cash pool/currency;
- ArcPay 429/5xx/timeouts, queue backlog, lock waits, deadlocks and transaction
  serialization retries.

## 18. Verification contract

Implementation follows behavioral red -> green -> refactor for each observable
slice, then expands to the complete dependency surface.

| Level                   | Required evidence                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts/domain        | tariff version/commission resolver, complete subscription/invoice/credential transitions, fiscal/refund integer allocation including `in_flight_payout_gap`, every row of the account posting matrix, bank-liquidity equation, capability manifest/limit decisions and typed errors                                                                                           |
| PostgreSQL integration  | account ownership/normal-balance shapes, typed source uniqueness, transaction rollback, canonical global lock order, payout/refund/chargeback source-lot and bank-exposure locks, snapshot-inclusion CAS rules, optimistic versions, concurrent checkout/payout/refund/chargeback and snapshot-adoption/statement-match/approval races, projection rebuild and cursor restart |
| API/security            | auth/permission, CSRF, idempotency replay/conflict, no-leak responses, operation-specific `allow/read_only/deny`, WebAuthn transaction binding, webhook signatures/tenant/environment and quarantine semantics                                                                                                                                                                |
| ArcPay contract         | pinned OpenAPI checksum/event enum; setup/tokenize/execute/3DS, transient-token single-use/expiry, frictionless/stepped-up saved-card charge, HPP capture/create-unknown recovery, full/partial refund, fiscal identity/atomicity, receipts, settlement fixtures and idempotency-TTL behavior                                                                                 |
| Worker resilience       | duplicate/out-of-order/unknown webhook, atomic crash checkpoints, provider and checkout-session unknown beyond 72h, tokenization deadline expiry, 429/5xx, worker restart, competing scheduler replicas/fencing and dead-letter recovery                                                                                                                                      |
| Frontend                | RU/EN loading/empty/success/pending/error/disabled/retry states, no frontend finance arithmetic and validated shared contracts                                                                                                                                                                                                                                                |
| Runtime E2E             | real client purchase, tariff purchase/renewal, entitlement unlock/expiry, payout request/admin manual lifecycle with exact source-lot trace, bank snapshot before/after debit without double subtraction, rejection before debit, return after debit, refund blocked on in-flight payout plus approved bridge/failure/paid resolution paths, and post-mutation reads          |
| Baseline/reconciliation | complete shared baseline on a newly created empty database, target trial balance, wallet/source-lot equality, provider/bank control totals, exact-target reset/restore rehearsal on a disposable clone, and post-launch reconciliation replay                                                                                                                                 |
| Design/accessibility    | exact desktop/mobile reference comparison, DOM/computed metrics, keyboard/focus, semantic names, contrast, console and network evidence                                                                                                                                                                                                                                       |
| Load/operations         | webhook burst, concurrent financial mutations, ArcPay limiter, queue recovery, backup/restore and reconciliation replay                                                                                                                                                                                                                                                       |

No live-provider claim is made without ArcPay sandbox credentials and a merchant
terminal whose enabled methods/fiscal behavior are verified. No visible-flow
claim is made if the required authenticated apps are unavailable.

## 19. Migration and delivery order

This document is the umbrella design. Implementation is split into dependent
living ExecPlans with explicit entry/exit gates; no child plan may expose a fake
success while a prerequisite plan is incomplete:

1. **Evidence and prerequisites:** entitlement capability manifest, Identity
   step-up contract, product fulfillment registry and legal/accounting/provider
   decisions. The former authoritative legacy inventory/opening-balance gate is
   removed by the pre-launch rollout amendment.
2. **Finance core:** payment-intent uniqueness, economic payment state separate
   from clearing, durable webhook UoW, target account migration and posting
   matrix, append-only ledger/source lots, reconciliation uniqueness and
   distributed provider budget.
3. **Tariffs and entitlements:** immutable versions as the only commission
   source, publication validator, counters and backend/frontend/worker gates;
   no paid charge yet.
4. **Fiscal/provider foundation:** immutable fiscal snapshots, line/refund
   allocation, receipt obligations, contract fixtures and sandbox
   identity/atomicity gates before either paid contour.
5. **Platform billing:** full setup/tokenize/execute/3DS, invoices, saved-card
   charges, customer-action recovery, dunning and subscription lifecycle.
6. **Client checkout and availability:** worker-mediated Hosted Checkout,
   canonical return reads, fulfillment registry, corrected hold/reserve release
   and provider/settlement evidence.
7. **Refunds and chargebacks:** source-lot reservations, cumulative fiscal and
   economic reversals, principal policy and won/lost recovery.
8. **Manual payouts and bank:** method verification, immutable request, wallet
   lock/version, exact payout-lot allocations, checkpointed bank cash snapshots,
   one-exposure liquidity equation, maker-checker, evidence and bank
   reconciliation.
9. **Product UI and enablement:** author missing design states, implement all
   mapped surfaces, server-complete reports, browser parity/accessibility,
   sandbox E2E, concurrency/load and recovery evidence.

For this pre-launch rollout, rehearsal starts from an empty disposable database
and proves the generated baseline contains every current shared-main schema
change, all finance constraints and only reviewed system seeds. Before the real
reset, operations must prove the exact ElevenHouse production host, database and
container. A backup may be taken solely as protection against selecting the
wrong target; it is not inspected or used as a migration source. The reset,
baseline installation and migration-ledger initialization must be one bounded,
observable run that fails before destructive work when target identity is not
exact.

The post-baseline trial balance is exactly zero. The bank cash pool/account may
exist only as a system directory record with no balance-bearing seed. No opening
balance, initial bank journal, external starting position or synthetic balancing
row is created. Internal astrologer balances, `bank_cash`, provider/bank clearing
and all payable buckets start at zero. The first monetary journal transaction is
not a synthetic opening transaction: it must be rooted in the first real
confirmed economic or bank fact. A provider-confirmed capture may therefore post
provider clearing and payable before merchant settlement. The first journal
movement of `bank_cash` specifically requires the real ArcPay merchant-settlement
flow and its exact deduplicated bank-statement evidence. After this one reset,
the normal rule resumes: production data moves forward through fail-closed
migrations and is never reset implicitly.

## 20. Enablement gates owned outside implementation

The software can implement these boundaries without guessing their values, but
real payments remain fail-closed until the relevant input exists:

1. **Legal/accounting fiscal profile:** seller/Merchant-of-Record versus agency
   model for each transaction category, seller/cash-register owner,
   fiscalization mode, VAT, payment object/method, measure/item codes, buyer
   contact requirement, revenue-recognition event and refund/correction receipt
   rules. ArcPay embedded agency mode additionally requires proven supplier/
   agent-tag support; other approved KKT modes require their own adapter.
2. **Commercial tariff publication:** approved names, prices, cycles,
   commission basis points, features and limits for the initial base and paid
   versions, plus a complete capability manifest for every publishable key.
3. **Billing operations policy:** pre-charge notice and dunning/retry schedule;
   automatic retry is disabled when this version is absent.
4. **Risk policy:** hold anchor/duration, reserve percentage/release delay,
   `provider_settlement_required`, payout minimum and explicit exception
   authority. Values are versioned and may be zero/false where approved; each
   order captures the effective version.
5. **Product fulfillment:** release/cancellation/refund allocator for every paid
   product/execution shape; unsupported shapes cannot be activated.
6. **Refund/chargeback principal:** approved treatment of already-paid principal
   as astrologer recovery, platform loss or fault-based allocation, plus whether
   ElevenHouse may bridge a client refund while the attributable manual payout
   remains `processing_manual`. Without bridge authority, that refund waits for
   the bank outcome.
7. **ArcPay environment:** sandbox/live credentials, merchant tenant ID, terminal
   and settlement-account mapping into immutable `arc_provider_account_id`
   records, payment methods, saved-card support, webhook secret, settlement permissions,
   idempotency-TTL recovery, checkout-session lookup/cancel or documented-expiry
   abandonment evidence, and demonstrated fiscal/receipt behavior.
8. **Identity and payout security:** the transaction-bound WebAuthn contract
   above, an approved recovery cooling/manual-review policy, recipient
   verification/KYC policy, private evidence storage, maker-checker staffing and
   bank-side card-entry/token workflow. Full-PAN storage, if later proven
   necessary, needs separate PCI/CDE approval.
9. **Bank liquidity:** approved non-overlapping bank accounts/cash pools,
   authorized checkpointed snapshot source and balance basis, safety buffer,
   exposure-coverage evidence/inclusion rules, freshness SLA, variance
   escalation and statement-reconciliation procedure.
10. **Runtime authority:** local DB reset/migration and service lifecycle actions
    follow repository runbooks and require their explicit execution authority.

Absence of one gate blocks only the dependent behavior with a typed readiness
error; it never activates a mock, fake success, guessed fiscal tag or hidden
fallback.

## 21. Current repository findings to resolve

The current working tree already contains useful foundations: Hosted Checkout,
order/payment/booking capture UoW, append-only ledger, wallet projections,
manual payout request/admin states, finance screens and a read-only platform
billing catalog. The implementation should preserve these boundaries where
their invariants hold.

Material gaps found in the current code:

- order commission is resolved from finance policy while platform plans carry a
  second percentage;
- more than one active checkout can be created for one pending order;
- `public-api` currently calls ArcPay synchronously and must migrate to the
  worker-mediated `checkout_requested -> checkout_ready` protocol rather than
  leave two provider-I/O ownership models;
- the public ArcPay checkout contract has no session lookup/cancel route, so a
  create-time unknown outcome needs the explicit live-enablement gate in
  sections 6 and 20 rather than a new-key retry;
- provider webhooks do not maintain authoritative payment-attempt status;
- ArcPay webhook `tenant_id` is parsed but not bound to the configured
  ElevenHouse merchant tenant;
- provider event storage and settlement/reconciliation effects are not one
  atomic or resumable operation;
- reconciliation dedupe lacks the required database uniqueness;
- payment-attempt status currently conflates economic payment and settlement/
  clearing evidence;
- a refund before hold release can leave the original full hold releasable;
- reserve configuration exists without reserve posting/release mechanics;
- the current ledger enum collapses provider clearing, revenue, fees and payout
  clearing and lacks deferred revenue, bank cash, source-typed refund/chargeback
  and recovery accounts required by the target posting matrix;
- current external finance records are not uniformly scoped by immutable ArcPay
  provider account or bank cash pool, so currency alone cannot be a lock or
  reconciliation key;
- payout method data is arbitrary/plain JSON and does not support the approved
  card/account secure execution contract;
- payout methods have no verification/active/replaced/revoked lifecycle;
- payout balance checks and status changes lack the required row lock/version
  concurrency controls;
- payout requests do not allocate exact payable source lots, so a later refund
  cannot yet trace which already-paid sale amount became recovery exposure;
- provider payout states remain even though the approved flow is manual-only;
- provider refund initiation is missing;
- admin finance permissions are too broad;
- current admin session auth proves an internal role but provides no
  transaction-bound step-up challenge;
- no evidence-backed bank cash snapshot, liquidity commitment or statement
  capability exists;
- current `paid` payout posting ends at generic `payout_clearing`; there is no
  two-stage `bank_outbound_clearing -> bank_cash` match or checkpoint-aware
  exposure model to prevent liquidity double counting;
- there is no proven full financial-inventory/opening-trial-balance migration
  gate across legacy orders, wallet lots, provider clearing and bank state;
- settlement polling lacks a durable full-history cursor/backfill model;
- current reconciliation processing handles only a narrow payment mapping and
  cannot safely infer all open-string settlement entry types;
- worker intervals can overlap across ticks/replicas and readiness is too weak;
- capture outbox rows exist, but a complete finance-event consumer contour is
  not proven;
- platform billing has no purchase/renew/cancel/entitlement commands;
- plan features and limits are currently display data: there is no central
  resolver, capability manifest, atomic counter or route/job enforcement;
- client checkout/read/return UI is incomplete;
- admin tariff management is missing and finance summaries can be based on
  bounded result pages rather than complete aggregates;
- finance UI files are oversized and must be split only along the touched
  feature boundaries, without unrelated redesign.

The design inventory also has stale readiness rows for astrologer Finance,
mobile Finance, payment commands and admin finance queues. It is updated when
the implementation state and browser evidence change, not used to erase the
gaps above.

## 22. Research

### Questions and affected decisions

- What does the current ArcPay public contract actually support for checkout,
  saved cards, recurring charges, refunds, receipts, settlement and payouts?
- Which system owns subscription scheduling and payout execution?
- How should webhook, ledger, concurrency and sensitive payout data be designed
  so retries and parallel admin actions cannot duplicate money?

### Official and primary sources

- [ArcPay OpenAPI 1.0.0](https://api.arcpay.space/openapi.yaml) — exact public
  paths, schemas and event enum.
- [ArcPay Checkout Sessions](https://finext.gitbook.io/arc-pay/api-reference/checkout-sessions)
  — hosted checkout creation contract and its currently exposed operation set.
- [ArcPay Payments](https://finext.gitbook.io/arc-pay/api-reference/payments) and
  [Refunds](https://finext.gitbook.io/arc-pay/api-reference/refunds) — payment,
  canonical reads, refund and idempotency behavior.
- [ArcPay idempotency](https://finext.gitbook.io/arc-pay/concepts/idempotency) and
  [rate limiting](https://finext.gitbook.io/arc-pay/concepts/rate-limiting) —
  72-hour mutation-key retention and tenant-wide request budget.
- [ArcPay Saved cards and recurring](https://finext.gitbook.io/arc-pay/integration-guides/saved-cards)
  — `/cards/setup`, merchant consent and `/payments/saved-card`.
- [ArcPay JS SDK](https://finext.gitbook.io/arc-pay/integration-guides/js-sdk)
  — Hosted Fields boundary and the transient card token's five-minute,
  single-use contract.
- [ArcPay Settlement API](https://finext.gitbook.io/arc-pay/api-reference/settlement),
  [settlement operations](https://finext.gitbook.io/arc-pay/operations/settlement)
  and [reconciliation](https://finext.gitbook.io/arc-pay/operations/reconciliation)
  — merchant balance/ledger/payout evidence boundaries.
- [ArcPay webhook signing](https://finext.gitbook.io/arc-pay/webhooks/signing) and
  [retries](https://finext.gitbook.io/arc-pay/webhooks/retries) — raw-body HMAC,
  at-least-once delivery, retry and 4xx behavior.
- [ArcPay chargebacks](https://finext.gitbook.io/arc-pay/operations/chargebacks)
  — provider dispute exposure and evidence context.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html),
  [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
  and [INSERT/ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)
  — row serialization, transaction retry and atomic uniqueness.
- [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)
  and [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
  — transaction-specific authorization, audit and secret minimization.
- [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) and
  [NIST SP 800-63B-4 authenticator requirements](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
  — user-verifying public-key assertions, replay resistance and phishing-
  resistant verifier-name binding for sensitive step-up.
- [PCI SSC FAQ: cardholder data storage](https://www.pcisecuritystandards.org/faq/articles/Frequently_Asked_Question/what-are-the-do-s-and-don-ts-for-storing-cardholder-data/)
  — PAN/CVV storage boundary for manual card payouts.
- [Russian Federal Tax Service: supplier details in an agent receipt](https://www.nalog.gov.ru/rn64/news/activities_fts/16514564/)
  — supplier and supplier-INN tags required by the described Russian agency
  receipt model.
- [Russian Federal Tax Service: FFD 1.2 order and formats](https://www.nalog.gov.ru/rn77/about_fts/docs/10020801/)
  — primary regulatory format source for legal/accounting validation.

### Findings

- **Sourced fact:** ArcPay exposes pay-in, capture/void/refund, saved-card setup
  and charges, fiscal receipt reads, settlement balance/ledger and read-only
  merchant payout history.
- **Sourced fact:** saved-card setup is
  `/cards/setup -> tokenize -> execute -> optional 3DS`; a later MIT can also
  return a 3DS `next_action`, and the token is scoped to tenant/customer.
- **Sourced fact:** the browser card tokenization artifact expires after 300
  seconds and is single-use; it is distinct from a canonically confirmed
  reusable saved-card credential.
- **Sourced fact:** the public checkout-session contract currently exposes
  `POST /checkout/sessions` but no session read, lookup-by-external-ID or cancel
  operation, so a lost create response cannot be resolved from that surface
  alone.
- **Sourced fact:** ArcPay keeps an idempotent mutation response for 72 hours;
  the documented default limit is 10 RPS with burst 20 per tenant. Neither
  guarantee permits blind replay after the retention window or independent
  process-local throttling.
- **Sourced fact:** the public OpenAPI has no payout-create route and no complete
  tariff/subscription-management API.
- **Sourced fact:** ArcPay webhook delivery is at least once; a dynamic callback
  can be disabled by a permanent non-429 4xx, so signed semantic mismatches need
  durable quarantine rather than permanent rejection.
- **Sourced fact:** `payment.refunded` may be emitted for each partial refund;
  cumulative facts, not a made-up partial-refund event, determine the delta.
- **Sourced fact:** receipt registration can be asynchronous and ArcPay exposes
  normalized receipt IDs/status/OFD URLs when the configured bank/OFD provides
  them.
- **Sourced fact:** refund uses the provider payment ID and amount, not the saved
  card token; token retention is not required to refund a past payment.
- **Sourced fact:** the public ArcPay fiscal item schema exposes item/tax/payment
  fields but does not expose the supplier/agent tags needed to prove the Russian
  agency receipt model.
- **Sourced fact:** public settlement entry/reference/status values are open
  strings. Exhaustive correlation semantics must be proven by sandbox fixtures,
  not inferred from their names.
- **Inference:** receipt endpoints prove receipt observability, not the legal KKT
  user or capture/fiscal atomicity for every terminal; these stay separate
  contract gates.
- **Architecture decision from primary guidance:** sensitive finance mutations
  use WebAuthn with required user verification and a transaction-bound,
  single-use server challenge; manually entered OTP/password factors are not
  treated as phishing-resistant approval.
- **Repository evidence:** the accepted architecture already requires a
  modular backend, dedicated payment worker, idempotent webhooks, reconciliation,
  ledger correctness, CSRF/idempotency and admin audit.
- **Inference:** ElevenHouse must own tariff versions, subscription invoices,
  recurring scheduling and dunning while ArcPay remains the execution rail.
- **Inference:** the current manual payout must use bank evidence and cannot map
  ArcPay merchant payout history to an astrologer request.

### Options considered

1. **Patch the existing screens and status fields.** Fastest, but preserves two
   commission sources, races, fake provider assumptions and irreconcilable
   balances. Rejected.
2. **Strict Finance bounded context inside the modular monolith plus
   `payment-worker`.** Keeps the critical order/payment/ledger transaction local,
   creates provider ports and scales worker/read workloads independently.
   Selected.
3. **Extract a finance microservice now.** Adds distributed transaction and
   operational failure modes before the domain is stable. Rejected until
   measured load or organizational ownership justifies extraction.

Provider-managed recurring links were also rejected as subscription authority
because the public contract cannot prove complete lifecycle control. ArcPay
submerchant/split settlement and ArcPay astrologer payouts are rejected because
they contradict the approved single-merchant/manual-payout model.

### Decisions and evidence remaining

No further infrastructure-shape choice is required before writing the master
implementation plan: single merchant, internal payable ledger, worker-owned
server ArcPay I/O and manual bank payouts are fixed. The plan must nevertheless keep
the following material product/legal choices as fail-closed gates rather than
guess them:

- legal receipt/KKT model and revenue-recognition event per transaction type;
- tariff prices/features/limits and the exact publishable capability manifest;
- explicit tariff mapping for `astrocartography`, `composite` and the
  server-visible `child` purpose, plus quota-window/cancellation semantics;
- fulfillment/release/cancellation rules for non-live product shapes;
- treatment of already-paid refund/chargeback principal and authority to fund an
  in-flight-payout refund bridge;
- operational risk, dunning, approved bank cash pools/balance basis, liquidity
  freshness/safety-buffer and recipient-verification values;
- ArcPay-supported checkout-session lookup/cancellation or documented expiry
  evidence sufficient for the fail-closed abandonment protocol;
- Identity recovery cooling/manual-review values for the selected WebAuthn
  finance-authorization contract.

The written design itself awaits user review. After approval, the next artifact
is a master ExecPlan split into the dependent child plans in section 19; no
application implementation begins from this draft alone.
