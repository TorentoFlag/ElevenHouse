import { describe, expect, it, vi } from "vitest";
import {
  beginFinanceAuthorization,
  canonicalizeFinanceCommandPayload,
  consumeFinanceAuthorizationGrant,
  FinanceAuthorizationIntegrityError,
  FinanceAuthorizationPayloadError,
  FinanceAuthorizationRejectedError,
  hashFinanceCommandPayload,
  verifyFinanceAuthorizationAndIssueGrant,
  type FinanceAuthorizationChallenge,
  type FinanceAuthorizationChallengeDraft,
  type FinanceAuthorizationClock,
  type FinanceAuthorizationGrant,
  type FinanceAuthorizationGrantDraft,
  type FinanceAuthorizationRandomSource,
  type FinanceAuthorizationStore,
  type FinanceAuthorizationVerificationTransaction,
  type FinanceAuthorizationVerificationUnitOfWork,
  type FinanceWebAuthnAssertionVerifier,
  type FinanceWebAuthnCredential,
  type FinanceWebAuthnCredentialCounterMutationResult,
  type FinanceWebAuthnCredentialStore
} from "./finance-authorization";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const aggregateId = "33333333-3333-4333-8333-333333333333";
const challengeId = "44444444-4444-4444-8444-444444444444";
const authorizationId = "55555555-5555-4555-8555-555555555555";
const now = "2026-08-03T09:00:00.000Z";
const assertion = { portable: "assertion" };
const payload = {
  amountMinor: 960_000,
  currency: "RUB",
  destinationFingerprint: "sha256:destination"
};

class MemoryAuthorizationStore implements FinanceAuthorizationStore {
  readonly challenges = new Map<string, FinanceAuthorizationChallenge>();
  readonly grants = new Map<string, FinanceAuthorizationGrant>();
  readonly events: string[] = [];
  failGrantIssue = false;

  async createChallenge(draft: FinanceAuthorizationChallengeDraft) {
    this.events.push("challenge:persisted");
    const challenge = { ...draft, id: challengeId } satisfies FinanceAuthorizationChallenge;
    this.challenges.set(challenge.id, challenge);
    return { ...challenge };
  }

  async findChallengeById(id: string) {
    const challenge = this.challenges.get(id);
    return challenge ? { ...challenge } : null;
  }

  async consumeChallengeAndCreateGrant(input: {
    readonly challengeId: string;
    readonly consumedAt: string;
    readonly grant: FinanceAuthorizationGrantDraft;
  }) {
    if (this.failGrantIssue) return null;
    const challenge = this.challenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.status !== "active" ||
      Date.parse(challenge.expiresAt) <= Date.parse(input.consumedAt)
    ) {
      return null;
    }

    const consumedChallenge = {
      ...challenge,
      status: "consumed" as const,
      consumedAt: input.consumedAt
    };
    const grant = {
      ...input.grant,
      authorizationId
    } satisfies FinanceAuthorizationGrant;
    this.challenges.set(challenge.id, consumedChallenge);
    this.grants.set(grant.authorizationId, grant);
    this.events.push("challenge:consumed-and-grant:persisted");
    return { ...grant };
  }

  async findGrantById(id: string) {
    const grant = this.grants.get(id);
    return grant ? { ...grant } : null;
  }

  async consumeGrant(input: { readonly authorizationId: string; readonly consumedAt: string }) {
    const grant = this.grants.get(input.authorizationId);
    if (
      !grant ||
      grant.status !== "active" ||
      Date.parse(grant.expiresAt) <= Date.parse(input.consumedAt)
    ) {
      return null;
    }

    const consumed = {
      ...grant,
      status: "consumed" as const,
      consumedAt: input.consumedAt
    };
    this.grants.set(grant.authorizationId, consumed);
    this.events.push("grant:consumed");
    return { ...consumed };
  }
}

class MemoryCredentialStore implements FinanceWebAuthnCredentialStore {
  readonly credentials = new Map<string, FinanceWebAuthnCredential>();
  conflictOnNextMutation = false;

  constructor(credential: FinanceWebAuthnCredential) {
    this.credentials.set(credential.credentialId, credential);
  }

