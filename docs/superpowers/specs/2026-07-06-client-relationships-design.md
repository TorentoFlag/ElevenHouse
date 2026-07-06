# Client Relationships And Birth Data Design

Date: 2026-07-06
Status: approved for implementation planning
Scope: client-web direct-link entry, public-api client registration, astrologer-api client list, numerology client selector

## Goal

Build the production foundation for invite/direct-link clients in ElevenHouse.
A client can join the platform only through a specific astrologer's direct link.
After registration or login through that context, the platform creates a durable
relationship between the client account and that astrologer. Astrologers then
work only with clients explicitly related to them.

This unlocks the Numerology "Client" selector from the design reference without
introducing fake CRM data, public discovery, or manual client records in the
first release.

## Inputs Reviewed

- User decision on 2026-07-06: ship platform-registered clients only; manual
  astrologer-created clients are future scope.
- User decision on 2026-07-06: do not add an explicit consent step now.
- User decision on 2026-07-06: store the full birth-data model from the start,
  not only birth date.
- `AGENTS.md`
- `docs/architecture/design-reference-inventory.md`
- `docs/api/api-boundaries.md`
- `docs/architecture/backend-modules.md`
- `docs/architecture/account-role-model.md`
- `docs/product/full-functional-scope.md`
- `docs/product/roadmap.md`
- `docs/superpowers/specs/2026-07-05-numerology-calculations-design.md`
- `ElevenHouseDesign/app/crm.jsx`
- `ElevenHouseDesign/app/crm-data.jsx`
- `ElevenHouseDesign/app/client.jsx`
- Current code in `apps/public-api`, `apps/client-web`,
  `apps/astrologer-api`, `apps/astrologer-web`, `packages/contracts`,
  `packages/domain`, and `packages/db`.
- Best-practice research:
  - OWASP Authorization Cheat Sheet
  - OWASP Multi-Tenant Security Cheat Sheet
  - OWASP Forgot Password Cheat Sheet
  - NIST SP 800-63B
  - Crunchy Data: Designing Your Postgres Database for Multi-tenancy
  - Supabase/Postgres guidance on FK, composite, and WHERE/JOIN indexes

## Product Principles

1. ElevenHouse is not a marketplace. There is no public astrologer discovery.
2. Client entry is scoped to a direct link of a specific astrologer.
3. A client can be related to multiple astrologers, but only through explicit
   platform events such as direct-link join now and future booking/order/manual
   flows later.
4. Relationship creation is idempotent. Reopening the same astrologer's link
   must not create duplicate CRM rows.
5. The current release has no separate consent step. A successful join through
   an astrologer direct link creates a working relationship visible to that
   astrologer.
6. Birth data is a first-class client data contour and must support astrology,
   numerology, matrix and human-design use cases from the start.
7. Calculations snapshot birth data at calculation time. Later client-profile
   edits do not mutate old calculation results.
8. API surfaces must derive astrologer/client context from authenticated
   session and durable relationship rows, not from caller-supplied tenant ids.

## Release Slice

### Included

- Client relationship persistence for platform-registered clients.
- Full birth-data persistence model for a client account.
- Public direct-link join flow foundation.
- Relationship creation during client registration through an astrologer link.
- Relationship creation during client login through an astrologer link.
- Client cabinet context for "my related astrologers".
- Astrologer client list API returning only clients related to the signed-in
  astrologer.
- Numerology client selector using the astrologer client list API.
- Server-side validation that CRM-linked numerology participants belong to the
  signed-in astrologer.

### Deferred

- Manual client creation by an astrologer.
- CSV import.
- Fine-grained birth-data consent screens.
- Consent audit UX and revocation workflow.
- Booking/order/lead-magnet relationship sources beyond direct-link join.
- CRM tags, stages, notes, LTV, orders, inbox and automation fields from the
  design reference.
- Public astrologer page visual completeness beyond the join/auth context
  needed for the client relationship flow.

Deferred items must not be faked with localStorage, mock clients, disabled
success states, or manual UUID input.

## Domain Model

### ClientProfile

One profile per platform user account with role `client`.

Fields:

- `userId`
- `displayNameSnapshot`
- `preferredLocale`
- `timezone`
- `createdAt`
- `updatedAt`

`displayNameSnapshot` mirrors the current identity profile name for fast client
lists. The identity `user_profiles` table remains the durable account profile.

### ClientBirthData

One active birth-data record per client account in this release. The model is
designed so future versions can allow multiple named birth-data records.

Fields:

- `id`
- `clientUserId`
- `label`
- `birthDate`
- `birthTime`
- `birthTimePrecision`: `exact`, `approximate`, `unknown`
- `birthPlaceText`
- `birthCountryCode`
- `birthCity`
- `birthRegion`
- `birthTimezone`
- `birthLatitude`
- `birthLongitude`
- `source`: `client_profile`, future `booking`, `import`, `manual`
- `createdAt`
- `updatedAt`

Rules:

- `birthDate` is nullable until the client fills profile data.
- `birthTime` is nullable when precision is `unknown`.
- Coordinates are nullable until a geocoding/provider contour exists.
- Numerology requires `birthDate`.
- Chart-like modules may require date, time and place depending on method.

### ClientAstrologerRelationship

Durable relationship between a client user account and an astrologer user
account.

Fields:

- `id`
- `clientUserId`
- `astrologerUserId`
- `source`: `direct_link`, future `booking`, `order`, `lead_magnet`, `manual`
- `status`: `active`, future `archived`, `blocked`
- `firstLinkedAt`
- `lastLinkedAt`
- `createdAt`
- `updatedAt`

Rules:

- Unique pair: `clientUserId + astrologerUserId`.
- `clientUserId` must have the `client` role.
- `astrologerUserId` must have the `astrologer` role.
- Rejoining the same astrologer updates `lastLinkedAt` and keeps the same
  relationship.
- A client may have active relationships with multiple astrologers.

### ClientJoinIntent

Short-lived opaque join context created from an astrologer public handle.

Fields:

- `id`
- `tokenHash`
- `astrologerUserId`
- `publicHandleSnapshot`
- `status`: `pending`, `claimed`, `expired`
- `createdAt`
- `expiresAt`
- `claimedByClientUserId`
- `claimedAt`
- request metadata such as IP/user-agent hash if already available in the
  security layer

Rules:

- Tokens are opaque and random.
- Store only token hashes.
- Intents expire.
- Claiming an intent is idempotent for the same client and astrologer.
- Intent claim must run in the same transaction as registration/session
  creation when used during registration.

## Persistence

Recommended tables:

- `client_profiles`
- `client_birth_data`
- `client_astrologer_relationships`
- `client_join_intents`

Indexes:

- `client_profiles_user_id_pk`
- `client_birth_data_client_user_idx`
- `client_astrologer_relationships_astrologer_status_idx`
  on `(astrologer_user_id, status)`
- `client_astrologer_relationships_client_status_idx`
  on `(client_user_id, status)`
- `client_astrologer_relationships_unique`
  on `(client_user_id, astrologer_user_id)`
- `client_join_intents_token_hash_unique`
- `client_join_intents_astrologer_status_idx`
  on `(astrologer_user_id, status)`
- FK indexes for every referencing column.

The relationship table is the tenant isolation boundary for astrologer client
queries. Queries listing clients for an astrologer must filter by
`astrologer_user_id` and `status = 'active'` before joining client profile and
birth-data rows.

## API Boundaries

### `public-api`

Public/client-facing responsibilities:

- Resolve direct-link astrologer context.
- Create join intent from public handle.
- Register a new client and claim join intent.
- Login an existing client and claim join intent.
- Return the current client's related astrologer contexts for the client
  cabinet.
- Let the authenticated client read/update their own birth data.

Routes:

```text
GET  /a/:handle
POST /client-join-intents
POST /identity/registration/passwordless/verify-code
POST /identity/passwordless/verify-code
GET  /me/astrologers
GET  /me/birth-data
PUT  /me/birth-data
```

The existing passwordless verify routes should accept an optional
`clientJoinIntentToken` in the request body. If absent, current behavior remains
unchanged. If present and valid, the handler creates or refreshes the
relationship after successful authentication.

### `astrologer-api`

