# Client Relationships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production direct-link client foundation: platform client profiles, full birth data, client-astrologer relationships, invite/join context, real astrologer client APIs, and Numerology client selection.

**Architecture:** Add a shared `Clients` domain contour and Drizzle persistence, then wire it into `public-api` identity flows and `astrologer-api` client reads. Frontends consume those contracts; Numerology stops accepting manual CRM UUID input and relies on server-validated relationship data.

**Tech Stack:** TypeScript, Vitest, NestJS, Drizzle/PostgreSQL, Zod via `@elevenhouse/validation`, React 19, React Router, TanStack Query, ElevenHouse design system.

---

## Scope Check

This plan spans several surfaces, but they are one dependency chain rather than independent products:

1. Domain/contracts/database define the durable client relationship model.
2. `public-api` creates relationships from direct-link registration/login.
3. `client-web` preserves join context and exposes profile/birth-data entry.
4. `astrologer-api` lists only related clients.
5. Numerology consumes that list and validates relationships on the backend.

Manual CRM creation, CSV import, CRM stages/notes/tags/LTV/inbox, and fine-grained consent UX are excluded from this implementation. Do not fake them with local arrays or localStorage.

## File Structure

Create shared client domain files:

- `packages/domain/src/clients/client-types.ts`: client profile, full birth data, relationship, join intent and list item types.
- `packages/domain/src/clients/client-errors.ts`: relationship, role, intent and birth-data errors.
- `packages/domain/src/clients/client-store.ts`: persistence port for profiles, birth data, relationships and join intents.
- `packages/domain/src/clients/client-use-cases.ts`: create/claim join intent, ensure relationship, list related clients, upsert/read birth data.
- `packages/domain/src/clients/index.ts`: public exports.
- `packages/domain/src/clients/index.test.ts`: domain behavior tests.
- `packages/domain/src/index.ts`: export `./clients`.

Create shared contracts:

- `packages/contracts/src/clients.ts`: join intent, related astrologers, astrologer client list, birth-data schemas.
- `packages/contracts/src/clients.test.ts`: schema normalization and rejection tests.
- `packages/contracts/src/identity.ts`: optional `clientJoinIntentToken` on passwordless verification request schemas.
- `packages/contracts/src/identity.test.ts`: compatibility and token validation tests.
- `packages/contracts/src/index.ts`: export `./clients`.

Create database schema and adapters:

- `packages/db/src/schema/clients/client-values.ts`: enum values.
- `packages/db/src/schema/clients/client-profiles.schema.ts`
- `packages/db/src/schema/clients/client-birth-data.schema.ts`
- `packages/db/src/schema/clients/client-astrologer-relationships.schema.ts`
- `packages/db/src/schema/clients/client-join-intents.schema.ts`
- `packages/db/src/schema/clients/relations.schema.ts`
- `packages/db/src/schema/clients/index.ts`
- `packages/db/src/schema/index.ts`: export clients schema.
- `packages/db/src/schema.test.ts`: schema export and constraints coverage.
- `packages/db/src/adapters/clients/drizzle-client-store.ts`
- `packages/db/src/adapters/clients/index.ts`
- `packages/db/src/adapters/clients/drizzle-client-store.test.ts`
- `packages/db/src/adapters/identity/account-registration/drizzle-customer-registration-session-unit-of-work.ts`: include client store methods in registration transaction.
- `packages/db/src/adapters/identity/passwordless-auth/drizzle-passwordless-auth-unit-of-work.ts`: include relationship claim methods in login transaction.
- `packages/db/src/adapters/index.ts`: export clients adapter.
- `packages/db/drizzle/0000_dazzling_metal_master.sql`: regenerate current migration after schema changes, per repo rules.

Create `public-api` modules:

- `apps/public-api/src/modules/client-join/client-join.module.ts`
- `apps/public-api/src/modules/client-join/client-join.controller.ts`
- `apps/public-api/src/modules/client-join/client-join.service.ts`
- `apps/public-api/src/modules/client-join/client-join.tokens.ts`
- `apps/public-api/src/modules/client-join/client-join.service.test.ts`
- `apps/public-api/src/modules/client-profile/client-profile.module.ts`
- `apps/public-api/src/modules/client-profile/client-profile.controller.ts`
- `apps/public-api/src/modules/client-profile/client-profile.service.ts`
- `apps/public-api/src/modules/client-profile/client-profile.tokens.ts`
- `apps/public-api/src/modules/client-profile/client-profile.service.test.ts`
- `apps/public-api/src/modules/identity/passwordless/identity-passwordless.handler.ts`: claim join intent after successful login.
- `apps/public-api/src/modules/identity/registration/identity-registration.handler.ts`: claim join intent in registration transaction.
- `apps/public-api/src/modules/identity/*.test.ts`: login/registration claim behavior.
- `apps/public-api/src/app.module.ts`: import new feature modules.

Create `client-web` files:

- `apps/client-web/src/features/client-join/api/clientJoinApi.ts`
- `apps/client-web/src/features/client-join/model/clientJoinStorage.ts`
- `apps/client-web/src/features/client-profile/api/clientProfileApi.ts`
- `apps/client-web/src/pages/public-astrologer/PublicAstrologerPage.tsx`
- `apps/client-web/src/pages/public-astrologer/PublicAstrologerPage.test.tsx`
- `apps/client-web/src/pages/auth/helpers/authFlowModel.ts`: include stored join token in verification request.
- `apps/client-web/src/pages/auth/hooks/usePasswordlessAuthFlowHandlers.ts`: preserve join token through request/verify.
- `apps/client-web/src/pages/me/MePage.tsx`: show related astrologers and birth-data form.
- `apps/client-web/src/router.tsx`: add `/a/:handle`.

Create `astrologer-api` client module:

- `apps/astrologer-api/src/modules/clients/clients.module.ts`
- `apps/astrologer-api/src/modules/clients/clients.controller.ts`
- `apps/astrologer-api/src/modules/clients/clients.service.ts`
- `apps/astrologer-api/src/modules/clients/clients.tokens.ts`
- `apps/astrologer-api/src/modules/clients/clients.service.test.ts`
- `apps/astrologer-api/src/modules/clients/clients.e2e.test.ts`
- `apps/astrologer-api/src/app.module.ts`: import clients module.

Modify Numerology:

- `apps/astrologer-api/src/modules/numerology/numerology.service.ts`: validate `crm_client` participants against active relationships.
- `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`: reject unrelated CRM clients.
- `apps/astrologer-web/src/features/clients/api/clientsApi.ts`
- `apps/astrologer-web/src/features/clients/model/clientSelectorModel.ts`
- `apps/astrologer-web/src/features/numerology/components/NumerologySetupModal.tsx`: replace CRM UUID input with selector.
- `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.ts`: participant hydration from selected client.
- `apps/astrologer-web/src/pages/numerology/NumerologyPage.tsx`: load clients query and pass options.
- `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`: no manual UUID field; missing birth date blocks calculation.

## Task 1: Clients Domain Contour

**Files:**
- Create: `packages/domain/src/clients/client-types.ts`
- Create: `packages/domain/src/clients/client-errors.ts`
- Create: `packages/domain/src/clients/client-store.ts`
- Create: `packages/domain/src/clients/client-use-cases.ts`
- Create: `packages/domain/src/clients/index.ts`
- Create: `packages/domain/src/clients/index.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing domain tests**

Create `packages/domain/src/clients/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BirthDataValidationError,
  ClientAstrologerRelationshipRoleError,
  ClientJoinIntentError,
  claimClientJoinIntent,
  createClientJoinIntent,
  listAstrologerClients,
  normalizeClientBirthDataInput,
  upsertClientBirthData
} from "./index";
import type { ClientStore } from "./client-store";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const secondAstrologerUserId = "33333333-3333-4333-8333-333333333333";
const now = "2026-07-06T10:00:00.000Z";

describe("clients domain", () => {
  it("creates and claims a direct-link relationship idempotently", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId]
    });
    const intent = await createClientJoinIntent({
      store,
      tokenGenerator: () => "plain-token",
      tokenHasher: (token) => `hash:${token}`,
      idGenerator: () => "44444444-4444-4444-8444-444444444444",
      astrologerUserId,
      publicHandleSnapshot: "alisa-vega",
      now,
      expiresAt: "2026-07-06T11:00:00.000Z"
    });

    await claimClientJoinIntent({
      store,
      token: intent.token,
      tokenHasher: (token) => `hash:${token}`,
      clientUserId,
      now: "2026-07-06T10:05:00.000Z"
    });
    await claimClientJoinIntent({
      store,
      token: intent.token,
      tokenHasher: (token) => `hash:${token}`,
      clientUserId,
      now: "2026-07-06T10:06:00.000Z"
    });

    expect(store.relationships).toHaveLength(1);
    expect(store.relationships[0]).toMatchObject({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      status: "active",
      firstLinkedAt: "2026-07-06T10:05:00.000Z",
      lastLinkedAt: "2026-07-06T10:06:00.000Z"
    });
  });

  it("allows one client to join multiple astrologers", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId, secondAstrologerUserId]
    });

    await store.ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now
    });
    await store.ensureRelationship({
      clientUserId,
      astrologerUserId: secondAstrologerUserId,
      source: "direct_link",
      now
    });

    expect(store.relationships.map((row) => row.astrologerUserId)).toEqual([
      astrologerUserId,
      secondAstrologerUserId
    ]);
  });

  it("rejects relationship creation when account roles are missing", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [],
      astrologerRoleUsers: [astrologerUserId]
    });

    await expect(
      store.ensureRelationship({
        clientUserId,
        astrologerUserId,
        source: "direct_link",
        now
      })
    ).rejects.toBeInstanceOf(ClientAstrologerRelationshipRoleError);
  });

  it("normalizes full birth data and enforces unknown time rules", () => {
    expect(
      normalizeClientBirthDataInput({
        label: "  Основные данные  ",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: " Москва, Россия ",
        birthCountryCode: " ru ",
        birthCity: " Москва ",
        birthRegion: " Московская область ",
        birthTimezone: " Europe/Moscow ",
        birthLatitude: 55.7558,
        birthLongitude: 37.6173,
        source: "client_profile"
      })
    ).toMatchObject({
      label: "Основные данные",
      birthDate: "1990-03-14",
      birthTime: "08:25",
      birthTimePrecision: "exact",
      birthPlaceText: "Москва, Россия",
      birthCountryCode: "RU",
      birthCity: "Москва",
      birthRegion: "Московская область",
      birthTimezone: "Europe/Moscow",
      birthLatitude: 55.7558,
      birthLongitude: 37.6173,
      source: "client_profile"
    });

    expect(() =>
      normalizeClientBirthDataInput({
        birthTime: "08:25",
        birthTimePrecision: "unknown",
        source: "client_profile"
      })
    ).toThrow(BirthDataValidationError);
  });

  it("lists only clients related to the requested astrologer", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId, secondAstrologerUserId]
    });
    await store.upsertClientProfile({
      userId: clientUserId,
      displayNameSnapshot: "Марина Краснова",
      preferredLocale: "ru",
      timezone: "Europe/Moscow",
      now
    });
    await upsertClientBirthData({
      store,
      clientUserId,
      now,
      data: {
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва, Россия",
        source: "client_profile"
      }
    });
    await store.ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now
    });

    await expect(
      listAstrologerClients({ store, astrologerUserId, query: "", limit: 20, offset: 0 })
    ).resolves.toMatchObject({
      total: 1,
      clients: [
        {
          clientUserId,
          displayName: "Марина Краснова",
          birthData: {
            birthDate: "1990-03-14",
            birthTime: "08:25",
            birthPlaceText: "Москва, Россия"
          }
        }
      ]
    });
  });

  it("rejects expired or missing join intent tokens", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId]
    });

    await expect(
      claimClientJoinIntent({
        store,
        token: "missing",
        tokenHasher: (token) => `hash:${token}`,
        clientUserId,
        now
      })
    ).rejects.toBeInstanceOf(ClientJoinIntentError);
  });
});
```

The same test file should include a small `createMemoryClientStore` helper that implements `ClientStore` with arrays and enforces role checks inside `ensureRelationship`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
./node_modules/.bin/vitest run --config vitest.config.ts packages/domain/src/clients/index.test.ts
```

Expected: fail because `packages/domain/src/clients` does not exist.

- [ ] **Step 3: Implement domain types, errors, store port and use cases**

Create `client-types.ts` with these exported unions and types:

```ts
export type ClientBirthTimePrecision = "exact" | "approximate" | "unknown";
export type ClientBirthDataSource = "client_profile" | "booking" | "import" | "manual";
export type ClientRelationshipSource = "direct_link" | "booking" | "order" | "lead_magnet" | "manual";
export type ClientRelationshipStatus = "active" | "archived" | "blocked";
export type ClientJoinIntentStatus = "pending" | "claimed" | "expired";
```

Create `client-use-cases.ts` with:

```ts
export function normalizeClientBirthDataInput(input: ClientBirthDataInput): NormalizedClientBirthDataInput;
export async function createClientJoinIntent(input: CreateClientJoinIntentInput): Promise<ClientJoinIntentCreated>;
export async function claimClientJoinIntent(input: ClaimClientJoinIntentInput): Promise<ClientAstrologerRelationship>;
export async function upsertClientBirthData(input: UpsertClientBirthDataInput): Promise<ClientBirthData>;
export async function listAstrologerClients(input: ListAstrologerClientsInput): Promise<AstrologerClientList>;
```

Implementation rules:

- Trim optional strings and convert empty strings to `null`.
- Uppercase `birthCountryCode`.
- Validate date as `YYYY-MM-DD`.
- Validate time as `HH:mm`.
- Validate latitude between `-90` and `90`.
- Validate longitude between `-180` and `180`.
- If `birthTimePrecision === "unknown"`, require `birthTime === null`.
- Hash join tokens before store lookup.
- Claiming an expired or missing intent throws `ClientJoinIntentError`.
- `claimClientJoinIntent` calls `store.ensureRelationship` and then `store.markJoinIntentClaimed`.

- [ ] **Step 4: Export the clients module**

Add:

```ts
export * from "./clients";
```

to `packages/domain/src/index.ts`, and create `packages/domain/src/clients/index.ts` exporting all client files.

- [ ] **Step 5: Run tests**

Run:

```bash
./node_modules/.bin/vitest run --config vitest.config.ts packages/domain/src/clients/index.test.ts
./node_modules/.bin/tsc -p packages/domain/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/clients packages/domain/src/index.ts
git commit -m "feat: add client relationship domain"
```

## Task 2: Shared Contracts

**Files:**
- Create: `packages/contracts/src/clients.ts`
- Create: `packages/contracts/src/clients.test.ts`
- Modify: `packages/contracts/src/identity.ts`
- Modify: `packages/contracts/src/identity.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/contracts/src/clients.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  astrologerClientListResponseSchema,
  clientBirthDataUpsertRequestSchema,
  createClientJoinIntentRequestSchema,
  createClientJoinIntentResponseSchema
} from "./clients";

describe("client contracts", () => {
  it("normalizes join intent handle and accepts opaque token responses", () => {
    expect(createClientJoinIntentRequestSchema.parse({ publicHandle: " Alisa-Vega " })).toEqual({
      publicHandle: "alisa-vega"
    });
    expect(
      createClientJoinIntentResponseSchema.parse({
        token: "join_1234567890abcdef",
        astrologer: {
          userId: "22222222-2222-4222-8222-222222222222",
          publicHandle: "alisa-vega",
          publicName: "Алиса Вега"
        },
        expiresAt: "2026-07-06T11:00:00.000Z"
      })
    ).toMatchObject({ token: "join_1234567890abcdef" });
  });

  it("accepts the full birth-data request shape", () => {
    expect(
      clientBirthDataUpsertRequestSchema.parse({
        label: "Основные данные",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва, Россия",
        birthCountryCode: "RU",
        birthCity: "Москва",
        birthRegion: "Москва",
        birthTimezone: "Europe/Moscow",
        birthLatitude: 55.7558,
        birthLongitude: 37.6173
      })
    ).toMatchObject({ birthTimePrecision: "exact" });
  });

  it("rejects invalid client list items", () => {
    expect(() =>
      astrologerClientListResponseSchema.parse({
        clients: [{ clientUserId: "not-uuid", displayName: "", relationship: {} }],
        total: 1
      })
    ).toThrow();
  });
});
```

Extend `packages/contracts/src/identity.test.ts` with:

```ts
it("accepts optional client join intent token during public login and registration verification", () => {
  expect(
    verifyPasswordlessCodeRequestSchema.parse({
      challengeId: "11111111-1111-4111-8111-111111111111",
      code: "123456",
      clientJoinIntentToken: "join_1234567890abcdef"
    })
  ).toMatchObject({ clientJoinIntentToken: "join_1234567890abcdef" });

  expect(
    verifyRegistrationPasswordlessCodeRequestSchema.parse({
      challengeId: "11111111-1111-4111-8111-111111111111",
      code: "123456",
      displayName: "Марина",
      roles: ["client"],
      clientJoinIntentToken: "join_1234567890abcdef"
    })
  ).toMatchObject({ roles: ["client"], clientJoinIntentToken: "join_1234567890abcdef" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts packages/contracts/src/clients.test.ts packages/contracts/src/identity.test.ts
```

Expected: fail because `clients.ts` and token schema are missing.

- [ ] **Step 3: Implement client contracts**

Create `packages/contracts/src/clients.ts` with Zod schemas for:

- `createClientJoinIntentRequestSchema`
- `createClientJoinIntentResponseSchema`
- `clientBirthTimePrecisionSchema`
- `clientBirthDataResponseSchema`
- `clientBirthDataUpsertRequestSchema`
- `relatedAstrologerListResponseSchema`
- `astrologerClientListQuerySchema`
- `astrologerClientListResponseSchema`

Use UUID strings for user ids, datetime strings for timestamps, nullable birth fields, and `.strict()` for request bodies.

- [ ] **Step 4: Extend identity verify schemas**

In `packages/contracts/src/identity.ts`, add:

```ts
const clientJoinIntentTokenSchema = z.string().trim().min(16).max(256);
```

Extend both public verify schemas with optional token:

```ts
clientJoinIntentToken: clientJoinIntentTokenSchema.optional()
```

Do not add this field to astrologer auth schemas.

- [ ] **Step 5: Export contracts and run checks**

Add:

```ts
export * from "./clients";
```

to `packages/contracts/src/index.ts`.

Run:

```bash
./node_modules/.bin/vitest run --config vitest.config.ts packages/contracts/src/clients.test.ts packages/contracts/src/identity.test.ts
./node_modules/.bin/tsc -p packages/contracts/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/clients.ts packages/contracts/src/clients.test.ts packages/contracts/src/identity.ts packages/contracts/src/identity.test.ts packages/contracts/src/index.ts
git commit -m "feat: add client relationship contracts"
```

## Task 3: Database Schema And Drizzle Adapter

**Files:**
- Create: `packages/db/src/schema/clients/*`
- Create: `packages/db/src/adapters/clients/*`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema.test.ts`
- Modify: `packages/db/src/adapters/index.ts`
- Modify: `packages/db/src/adapters/identity/account-registration/drizzle-customer-registration-session-unit-of-work.ts`
- Modify: `packages/db/src/adapters/identity/passwordless-auth/drizzle-passwordless-auth-unit-of-work.ts`
- Modify: `packages/db/drizzle/0000_dazzling_metal_master.sql`

- [ ] **Step 1: Write failing schema and adapter tests**

Add schema assertions to `packages/db/src/schema.test.ts`:

```ts
import {
  clientAstrologerRelationships,
  clientBirthData,
  clientJoinIntents,
  clientProfiles
} from "./schema";

it("exports client relationship schema tables", () => {
  expect(clientProfiles).toBeDefined();
  expect(clientBirthData).toBeDefined();
  expect(clientAstrologerRelationships).toBeDefined();
  expect(clientJoinIntents).toBeDefined();
});
```

Create `packages/db/src/adapters/clients/drizzle-client-store.test.ts` with a fake executor test for:

- `upsertClientProfile` inserts profile row.
- `upsertClientBirthData` stores full birth-data shape.
- `ensureRelationship` uses unique pair semantics.
- `listAstrologerClients` filters by astrologer id and active status.
- `createJoinIntent` stores `tokenHash`, never plaintext token.

- [ ] **Step 2: Run tests to verify they fail**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts packages/db/src/schema.test.ts packages/db/src/adapters/clients/drizzle-client-store.test.ts
```

Expected: fail because clients schema and adapter are missing.

- [ ] **Step 3: Add schema**

Create tables with these key constraints:

```ts
uniqueIndex("client_astrologer_relationships_unique").on(
  table.clientUserId,
  table.astrologerUserId
);
index("client_astrologer_relationships_astrologer_status_idx").on(
  table.astrologerUserId,
  table.status
);
index("client_astrologer_relationships_client_status_idx").on(
  table.clientUserId,
  table.status
);
uniqueIndex("client_join_intents_token_hash_unique").on(table.tokenHash);
```

Reference `users.id` for client and astrologer ids. Add FK indexes for every referencing column. Add check constraints for enum values and birth-coordinate ranges.

- [ ] **Step 4: Add Drizzle adapter**

Implement `createDrizzleClientStore(databaseOrExecutor)` with methods matching `ClientStore`.

Implementation details:

- Use `onConflictDoUpdate` for relationship idempotency.
- Query `userRoleAssignments` before inserting relationship and throw `ClientAstrologerRelationshipRoleError` if required roles are missing.
- `listAstrologerClients` joins relationships, client profiles and active birth data, filters by `astrologerUserId` and `status = "active"`, applies search against display name, and returns `{ clients, total }`.
- `findPendingJoinIntentByTokenHash` returns only non-claimed rows; domain use case checks expiration.

- [ ] **Step 5: Compose client store into identity transactions**

Update registration and passwordless unit-of-work factories so their transaction store includes client store methods. This lets registration/login claim a join intent in the same transaction as session creation.

- [ ] **Step 6: Regenerate migration**

Per repo rule, regenerate the current migration rather than adding incremental alter chains.

Run the repo's DB generation/reset commands from `packages/db/package.json`. If the local DB reset would affect a running service or is not available, stop and report the exact blocker before modifying runtime data.

- [ ] **Step 7: Run checks**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts packages/db/src/schema.test.ts packages/db/src/adapters/clients/drizzle-client-store.test.ts
./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/clients packages/db/src/schema/index.ts packages/db/src/schema.test.ts packages/db/src/adapters/clients packages/db/src/adapters/index.ts packages/db/src/adapters/identity/account-registration/drizzle-customer-registration-session-unit-of-work.ts packages/db/src/adapters/identity/passwordless-auth/drizzle-passwordless-auth-unit-of-work.ts packages/db/drizzle/0000_dazzling_metal_master.sql
git commit -m "feat: persist client relationships"
```

## Task 4: Public API Join And Client Profile Flows

**Files:**
- Create: `apps/public-api/src/modules/client-join/*`
- Create: `apps/public-api/src/modules/client-profile/*`
- Modify: `apps/public-api/src/modules/identity/passwordless/identity-passwordless.handler.ts`
- Modify: `apps/public-api/src/modules/identity/registration/identity-registration.handler.ts`
- Modify: `apps/public-api/src/modules/identity/passwordless/identity-passwordless.service.test.ts`
- Modify: `apps/public-api/src/modules/identity/registration/identity-registration.service.test.ts`
- Modify: `apps/public-api/src/modules/identity/passwordless/identity-passwordless.e2e.test.ts`
- Modify: `apps/public-api/src/app.module.ts`

- [ ] **Step 1: Write failing service and e2e tests**

Add public API tests for:

```ts
it("creates a join intent from an astrologer public handle", async () => {
  const response = await postJson("/client-join-intents", { publicHandle: "alisa-vega" });
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({
    token: expect.any(String),
    astrologer: { publicHandle: "alisa-vega", publicName: "Алиса Вега" }
  });
});

it("registers a client and claims the join intent in the same flow", async () => {
  const join = await postJson("/client-join-intents", { publicHandle: "alisa-vega" });
  const registration = await postJson("/identity/registration/passwordless/verify-code", {
    challengeId,
    code: "123456",
    displayName: "Марина",
    roles: ["client"],
    clientJoinIntentToken: join.body.token
  });
  expect(registration.status).toBe(201);
  expect(await relationshipExists(registration.body.account.id, astrologerUserId)).toBe(true);
});

it("logs in an existing client through a second astrologer link", async () => {
  const join = await postJson("/client-join-intents", { publicHandle: "second-astro" });
  const login = await postJson("/identity/passwordless/verify-code", {
    challengeId,
    code: "123456",
    clientJoinIntentToken: join.body.token
  });
  expect(login.status).toBe(201);
  expect(await listClientRelationships(login.body.account.id)).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts apps/public-api/src/modules/identity/passwordless/identity-passwordless.e2e.test.ts
```

Expected: fail because join routes and handler token support are missing.

- [ ] **Step 3: Implement `client-join` module**

Create a Nest feature module with thin controller and service:

- `POST /client-join-intents`
- Service resolves `publicHandle` through `astrologerProfiles`.
- Service calls `createClientJoinIntent`.
- Service returns token plus public astrologer summary.

Do not use `Host` headers to construct URLs.

- [ ] **Step 4: Implement client profile module**

Create routes:

```text
GET /me/astrologers
GET /me/birth-data
PUT /me/birth-data
```

Use `PublicSessionAuthGuard`. Derive current client id from session. Return only astrologers related to the current client.

- [ ] **Step 5: Wire identity login/registration claim**

In both public passwordless verify handlers:

- Accept optional `clientJoinIntentToken`.
- After successful auth code verification and account/session creation, call `claimClientJoinIntent` when token exists.
- Registration claim must run inside the registration unit-of-work transaction.
- Login claim must run inside the passwordless auth transaction or a shared transaction with session creation.
- Invalid/expired join token should reject the verify request with `400`, not create a partial relationship.

- [ ] **Step 6: Run checks**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts apps/public-api/src/modules/client-join apps/public-api/src/modules/client-profile apps/public-api/src/modules/identity
./node_modules/.bin/tsc -p apps/public-api/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/public-api/src/modules/client-join apps/public-api/src/modules/client-profile apps/public-api/src/modules/identity apps/public-api/src/app.module.ts
git commit -m "feat: add public client join flow"
```

## Task 5: Client Web Direct-Link And Birth Data UI

**Files:**
- Create: `apps/client-web/src/features/client-join/api/clientJoinApi.ts`
- Create: `apps/client-web/src/features/client-join/model/clientJoinStorage.ts`
- Create: `apps/client-web/src/features/client-profile/api/clientProfileApi.ts`
- Create: `apps/client-web/src/pages/public-astrologer/PublicAstrologerPage.tsx`
- Create: `apps/client-web/src/pages/public-astrologer/PublicAstrologerPage.test.tsx`
- Modify: `apps/client-web/src/pages/auth/helpers/authFlowModel.ts`
- Modify: `apps/client-web/src/pages/auth/hooks/usePasswordlessAuthFlowHandlers.ts`
- Modify: `apps/client-web/src/pages/auth/helpers/authFlowModel.test.ts`
- Modify: `apps/client-web/src/pages/me/MePage.tsx`
- Modify: `apps/client-web/src/router.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add tests:

```ts
it("adds clientJoinIntentToken to registration verification when stored", () => {
  expect(
    createPasswordlessVerificationRequest({
      mode: "register",
      challengeId: "11111111-1111-4111-8111-111111111111",
      code: "123456",
      displayName: "Марина",
      clientJoinIntentToken: "join_1234567890abcdef"
    })
  ).toMatchObject({ clientJoinIntentToken: "join_1234567890abcdef" });
});
```

`PublicAstrologerPage.test.tsx` should verify that the page requests a join intent for `:handle`, stores the token, and offers registration/login through `/auth`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
./node_modules/.bin/vitest run --config apps/client-web/vitest.config.ts apps/client-web/src/pages/auth/helpers/authFlowModel.test.ts apps/client-web/src/pages/public-astrologer/PublicAstrologerPage.test.tsx
```

Expected: fail because route and token support are missing.

- [ ] **Step 3: Implement join token storage**

Create `clientJoinStorage.ts`:

```ts
export function readClientJoinIntentToken(): string | null;
export function writeClientJoinIntentToken(token: string): void;
export function clearClientJoinIntentToken(): void;
```

Use `sessionStorage`. If unavailable, keep an in-memory module variable for the same page session. Do not use localStorage for long-lived join tokens.

- [ ] **Step 4: Implement `/a/:handle` page**

The page should:

- read `handle` from route params;
- call `POST /client-join-intents`;
- store token in session storage;
- show astrologer public name/handle and buttons to continue to `/auth`;
- never show a directory or other astrologers.

- [ ] **Step 5: Pass token through auth**

Extend `createPasswordlessVerificationRequest` input with optional `clientJoinIntentToken` and include it in register/login verify bodies. Clear token only after successful verify.

- [ ] **Step 6: Implement `/me` minimal cabinet context**

`MePage` should show:

- related astrologers from `GET /me/astrologers`;
- a birth-data form backed by `GET/PUT /me/birth-data`;
- no discovery UI.

- [ ] **Step 7: Run checks**

```bash
./node_modules/.bin/vitest run --config apps/client-web/vitest.config.ts apps/client-web/src/pages/auth apps/client-web/src/pages/public-astrologer apps/client-web/src/pages/me
./node_modules/.bin/tsc -p apps/client-web/tsconfig.json --noEmit
./node_modules/.bin/vite build
```

Run `vite build` from `apps/client-web`.

- [ ] **Step 8: Commit**

```bash
git add apps/client-web/src/features/client-join apps/client-web/src/features/client-profile apps/client-web/src/pages/public-astrologer apps/client-web/src/pages/auth apps/client-web/src/pages/me apps/client-web/src/router.tsx
git commit -m "feat: add client direct-link onboarding"
```

## Task 6: Astrologer API Clients Module

**Files:**
- Create: `apps/astrologer-api/src/modules/clients/*`
- Modify: `apps/astrologer-api/src/app.module.ts`

- [ ] **Step 1: Write failing service and e2e tests**

Tests must verify:

```ts
it("lists only clients related to the current astrologer", async () => {
  const response = await getJson("/clients", astrologerSessionCookie);
  expect(response.status).toBe(200);
  expect(response.body.clients).toEqual([
    expect.objectContaining({
      clientUserId,
      displayName: "Марина Краснова",
      birthData: expect.objectContaining({ birthDate: "1990-03-14" })
    })
  ]);
});

it("does not expose clients related only to another astrologer", async () => {
  const response = await getJson("/clients", astrologerSessionCookie);
  expect(response.body.clients.map((client) => client.clientUserId)).not.toContain(unrelatedClientId);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts apps/astrologer-api/src/modules/clients
```

Expected: fail because module is missing.

- [ ] **Step 3: Implement clients module**

Create `ClientsModule` with:

- `GET /clients`
- `GET /clients/:clientUserId`

Use astrologer auth guard and derive astrologer id from request session. Parse query through contract schema. Service calls `listAstrologerClients`.

- [ ] **Step 4: Run checks**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts apps/astrologer-api/src/modules/clients
./node_modules/.bin/tsc -p apps/astrologer-api/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-api/src/modules/clients apps/astrologer-api/src/app.module.ts
git commit -m "feat: expose astrologer client list"
```

## Task 7: Numerology Client Selector And Server Validation

**Files:**
- Create: `apps/astrologer-web/src/features/clients/api/clientsApi.ts`
- Create: `apps/astrologer-web/src/features/clients/model/clientSelectorModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologySetupModal.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPage.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.service.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`

- [ ] **Step 1: Write failing API and frontend tests**

Backend e2e:

```ts
it("rejects crm_client participants unrelated to the current astrologer", async () => {
  const response = await postJson(
    "/numerology/calculations",
    {
      mode: "individual",
      methodCode: "pythagorean",
      title: "Unrelated",
      participants: [
        {
          role: "subject",
          source: "crm_client",
          clientId: unrelatedClientId,
          displayName: "Чужой клиент",
          fullName: "Чужой клиент",
          birthDate: "1990-03-14"
        }
      ]
    },
    astrologerSessionCookie
  );
  expect(response.status).toBe(403);
});
```

Frontend test:

```ts
it("renders client selector instead of manual CRM UUID field", () => {
  const view = renderNumerologySetupModal({
    clients: [{ clientUserId, displayName: "Марина Краснова", birthData: { birthDate: "1990-03-14" } }]
  });
  expect(view.queryByText("CRM clientId")).toBeNull();
  expect(view.getByRole("combobox", { name: "Клиент" })).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts
./node_modules/.bin/vitest run --config vitest.config.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: fail because relationship validation and selector are missing.

- [ ] **Step 3: Add backend relationship validation**

Inject a client relationship read port into Numerology service. Before accepting any `crm_client` participant, assert active relationship for current astrologer and `clientId`.

Rules:

- unrelated client -> `ForbiddenException`;
- missing birth date -> `BadRequestException`;
- same client twice in compatibility -> `BadRequestException`;
- manual mode remains accepted only where explicitly supported by current contracts.

- [ ] **Step 4: Add astrologer-web clients API and selector model**

`clientsApi.ts` calls `GET /clients` and parses `astrologerClientListResponseSchema`.

`clientSelectorModel.ts` maps related clients to select options:

```ts
export type ClientSelectOption = {
  readonly value: string;
  readonly label: string;
  readonly subtitle: string;
  readonly hasBirthDate: boolean;
};
```

- [ ] **Step 5: Replace UUID field in setup modal**

Remove the visible free-text CRM UUID input. Use a select/search control populated from API data. On selection, hydrate participant:

- `clientId`
- `displayName`
- `fullName`
- `birthDate`
- future birth fields in `inputSnapshot`.

Show field-level error when selected client has no birth date.

- [ ] **Step 6: Run checks**

```bash
./node_modules/.bin/vitest run --config vitest.config.ts apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
./node_modules/.bin/tsc -p apps/astrologer-api/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/astrologer-web/tsconfig.json --noEmit
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-api/src/modules/numerology apps/astrologer-web/src/features/clients apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
git commit -m "feat: use real clients in numerology"
```

## Task 8: Documentation, Browser QA, And Final Verification

**Files:**
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/product/roadmap.md`
- Modify: `docs/superpowers/specs/2026-07-05-numerology-calculations-design.md`
- Modify: `docs/superpowers/specs/2026-07-06-client-relationships-design.md` if implementation details diverged from the approved design.

- [ ] **Step 1: Update docs**

Reflect that:

- `ClientProfile`, `ClientBirthData`, direct-link relationship foundation and astrologer client list are now partial/ready depending on actual implementation.
- Public registration can claim a client join intent.
- Numerology CRM selector is backed by real related clients.

- [ ] **Step 2: Run targeted verification**

Run:

```bash
./node_modules/.bin/vitest run --config vitest.config.ts packages/domain/src/clients packages/contracts/src/clients.test.ts packages/contracts/src/identity.test.ts packages/db/src/adapters/clients apps/public-api/src/modules/client-join apps/public-api/src/modules/client-profile apps/astrologer-api/src/modules/clients apps/astrologer-api/src/modules/numerology apps/astrologer-web/src/pages/numerology
./node_modules/.bin/tsc -p packages/domain/tsconfig.json --noEmit
./node_modules/.bin/tsc -p packages/contracts/tsconfig.json --noEmit
./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/public-api/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/client-web/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/astrologer-api/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/astrologer-web/tsconfig.json --noEmit
```

If `pnpm` attempts an install and fails on ignored builds, use the local binaries as above and report the package-manager blocker.

- [ ] **Step 3: Browser QA**

Use the project-approved Chrome path. Do not start or restart services unless the user explicitly permits it. If existing localhost services are running, test:

1. `client-web` direct link `/a/alisa-vega` -> join token created -> auth page.
2. Register new client -> `/me` shows related astrologer.
3. Fill birth data -> saved and reloaded from backend.
4. Existing client opens second astrologer link -> login -> `/me` shows two related astrologers.
5. `astrologer-web /numerology` -> client selector lists only related clients.
6. Select client -> birth data hydrates -> calculation can be created.
7. Try unrelated `clientId` via API -> backend rejects.

- [ ] **Step 4: Commit docs and final fixes**

```bash
git add docs/architecture/design-reference-inventory.md docs/api/api-boundaries.md docs/architecture/backend-modules.md docs/product/roadmap.md docs/superpowers/specs/2026-07-05-numerology-calculations-design.md docs/superpowers/specs/2026-07-06-client-relationships-design.md
git commit -m "docs: update client relationship implementation status"
```

- [ ] **Step 5: Final status**

Report:

- commits created;
- commands run and pass/fail status;
- browser QA evidence;
- any remaining limitation, especially if local services were unavailable or unrelated dirty-tree changes blocked broad verification.

## Self-Review Notes

- Spec coverage: the plan covers direct-link join, registration/login relationship claim, full birth data, related-client APIs, Numerology selector, backend relationship authorization, documentation and browser QA.
- Placeholder scan: no `TBD`, `TODO`, fake data, localStorage CRM, or manual UUID production behavior remains in the planned implementation.
- Type consistency: this plan consistently uses `clientUserId` for platform clients and treats Numerology `clientId` as the persisted calculation field containing that `clientUserId`.