  async findCredentialById(credentialId: string) {
    const credential = this.credentials.get(credentialId);
    return credential ? { ...credential } : null;
  }

  async advanceSignatureCounterOrQuarantine(input: {
    readonly credentialId: string;
    readonly expectedSignatureCounter: number;
    readonly assertedSignatureCounter: number;
    readonly verifiedAt: string;
  }): Promise<FinanceWebAuthnCredentialCounterMutationResult> {
    const credential = this.credentials.get(input.credentialId);
    if (!credential || credential.status !== "active") {
      return { outcome: "unavailable" as const };
    }

    const conflict = this.conflictOnNextMutation;
    this.conflictOnNextMutation = false;
    if (conflict || credential.signatureCounter !== input.expectedSignatureCounter) {
      const quarantined = { ...credential, status: "quarantined" as const };
      this.credentials.set(credential.credentialId, quarantined);
      return { outcome: "quarantined" as const, reason: "compare_and_set_conflict" as const };
    }

    if (
      (credential.signatureCounter !== 0 || input.assertedSignatureCounter !== 0) &&
      input.assertedSignatureCounter <= credential.signatureCounter
    ) {
      const quarantined = { ...credential, status: "quarantined" as const };
      this.credentials.set(credential.credentialId, quarantined);
      return { outcome: "quarantined" as const, reason: "counter_regression" as const };
    }

    const updated = {
      ...credential,
      signatureCounter: input.assertedSignatureCounter
    };
    this.credentials.set(credential.credentialId, updated);
    if (input.assertedSignatureCounter === 0) {
      return { outcome: "unchanged_zero", signatureCounter: 0 };
    }
    return { outcome: "advanced", signatureCounter: input.assertedSignatureCounter };
  }
}

class MemoryVerificationUnitOfWork implements FinanceAuthorizationVerificationUnitOfWork {
  private readonly transactionTails = new Map<string, Promise<void>>();
  readonly lockedChallengeIds: string[] = [];

  constructor(
    private readonly authorizationStore: MemoryAuthorizationStore,
    private readonly credentialStore: MemoryCredentialStore
  ) {}

  transactForChallenge<T>(
    lockedChallengeId: string,
    operation: (transaction: FinanceAuthorizationVerificationTransaction) => Promise<T>
  ): Promise<T> {
    this.lockedChallengeIds.push(lockedChallengeId);
    const transactionTail = this.transactionTails.get(lockedChallengeId) ?? Promise.resolve();
    const result = transactionTail.then(() => this.runTransaction(lockedChallengeId, operation));
    this.transactionTails.set(
      lockedChallengeId,
      result.then(
        () => undefined,
        () => undefined
      )
    );
    return result;
  }

  private async runTransaction<T>(
    lockedChallengeId: string,
    operation: (transaction: FinanceAuthorizationVerificationTransaction) => Promise<T>
  ): Promise<T> {
    const challengeSnapshot = cloneMap(this.authorizationStore.challenges);
    const grantSnapshot = cloneMap(this.authorizationStore.grants);
    const credentialSnapshot = cloneMap(this.credentialStore.credentials);
    const eventCount = this.authorizationStore.events.length;
    const conflictOnNextMutation = this.credentialStore.conflictOnNextMutation;

    try {
      return await operation({
        lockedChallenge:
          cloneMap(this.authorizationStore.challenges).get(lockedChallengeId) ?? null,
        authorizationStore: this.authorizationStore,
        credentialStore: this.credentialStore
      });
    } catch (error) {
      restoreMap(this.authorizationStore.challenges, challengeSnapshot);
      restoreMap(this.authorizationStore.grants, grantSnapshot);
      restoreMap(this.credentialStore.credentials, credentialSnapshot);
      this.authorizationStore.events.splice(eventCount);
      this.credentialStore.conflictOnNextMutation = conflictOnNextMutation;
      throw error;
    }
  }
}

function cloneMap<T extends object>(source: Map<string, T>): Map<string, T> {
  return new Map([...source].map(([key, value]) => [key, { ...value }]));
}

function restoreMap<T>(target: Map<string, T>, snapshot: Map<string, T>): void {
  target.clear();
  for (const [key, value] of snapshot) target.set(key, value);
}

function createHarness(
  overrides: {
    readonly credentialOwnerUserId?: string;
    readonly storedCounter?: number;
    readonly assertedCounter?: number;
    readonly userVerified?: boolean;
    readonly verified?: boolean;
  } = {}
) {
  let currentTime = now;
  const store = new MemoryAuthorizationStore();
  const credentialStore = new MemoryCredentialStore({
    credentialId: "credential-id",
    ownerUserId: overrides.credentialOwnerUserId ?? actorUserId,
    status: "active",
    signatureCounter: overrides.storedCounter ?? 7
  });
  const verificationUnitOfWork = new MemoryVerificationUnitOfWork(store, credentialStore);
  const verifier: FinanceWebAuthnAssertionVerifier = {
    verifyAssertion: vi.fn(async () =>
      overrides.verified === false
        ? { verified: false as const }
        : {
            verified: true as const,
            credentialId: "credential-id",
            userVerified: overrides.userVerified ?? true,
            signatureCounter: overrides.assertedCounter ?? 8
          }
    )
  };
  const randomSource: FinanceAuthorizationRandomSource = {
    randomBytes: vi.fn((byteLength) => Uint8Array.from({ length: byteLength }, (_, index) => index))
  };
  const clock: FinanceAuthorizationClock = { now: () => currentTime };

  return {
    store,
    credentialStore,
    verificationUnitOfWork,
    verifier,
    randomSource,
    randomBytesMock: vi.mocked(randomSource.randomBytes),
    clock,
    setTime(value: string) {
      currentTime = value;
    }
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId,
    sessionId,
    sessionKind: "standard" as const,
    actionKind: "payout_approve" as const,
    aggregateId,
    expectedVersion: 3,
    payload,
    ...overrides
  };
}

async function begin(harness: ReturnType<typeof createHarness>, overrides = {}) {
  return beginFinanceAuthorization({
    store: harness.store,
    randomSource: harness.randomSource,
    clock: harness.clock,
    rpId: "admin.elevenhouse.example",
    origin: "https://admin.elevenhouse.example",
    ...command(overrides)
  });
}

async function verify(
  harness: ReturnType<typeof createHarness>,
  overrides: Partial<{
    readonly actorUserId: string;
    readonly sessionId: string;
    readonly sessionKind: "standard" | "recovery";
  }> = {}
) {
  return verifyFinanceAuthorizationAndIssueGrant({
    store: harness.store,
    verificationUnitOfWork: harness.verificationUnitOfWork,
    verifier: harness.verifier,
    clock: harness.clock,
    challengeId,
    assertion,
    actorUserId,
    sessionId,
    sessionKind: "standard",
    ...overrides
  });
}

async function authorize(harness: ReturnType<typeof createHarness>) {
  await begin(harness);
  return verify(harness);
}

describe("canonical finance command payload", () => {
  it("uses exact whitespace-free UTF-8 bytes and hand-derived SHA-256 literals", () => {
    const canonicalPayload = {
      nested: { yes: true, nothing: null },
      items: ["x", 3],
      b: 2,
      a: 1
    };

    expect(new TextDecoder().decode(canonicalizeFinanceCommandPayload(canonicalPayload))).toBe(
      '{"a":1,"b":2,"items":["x",3],"nested":{"nothing":null,"yes":true}}'
    );
    expect(hashFinanceCommandPayload(canonicalPayload)).toBe(
      "sha256:9517eacc763c2b4fc298a473a47e277aa53d3887190b4022d9bbf5e77fd20769"
    );
    expect(
      hashFinanceCommandPayload({
        a: 1,
        b: 2,
        items: ["x", 3],
        nested: { nothing: null, yes: true }
      })
    ).toBe("sha256:9517eacc763c2b4fc298a473a47e277aa53d3887190b4022d9bbf5e77fd20769");
  });

  it("sorts object keys by Unicode code point and keeps array order significant", () => {
    expect(
      new TextDecoder().decode(canonicalizeFinanceCommandPayload({ "𐀀": "astral", "": "bmp" }))
    ).toBe('{"":"bmp","𐀀":"astral"}');
    expect(hashFinanceCommandPayload({ "𐀀": "astral", "": "bmp" })).toBe(
      "sha256:94065525f1ea09913315f5a3f2cb846d9dda91a016d4726a60b4d99a53e50788"
    );
    expect(hashFinanceCommandPayload([1, 2])).toBe(
      "sha256:49a64717d5d4cb19952e6eac2946415cf6879adacf9908e7d872332d32c6e684"
    );
    expect(hashFinanceCommandPayload([2, 1])).toBe(
      "sha256:af1a1fc110b6094c48582b0ef83553cb7908d7a4365424eef28e76ef6c88d630"
    );
  });

  it.each([
    ["undefined", undefined],
    ["nested undefined", { value: undefined }],
    ["array undefined", [undefined]],
    ["float", 1.5],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["bigint", 1n],
    ["date", new Date("2026-08-03T09:00:00.000Z")],
    ["non-finite number", Number.POSITIVE_INFINITY],
    ["class instance", new (class Payload {})()]
  ])("rejects %s values", (_label, invalidPayload) => {
    expect(() => hashFinanceCommandPayload(invalidPayload)).toThrow(
      FinanceAuthorizationPayloadError
    );
  });

  it("rejects cycles instead of dropping or rewriting them", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => hashFinanceCommandPayload(cyclic)).toThrow(FinanceAuthorizationPayloadError);
  });

  it("rejects sparse arrays instead of canonicalizing holes as missing values", () => {
    const sparse = new Array<unknown>(1);

    expect(() => hashFinanceCommandPayload(sparse)).toThrow(FinanceAuthorizationPayloadError);
  });

  it("rejects accessor-backed array indexes without invoking the accessor", () => {
    const accessor = vi.fn(() => "unexpected");
    const payload = ["safe"];
    Object.defineProperty(payload, "0", { enumerable: true, get: accessor });

    expect(() => hashFinanceCommandPayload(payload)).toThrow(FinanceAuthorizationPayloadError);
    expect(accessor).not.toHaveBeenCalled();
  });
});

describe("transaction-bound finance authorization", () => {
  it("persists an exact 32-byte challenge before returning five-minute required-UV options", async () => {
    const harness = createHarness();

    await expect(begin(harness)).resolves.toEqual({
      challengeId,
      expiresAt: "2026-08-03T09:05:00Z",
      publicKey: {
        challenge: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
        rpId: "admin.elevenhouse.example",
        timeout: 300_000,
        userVerification: "required"
      }
    });

    expect(harness.randomSource.randomBytes).toHaveBeenCalledExactlyOnceWith(32);
    expect(harness.store.events).toEqual(["challenge:persisted"]);
    expect(harness.store.challenges.get(challengeId)).toMatchObject({
      actorUserId,
      sessionId,
      actionKind: "payout_approve",
      aggregateId,
      expectedVersion: 3,
      payloadHash: "sha256:8c7c4b4b2f6ef318442c6c32c5fb6055c97a643c22dc09521fe885891914919b",
      challenge: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
      rpId: "admin.elevenhouse.example",
      origin: "https://admin.elevenhouse.example",
      issuedAt: "2026-08-03T09:00:00Z",
      expiresAt: "2026-08-03T09:05:00Z",
      status: "active",
      consumedAt: null
    });
  });

  it("fails closed when the random source does not return exactly 32 bytes", async () => {
    const harness = createHarness();
    harness.randomBytesMock.mockReturnValue(new Uint8Array(31));

    await expect(begin(harness)).rejects.toBeInstanceOf(FinanceAuthorizationIntegrityError);
    expect(harness.store.challenges.size).toBe(0);
  });

  it("binds verifier input to persisted challenge, origin, RP ID and required UV, then returns only an opaque grant", async () => {
    const harness = createHarness();
    await begin(harness);
    harness.setTime("2026-08-03T09:00:30.000Z");

    const grant = await verify(harness);
    expect(grant).toEqual({
      authorizationId,
      expiresAt: "2026-08-03T09:05:30Z"
    });
    expect(harness.verifier.verifyAssertion).toHaveBeenCalledExactlyOnceWith({
      assertion,
      expectedChallenge: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
      allowedOrigin: "https://admin.elevenhouse.example",
      rpId: "admin.elevenhouse.example",
      requireUserVerification: true
    });
    expect(Object.keys(grant)).toEqual(["authorizationId", "expiresAt"]);
    expect(harness.store.grants.get(authorizationId)).toMatchObject({
      actorUserId,
      sessionId,
      actionKind: "payout_approve",
      aggregateId,
      expectedVersion: 3,
      payloadHash: "sha256:8c7c4b4b2f6ef318442c6c32c5fb6055c97a643c22dc09521fe885891914919b",
      verifiedAt: "2026-08-03T09:00:30Z",
      expiresAt: "2026-08-03T09:05:30Z",
      status: "active",
      consumedAt: null
    });
  });

  it("rejects a challenge snapshot changed between assertion verification and row lock", async () => {
    const harness = createHarness();
    await begin(harness);
    vi.mocked(harness.verifier.verifyAssertion).mockImplementationOnce(async () => {
      const persisted = harness.store.challenges.get(challengeId);
      if (!persisted) throw new Error("challenge fixture is missing");
      harness.store.challenges.set(challengeId, {
        ...persisted,
        actionKind: "refund_execute"
      });
      return {
        verified: true,
        credentialId: "credential-id",
        userVerified: true,
        signatureCounter: 8
      };
    });

    await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationIntegrityError);
    expect(harness.store.grants.size).toBe(0);
  });

  it.each([
    ["actor", { actorUserId: "other-user" }],
    ["session", { sessionId: "other-session" }]
  ])("rejects a challenge with mismatched %s binding", async (_label, override) => {
    const harness = createHarness();
    await begin(harness);

    await expect(verify(harness, override)).rejects.toBeInstanceOf(
      FinanceAuthorizationRejectedError
    );
    expect(harness.verifier.verifyAssertion).not.toHaveBeenCalled();
    expect(harness.store.grants.size).toBe(0);
  });

  it("issues the grant from persisted binding and ignores substituted action payload fields", async () => {
    const harness = createHarness();
    await begin(harness);

    await verifyFinanceAuthorizationAndIssueGrant({
      store: harness.store,
      verificationUnitOfWork: harness.verificationUnitOfWork,
      verifier: harness.verifier,
      clock: harness.clock,
      challengeId,
      assertion,
      actorUserId,
      sessionId,
      sessionKind: "standard",
      actionKind: "refund_execute",
      aggregateId: "substituted-aggregate",
      expectedVersion: 99,
      payload: { amountMinor: 1 }
    } as Parameters<typeof verifyFinanceAuthorizationAndIssueGrant>[0] & Record<string, unknown>);

    expect(harness.store.grants.get(authorizationId)).toMatchObject({
      actionKind: "payout_approve",
      aggregateId,
      expectedVersion: 3,
      payloadHash: "sha256:8c7c4b4b2f6ef318442c6c32c5fb6055c97a643c22dc09521fe885891914919b"
    });
  });

  it("consumes each challenge only once", async () => {
    const harness = createHarness();
    await begin(harness);
    await verify(harness);

    await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.store.grants.size).toBe(1);
  });

  it("serializes concurrent verification so replay cannot quarantine a valid credential", async () => {
    const harness = createHarness({ storedCounter: 7, assertedCounter: 8 });
    await begin(harness);

    const results = await Promise.allSettled([verify(harness), verify(harness)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(harness.verificationUnitOfWork.lockedChallengeIds).toEqual([challengeId, challengeId]);
    expect(harness.store.grants.size).toBe(1);
    expect(harness.credentialStore.credentials.get("credential-id")).toMatchObject({
      signatureCounter: 8,
      status: "active"
    });
  });

  it("rejects expired challenges before verification", async () => {
    const harness = createHarness();
    await begin(harness);
    harness.setTime("2026-08-03T09:05:00.000Z");

    await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.verifier.verifyAssertion).not.toHaveBeenCalled();
  });

  it("rechecks expiry after acquiring the serialized challenge lock", async () => {
    const harness = createHarness();
    await begin(harness);
    const delayedUnitOfWork: FinanceAuthorizationVerificationUnitOfWork = {
      transactForChallenge: (id, operation) =>
        harness.verificationUnitOfWork.transactForChallenge(id, (transaction) => {
          harness.setTime("2026-08-03T09:05:00.000Z");
          return operation(transaction);
        })
    };

    await expect(
      verifyFinanceAuthorizationAndIssueGrant({
        store: harness.store,
        verificationUnitOfWork: delayedUnitOfWork,
        verifier: harness.verifier,
        clock: harness.clock,
        challengeId,
        assertion,
        actorUserId,
        sessionId,
        sessionKind: "standard"
      })
    ).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.credentialStore.credentials.get("credential-id")).toMatchObject({
      signatureCounter: 7,
      status: "active"
    });
    expect(harness.store.grants.size).toBe(0);
  });

  it("rejects failed assertions and assertions without user verification", async () => {
    for (const overrides of [{ verified: false }, { userVerified: false }]) {
      const harness = createHarness(overrides);
      await begin(harness);

      await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
      expect(harness.store.grants.size).toBe(0);
    }
  });

  it("rejects a credential owned by another actor without advancing its counter", async () => {
    const harness = createHarness({ credentialOwnerUserId: "other-user" });
    await begin(harness);

    await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.credentialStore.credentials.get("credential-id")).toMatchObject({
      ownerUserId: "other-user",
      signatureCounter: 7,
      status: "active"
    });
    expect(harness.store.grants.size).toBe(0);
  });

  it("rejects a credential lookup that returns a different id before counter CAS", async () => {
    const harness = createHarness();
    await begin(harness);
    vi.spyOn(harness.credentialStore, "findCredentialById").mockResolvedValueOnce({
      credentialId: "substituted-credential-id",
      ownerUserId: actorUserId,
      status: "active",
      signatureCounter: 7
    });
    const advanceCounter = vi.spyOn(harness.credentialStore, "advanceSignatureCounterOrQuarantine");

    await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationIntegrityError);
    expect(advanceCounter).not.toHaveBeenCalled();
    expect(harness.store.grants.size).toBe(0);
  });

  it("atomically advances a valid credential signature counter", async () => {
    const harness = createHarness({ storedCounter: 7, assertedCounter: 8 });

    await authorize(harness);

    expect(harness.credentialStore.credentials.get("credential-id")).toMatchObject({
      signatureCounter: 8,
      status: "active"
    });
  });

  it("rolls the counter advancement back when challenge consumption and grant persistence fail", async () => {
    const harness = createHarness({ storedCounter: 7, assertedCounter: 8 });
    await begin(harness);
    harness.store.failGrantIssue = true;

    await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.credentialStore.credentials.get("credential-id")).toMatchObject({
      signatureCounter: 7,
      status: "active"
    });
    expect(harness.store.challenges.get(challengeId)?.status).toBe("active");
    expect(harness.store.grants.size).toBe(0);
  });

  it.each([
    ["regression", { storedCounter: 8, assertedCounter: 7, conflict: false }],
    ["replay", { storedCounter: 8, assertedCounter: 8, conflict: false }],
    ["compare-and-set conflict", { storedCounter: 7, assertedCounter: 8, conflict: true }]
  ])("quarantines the credential on %s and issues no grant", async (_label, fixture) => {
    const harness = createHarness(fixture);
    harness.credentialStore.conflictOnNextMutation = fixture.conflict;
    await begin(harness);

    await expect(verify(harness)).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.credentialStore.credentials.get("credential-id")?.status).toBe("quarantined");
    expect(harness.store.grants.size).toBe(0);
  });

  it("accepts authenticators whose stored and asserted counters are both zero", async () => {
    const harness = createHarness({ storedCounter: 0, assertedCounter: 0 });

    await authorize(harness);

    expect(harness.credentialStore.credentials.get("credential-id")).toMatchObject({
      signatureCounter: 0,
      status: "active"
    });
  });

  it("rejects recovery sessions at begin, verification and grant consumption", async () => {
    const beginHarness = createHarness();
    await expect(begin(beginHarness, { sessionKind: "recovery" })).rejects.toBeInstanceOf(
      FinanceAuthorizationRejectedError
    );
    expect(beginHarness.randomSource.randomBytes).not.toHaveBeenCalled();

    const verifyHarness = createHarness();
    await begin(verifyHarness);
    await expect(verify(verifyHarness, { sessionKind: "recovery" })).rejects.toBeInstanceOf(
      FinanceAuthorizationRejectedError
    );
    expect(verifyHarness.verifier.verifyAssertion).not.toHaveBeenCalled();

    const consumeHarness = createHarness();
    await authorize(consumeHarness);
    await expect(
      consumeFinanceAuthorizationGrant({
        store: consumeHarness.store,
        clock: consumeHarness.clock,
        authorizationId,
        ...command({ sessionKind: "recovery" })
      })
    ).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
  });

  it("consumes a transaction-bound grant once and returns the consumed proof", async () => {
    const harness = createHarness();
    await authorize(harness);

    await expect(
      consumeFinanceAuthorizationGrant({
        store: harness.store,
        clock: harness.clock,
        authorizationId,
        ...command()
      })
    ).resolves.toEqual({
      authorizationId,
      actorUserId,
      sessionId,
      actionKind: "payout_approve",
      aggregateId,
      expectedVersion: 3,
      payloadHash: "sha256:8c7c4b4b2f6ef318442c6c32c5fb6055c97a643c22dc09521fe885891914919b",
      verifiedAt: "2026-08-03T09:00:00Z",
      expiresAt: "2026-08-03T09:05:00Z",
      status: "consumed"
    });

    await expect(
      consumeFinanceAuthorizationGrant({
        store: harness.store,
        clock: harness.clock,
        authorizationId,
        ...command()
      })
    ).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
  });

  it("rejects a store result that was not consumed at the requested instant", async () => {
    const harness = createHarness();
    await authorize(harness);
    vi.spyOn(harness.store, "consumeGrant").mockImplementationOnce(async (input) => {
      const grant = harness.store.grants.get(input.authorizationId);
      if (!grant) return null;
      return {
        ...grant,
        status: "consumed" as const,
        consumedAt: "2026-08-03T08:59:59Z"
      };
    });

    await expect(
      consumeFinanceAuthorizationGrant({
        store: harness.store,
        clock: harness.clock,
        authorizationId,
        ...command()
      })
    ).rejects.toBeInstanceOf(FinanceAuthorizationIntegrityError);
  });

  it("rejects a grant lookup that returns a different authorization id before CAS", async () => {
    const harness = createHarness();
    await authorize(harness);
    const grant = harness.store.grants.get(authorizationId);
    if (!grant) throw new Error("grant fixture is missing");
    vi.spyOn(harness.store, "findGrantById").mockResolvedValueOnce({
      ...grant,
      authorizationId: "66666666-6666-4666-8666-666666666666"
    });
    const consumeGrant = vi.spyOn(harness.store, "consumeGrant");

    await expect(
      consumeFinanceAuthorizationGrant({
        store: harness.store,
        clock: harness.clock,
        authorizationId,
        ...command()
      })
    ).rejects.toBeInstanceOf(FinanceAuthorizationIntegrityError);
    expect(consumeGrant).not.toHaveBeenCalled();
  });

  it.each([
    ["actor", { actorUserId: "other-user" }],
    ["session", { sessionId: "other-session" }],
    ["action", { actionKind: "refund_execute" }],
    ["aggregate", { aggregateId: "other-aggregate" }],
    ["stale expected version", { expectedVersion: 4 }],
    ["payload hash", { payload: { ...payload, currency: "USD" } }]
  ])("does not consume a grant with mismatched %s", async (_label, override) => {
    const harness = createHarness();
    await authorize(harness);

    await expect(
      consumeFinanceAuthorizationGrant({
        store: harness.store,
        clock: harness.clock,
        authorizationId,
        ...command(override)
      })
    ).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.store.grants.get(authorizationId)?.status).toBe("active");
  });

  it("rejects an expired grant without consuming it", async () => {
    const harness = createHarness();
    await authorize(harness);
    harness.setTime("2026-08-03T09:05:00.000Z");

    await expect(
      consumeFinanceAuthorizationGrant({
        store: harness.store,
        clock: harness.clock,
        authorizationId,
        ...command()
      })
    ).rejects.toBeInstanceOf(FinanceAuthorizationRejectedError);
    expect(harness.store.grants.get(authorizationId)?.status).toBe("active");
  });
});