Astrologer-facing responsibilities:

- List only clients related to the signed-in astrologer.
- Return enough profile and birth-data information for workspace selectors.
- Validate client ownership/relationship in calculations and future CRM flows.

Routes:

```text
GET /clients
GET /clients/:clientUserId
```

`GET /clients` supports search and pagination. It does not expose unrelated
platform clients.

### `client-web`

- Public direct-link route captures the join intent token.
- Auth route carries the token through request-code and verify-code steps.
- After successful registration/login, client lands in `/me` with the related
  astrologer visible in cabinet context.
- Birth-data form writes to `public-api /me/birth-data`.

### `astrologer-web`

- Numerology setup uses a real client selector populated from
  `astrologer-api /clients`.
- Selecting a client fills display name and birth data from the API response.
- Manual UUID entry is removed from production UI.
- If selected client has no `birthDate`, the calculation action is blocked with
  a clear field-level error.

## Authorization And Security

- Public registration remains client-only. The caller cannot request the
  astrologer role.
- Login and registration OTP flows keep existing rate limits, TTLs, single-use
  challenge semantics, and generic invalid-code behavior.
- Client join intent tokens are random, hashed at rest, single-use from the
  intent perspective, and short-lived.
- Relationship creation never trusts a raw astrologer id from the browser.
  The server resolves the astrologer from the join intent.
- Astrologer client reads derive `astrologerUserId` from the authenticated
  session.
- Numerology CRM-linked participants are accepted only if an active relationship
  exists for the signed-in astrologer and the requested `clientUserId`.
- `clientId` in calculation snapshots means `clientUserId` for the platform
  client account.

## Numerology Integration

The current numerology release already supports `crm_client` participants in
contracts and persistence. This design makes that source production-backed.

Rules:

- Setup modal shows a client search/select, not a free UUID field.
- Individual calculation requires one selected client or future manual mode.
  In the current platform-client slice, the visible default is CRM client.
- Compatibility calculation allows two platform clients related to the
  astrologer.
- Selecting the same client twice is invalid.
- Calculation input includes:
  - `source: "crm_client"`
  - `clientId: clientUserId`
  - `displayName`
  - `birthDate`
  - future optional birth-time/place fields as calculation methods need them.
- Calculation persistence stores the participant input snapshot, including the
  birth-data fields used at calculation time.

## Testing And Acceptance

Required before calling this production-ready:

- Domain unit tests:
  - create relationship on direct-link join;
  - idempotently refresh existing relationship;
  - allow one client to relate to multiple astrologers;
  - reject relationship with missing client or astrologer role;
  - normalize and validate birth-data precision rules.
- Contract tests:
  - join intent request/response schemas;
  - optional join intent token in passwordless verification;
  - client list response with birth data;
  - birth-data read/update schemas.
- DB adapter tests:
  - relationship unique pair;
  - list clients by astrologer;
  - list astrologers by client;
  - birth-data upsert;
  - join intent hash lookup and claim.
- API e2e tests:
  - new client registers through astrologer link and relationship is created;
  - existing client logs in through second astrologer link and gets a second
    relationship;
  - repeated same-link login does not duplicate the relationship;
  - astrologer cannot list unrelated clients;
  - numerology rejects a CRM client unrelated to the current astrologer.
- Frontend tests:
  - auth flow preserves join intent token;
  - numerology selector uses API clients and removes manual UUID entry;
  - missing birth date blocks calculation.
- Browser QA:
  - direct-link page to auth to `/me`;
  - existing client joins second astrologer;
  - astrologer numerology client selector uses real related clients.

## Documentation Updates

Update these docs with implementation status as the feature lands:

- `docs/architecture/design-reference-inventory.md`
- `docs/api/api-boundaries.md`
- `docs/architecture/backend-modules.md`
- `docs/product/roadmap.md`
- `docs/superpowers/specs/2026-07-05-numerology-calculations-design.md`

## References

- OWASP Authorization Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Multi-Tenant Security Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- OWASP Forgot Password Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- NIST SP 800-63B:
  https://pages.nist.gov/800-63-3/sp800-63b.html
- Crunchy Data Postgres multi-tenancy:
  https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy
