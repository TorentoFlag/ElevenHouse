# Finance Step-up Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a transaction-bound, user-verified WebAuthn passkey proof a real, persisted prerequisite for sensitive finance actions, beginning with `refund_execute`.

**Architecture:** The existing domain service remains the single owner of challenge, grant, binding, expiry and counter invariants. PostgreSQL persists all finance authorization state and public credential material; an admin-api adapter performs complete assertion verification with `@simplewebauthn/server`, while native browser WebAuthn is used by the admin web surface. A sensitive finance command receives only a consumed, transaction-bound proof; session roles cannot mint a proof.

**Tech Stack:** TypeScript, NestJS, React/Vite, Drizzle/PostgreSQL, `@simplewebauthn/server`, native `navigator.credentials`, Zod contracts, Vitest, local PostgreSQL integration tests.

## Global Constraints

- ElevenHouse is the sole ArcPay merchant; this plan does not make a provider request or move money.
- Money remains integer minor RUB; no payment state is browser-owned.
- `refund_execute` requires user verification (`userVerification: "required"`), an active non-recovery admin session, exact actor/session/action/aggregate/version/payload-hash binding, a five-minute lifetime and one-time consumption.
- A session role alone is never sufficient. Until granular permission infrastructure exists, the enabled finance decision route is restricted to the existing `super_admin` role plus the passkey proof; moderator/admin continue to have no refund-execution route.
- Registration creates an explicitly discoverable passkey (`residentKey: "required"`); no e-mail/OTP/recovery session can satisfy a finance step-up.
- Credentials are stored as public key, credential ID, transports, backup flags and monotonic counter only. Never persist private keys, assertions, raw challenge responses, cookies or PANs.
- The baseline is pre-launch and local reset is authorized only after current shared-main baseline generation and exact localhost target preflight. Do not reset non-local PostgreSQL, commit, deploy or make ArcPay calls.
- UI work needs the ElevenHouse design-parity workflow. No approved passkey design reference currently exists, so API/persistence acceptance can be complete while visual acceptance is explicitly blocked.

---

## File Structure

- Create `packages/db/src/schema/identity/finance-webauthn.schema.ts`: credentials, registration challenges, transaction challenges and grants with database guards.
- Modify `packages/db/src/schema/identity/index.ts` and root schema exports: expose the new identity tables to Drizzle/baseline generation.
- Create `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-store.ts`: exact challenge/grant persistence and atomic consume/issue operations.
- Create `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-webauthn-credential-store.ts`: credential lookup and counter CAS/quarantine.
- Create `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-verification-uow.ts`: locks one challenge and performs grant/counter effects in one transaction.
- Create `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-webauthn-registration-store.ts`: single-use registration ceremony persistence and credential insertion.
- Create `apps/admin-api/src/modules/finance-authorization/`: controller/service/module/tokens plus `simple-webauthn-finance-assertion-verifier.ts` and registration verifier.
- Create `apps/admin-web/src/features/finance-authorization/`: focused native-WebAuthn client helper and model. It only renders after an approved reference exists; API helper tests remain non-visual.
- Modify `apps/admin-api/src/app.module.ts`, runtime configuration/tests, `packages/contracts/src/finance-authorization.ts`, and exports.
- Modify `packages/db/drizzle/0000_sticky_rictor.sql` and generated meta only through `pnpm db:generate`; run the authorized local reset only after inspection.

## Task 1: Persist finance WebAuthn state

**Files:**

- Create: `packages/db/src/schema/identity/finance-webauthn.schema.ts`
- Modify: `packages/db/src/schema/identity/index.ts`
- Test: `packages/db/src/schema/identity/finance-webauthn.schema.test.ts`

**Interfaces:**

- Produces tables `finance_webauthn_credentials`, `finance_webauthn_registration_challenges`, `finance_authorization_challenges`, and `finance_authorization_grants`.
- `finance_authorization_challenges` contains the domain `FinanceAuthorizationChallenge` fields, one active/consumed lifecycle and a unique random challenge value.
- `finance_authorization_grants` contains the domain `FinanceAuthorizationGrant` fields and one active/consumed lifecycle.

- [ ] **Step 1: Write failing schema assertions.**

```ts
expect(financeAuthorizationChallenges.id.primary).toBe(true);
expect(financeAuthorizationChallenges.status.enumValues).toEqual(["active", "consumed"]);
expect(financeWebAuthnCredentials.status.enumValues).toEqual(["active", "quarantined"]);
expect(financeAuthorizationGrants.authorizationId.primary).toBe(true);
```

- [ ] **Step 2: Run the failing test.**

Run: `pnpm exec vitest run packages/db/src/schema/identity/finance-webauthn.schema.test.ts`

Expected: FAIL because the finance WebAuthn schema does not exist.

- [ ] **Step 3: Add schema and SQL guards.**

```ts
export const financeAuthorizationChallenges = pgTable("finance_authorization_challenges", {
  id: uuid("id").primaryKey(),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sessionId: uuid("session_id").notNull().references(() => userSessions.id, { onDelete: "restrict" }),
  actionKind: text("action_kind").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  expectedVersion: bigint("expected_version", { mode: "number" }).notNull(),
  payloadHash: varchar("payload_hash", { length: 71 }).notNull(),
  challenge: varchar("challenge", { length: 128 }).notNull(),
  rpId: varchar("rp_id", { length: 253 }).notNull(),
  origin: varchar("origin", { length: 255 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true })
});
```

Add checks for the action enum, `sha256:` digest, `expires_at > issued_at`, active/consumed shape, positive safe expected version, and partial unique indexes preventing more than one active challenge or grant for the same exact binding. Add a credential counter non-negative/active-or-quarantined guard and a registration challenge single-use/expiry guard.

- [ ] **Step 4: Run schema tests.**

Run: `pnpm exec vitest run packages/db/src/schema/identity/finance-webauthn.schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Generate and validate the combined baseline.**

Run: `pnpm db:generate && git diff --check -- packages/db/drizzle packages/db/src/schema/identity`

Expected: generated baseline includes all current shared-main changes and is whitespace-clean.

- [ ] **Step 6: Exact-target reset and PostgreSQL guard test.**

Run: `docker compose ps postgres`, `docker port "$(docker compose ps -q postgres)" 5432/tcp`, then after confirming local `elevenhouse`: `set -a; source .env; set +a; pnpm db:reset`.

Run: `set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/schema/identity/finance-webauthn.schema.integration.ts`

Expected: local tables start empty; duplicate active challenge/grant, expired/consumed shape and invalid counter are rejected by PostgreSQL.

## Task 2: Implement transactional domain adapters

**Files:**

- Create: `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-store.ts`
- Create: `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-webauthn-credential-store.ts`
- Create: `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-verification-uow.ts`
- Create: `packages/db/src/adapters/identity/finance-authorization/index.ts`
- Modify: `packages/db/src/adapters/identity/index.ts`
- Test: `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-store.integration.ts`

**Interfaces:**

- Implements `FinanceAuthorizationStore`, `FinanceWebAuthnCredentialStore`, and `FinanceAuthorizationVerificationUnitOfWork` from `@elevenhouse/domain`.
- `consumeChallengeAndCreateGrant` and counter update are committed in the same transaction started by `transactForChallenge`.

- [ ] **Step 1: Write integration failures for replay, expiry and counter race.**

```ts
await expect(store.consumeChallengeAndCreateGrant(command)).resolves.toMatchObject({ status: "active" });
await expect(store.consumeChallengeAndCreateGrant(command)).resolves.toBeNull();
await expect(credentials.advanceSignatureCounterOrQuarantine({ ...input, assertedSignatureCounter: 2 })).resolves.toMatchObject({ outcome: "advanced" });
await expect(credentials.advanceSignatureCounterOrQuarantine({ ...input, assertedSignatureCounter: 2 })).resolves.toMatchObject({ outcome: "quarantined" });
```

- [ ] **Step 2: Run the focused integration test.**

Run: `set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-store.integration.ts`

Expected: FAIL because adapters are absent.

- [ ] **Step 3: Implement exact mappings and locks.**

```ts
return database.transaction(async (tx) => {
  const [challenge] = await tx.select().from(financeAuthorizationChallenges)
    .where(eq(financeAuthorizationChallenges.id, challengeId)).limit(1).for("update");
  return operation({ lockedChallenge: challenge ? mapChallenge(challenge) : null, authorizationStore: inTransactionStore(tx), credentialStore: inTransactionCredentialStore(tx) });
});
```

The counter mutation must use an expected-counter predicate. Any failed equality predicate first changes the matching active credential to `quarantined` and returns `compare_and_set_conflict`; any asserted counter less than or equal to a nonzero stored counter quarantines with `counter_regression`. Never retry with a newer counter.

- [ ] **Step 4: Run integration and type checks.**

Run: `set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-store.integration.ts && pnpm --filter @elevenhouse/db typecheck`

Expected: PASS.

## Task 3: Add actual passkey enrollment and assertion verification

**Files:**

- Modify: `apps/admin-api/package.json`
- Create: `apps/admin-api/src/modules/finance-authorization/simple-webauthn-finance-assertion-verifier.ts`
- Create: `apps/admin-api/src/modules/finance-authorization/simple-webauthn-registration-verifier.ts`
- Create: `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-webauthn-registration-store.ts`
- Test: `apps/admin-api/src/modules/finance-authorization/simple-webauthn-finance-assertion-verifier.test.ts`
- Test: `packages/db/src/adapters/identity/finance-authorization/drizzle-finance-webauthn-registration-store.integration.ts`

**Interfaces:**

- Assertion verifier implements `FinanceWebAuthnAssertionVerifier.verifyAssertion`.
- It calls `verifyAuthenticationResponse` with `expectedChallenge`, `expectedOrigin`, `expectedRPID`, `requireUserVerification: true` and the stored public credential.

- [ ] **Step 1: Add failing verifier tests.**

```ts
await expect(verifier.verifyAssertion(validInput)).resolves.toEqual({ verified: true, credentialId, userVerified: true, signatureCounter: 7 });
await expect(verifier.verifyAssertion({ ...validInput, allowedOrigin: "https://evil.example" })).resolves.toEqual({ verified: false });
```

- [ ] **Step 2: Install the pinned server verifier and run the red test.**

Run: `pnpm --filter @elevenhouse/admin-api add @simplewebauthn/server@13.2.2 && pnpm exec vitest run apps/admin-api/src/modules/finance-authorization/simple-webauthn-finance-assertion-verifier.test.ts`

Expected: FAIL until the adapter is implemented.

- [ ] **Step 3: Implement assertion verification.**

```ts
const verification = await verifyAuthenticationResponse({
  response: assertion,
  expectedChallenge,
  expectedOrigin: allowedOrigin,
  expectedRPID: rpId,
  credential: storedCredential,
  requireUserVerification: true
});
return verification.verified
  ? { verified: true, credentialId: verification.authenticationInfo.credentialID, userVerified: verification.authenticationInfo.userVerified, signatureCounter: verification.authenticationInfo.newCounter }
  : { verified: false };
```

Map all parsing/provider errors to `{ verified: false }`, never to a success or a different credential. Registration must use `generateRegistrationOptions` with `residentKey: "required"`, `userVerification: "required"`, `attestationType: "none"`, persist its random challenge before return, and use `verifyRegistrationResponse` before inserting a public credential.

- [ ] **Step 4: Run verifier/registration tests.**

Run: `pnpm exec vitest run apps/admin-api/src/modules/finance-authorization/simple-webauthn-finance-assertion-verifier.test.ts && set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/identity/finance-authorization/drizzle-finance-webauthn-registration-store.integration.ts`

Expected: PASS; failed assertion/registration never writes a grant or credential.

## Task 4: Expose guarded admin API ceremonies

**Files:**

- Create: `apps/admin-api/src/modules/finance-authorization/finance-authorization.service.ts`
- Create: `apps/admin-api/src/modules/finance-authorization/finance-authorization.controller.ts`
- Create: `apps/admin-api/src/modules/finance-authorization/finance-authorization.module.ts`
- Create: `apps/admin-api/src/modules/finance-authorization/finance-authorization.tokens.ts`
- Modify: `apps/admin-api/src/app.module.ts`
- Modify: `apps/admin-api/src/config/runtime-config.ts`
- Modify: `apps/admin-api/src/config/runtime-config.test.ts`
- Test: `apps/admin-api/src/modules/finance-authorization/finance-authorization.e2e.test.ts`

**Interfaces:**

- `POST /admin/finance/passkeys/registration-options`, `POST /admin/finance/passkeys/registration-verifications`, `POST /admin/finance/authorizations`, and `POST /admin/finance/authorizations/verifications` use admin session, CSRF and idempotency.
- Beginning/verification accepts and returns only the existing contracts; registered credential public keys never leave the API.

- [ ] **Step 1: Write E2E failures.**

```ts
await expect(begin({ role: "admin" })).resolves.toMatchObject({ status: 403 });
await expect(begin({ role: "super_admin", recoverySession: true })).resolves.toMatchObject({ status: 403 });
await expect(begin({ role: "super_admin" })).resolves.toMatchObject({ status: 201, body: { publicKey: { userVerification: "required" } } });
```

- [ ] **Step 2: Run the red E2E test.**

Run: `pnpm exec vitest run apps/admin-api/src/modules/finance-authorization/finance-authorization.e2e.test.ts`

Expected: FAIL because routes/configuration are absent.

- [ ] **Step 3: Implement service/controller composition.**

```ts
if (!request.currentAdminAccount?.roles.includes("super_admin")) throw new ForbiddenException();
return beginFinanceAuthorization({ actorUserId, sessionId, sessionKind: "standard", actionKind, aggregateId, expectedVersion, payload, store, randomSource, clock, rpId, origin });
```

Derive session id and standard/recovery kind from the authenticated DB session, not a request field. Validate `FINANCE_WEBAUTHN_RP_ID` and `FINANCE_WEBAUTHN_ORIGIN` as an exact origin/RP pair at startup; production requires HTTPS. Audit registration, challenge issue, verification failure/success and grant consumption with safe IDs only.

- [ ] **Step 4: Run E2E and affected package checks.**

Run: `pnpm exec vitest run apps/admin-api/src/modules/finance-authorization/finance-authorization.e2e.test.ts && pnpm --filter @elevenhouse/admin-api typecheck && pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/contracts typecheck && pnpm --filter @elevenhouse/db typecheck`

Expected: PASS.

## Task 5: Add native admin-web ceremony boundary

**Files:**

- Create: `apps/admin-web/src/features/finance-authorization/api/financeAuthorizationApi.ts`
- Create: `apps/admin-web/src/features/finance-authorization/model/performFinanceStepUp.ts`
- Test: `apps/admin-web/src/features/finance-authorization/model/performFinanceStepUp.test.ts`

**Interfaces:**

- `performFinanceStepUp(input)` begins a bound authorization, invokes `navigator.credentials.get`, serializes only `PublicKeyCredential` assertion data, verifies it with the API and returns an opaque `authorizationId`.

- [ ] **Step 1: Write a failing helper test for the browser and cancellation paths.**

```ts
await expect(performFinanceStepUp({ api, credentials: unavailableCredentials, command })).rejects.toMatchObject({ code: "webauthn_unavailable" });
await expect(performFinanceStepUp({ api, credentials: cancellingCredentials, command })).rejects.toMatchObject({ code: "webauthn_cancelled" });
```

- [ ] **Step 2: Run the red test.**

Run: `pnpm exec vitest run apps/admin-web/src/features/finance-authorization/model/performFinanceStepUp.test.ts`

Expected: FAIL because the helper is absent.

- [ ] **Step 3: Implement native serialization and no-fallback behavior.**

```ts
const credential = await credentials.get({ publicKey: decodeRequestOptions(begin.publicKey) });
if (!(credential instanceof PublicKeyCredential)) throw new FinanceStepUpError("webauthn_cancelled");
const assertion = serializeAuthenticationResponse(credential);
return api.verify({ challengeId: begin.challengeId, assertion });
```

Do not add password, e-mail, OTP, cached-grant or browser-storage fallback. A later exact design reference can mount this helper inside the refund decision screen.

- [ ] **Step 4: Run frontend checks.**

Run: `pnpm exec vitest run apps/admin-web/src/features/finance-authorization/model/performFinanceStepUp.test.ts && pnpm --filter @elevenhouse/admin-web typecheck`

Expected: PASS.

## Task 6: Consume the proof atomically in the refund issuer

**Files:**

- Modify: `packages/domain/src/refunds/refund-decision-issuer.ts` (created by the next refund-issuer plan)
- Modify: `packages/db/src/adapters/finance/drizzle-refund-decision-issuer.ts` (created by the next refund-issuer plan)
- Test: `packages/db/src/adapters/finance/drizzle-refund-decision-issuer.integration.ts`

**Interfaces:**

- The issuer receives `authorizationId` but not a caller-created `VerifiedRefundApprovalAuthority`.
- It consumes `FinanceTransactionAuthorizationProof` in the same outer transaction that creates the immutable refund allocation/funding/outbox package.

- [ ] **Step 1: Write a red integration case.**

```ts
await expect(issueRefund({ authorizationId, expectedCandidateVersion: 3 })).resolves.toMatchObject({ status: "approved" });
await expect(issueRefund({ authorizationId, expectedCandidateVersion: 3 })).rejects.toMatchObject({ code: "FINANCE_AUTHORIZATION_REJECTED" });
```

- [ ] **Step 2: Run it after the issuer exists.**

Run: `set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/finance/drizzle-refund-decision-issuer.integration.ts`

Expected: first transaction creates one approval/outbox package; replay creates neither a second package nor provider I/O.

- [ ] **Step 3: Add the proof consume call inside the issuer transaction.**

```ts
const proof = await consumeFinanceAuthorizationGrant({ ...boundRefundCommand, authorizationId, store: authorizationStore, clock });
assertRefundDecisionProof(proof, { candidateId, expectedCandidateVersion, amountMinor, currency: "RUB" });
await refundApproval.approveRefund(serverResolvedCommand);
```

The user-visible route never calls ArcPay. A stale candidate, amount, expected version, actor/session, payload or grant fails before the approval/outbox write.

- [ ] **Step 4: Re-run refund and authorization integration checks.**

Run: `set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-store.integration.ts packages/db/src/adapters/finance/drizzle-refund-decision-issuer.integration.ts`

Expected: PASS.

## Task 7: Full verification and operating evidence

- [ ] **Step 1: Run focused suites.**

Run: `pnpm exec vitest run packages/domain/src/finance-authorization/finance-authorization.test.ts packages/contracts/src/finance-authorization.test.ts apps/admin-api/src/modules/finance-authorization/finance-authorization.e2e.test.ts apps/admin-web/src/features/finance-authorization/model/performFinanceStepUp.test.ts`

- [ ] **Step 2: Run affected integration suites.**

Run: `set -a; source .env; set +a; INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/schema/identity/finance-webauthn.schema.integration.ts packages/db/src/adapters/identity/finance-authorization/drizzle-finance-authorization-store.integration.ts packages/db/src/adapters/identity/finance-authorization/drizzle-finance-webauthn-registration-store.integration.ts`

- [ ] **Step 3: Run package gates and diff guard.**

Run: `pnpm --filter @elevenhouse/admin-api typecheck && pnpm --filter @elevenhouse/admin-web typecheck && pnpm --filter @elevenhouse/db typecheck && pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/contracts typecheck && git diff --check`

- [ ] **Step 4: Perform browser evidence only after a browser surface and reference state are available.**

Use a synthetic local super-admin passkey and test only registration, exact payload binding, cancellation, expired challenge, replay rejection and clean console/network. Do not claim visual parity or live payment E2E if no browser surface/reference exists.

## Self-Review

- Product and security coverage: Tasks 1–4 make the existing domain contract real; Task 5 adds only a reusable native ceremony helper; Task 6 joins the proof to the approved refund issuer rather than bypassing it.
- Explicit exclusions: ArcPay provider I/O, provider credentials, refund decision UI design, submerchants, auto payouts and password/OTP fallback are outside this plan.
- Placeholder scan: no task delegates validation or edge cases generically; locks, counter conflict, bindings, expiry, recovery sessions and no-fallback behavior are explicit.
- Type consistency: all persistence code implements the existing domain ports; the final issuer consumes a domain proof rather than exposing the authority brand.
