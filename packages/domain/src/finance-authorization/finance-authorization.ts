import { Temporal } from "@js-temporal/polyfill";
import { financeSensitiveActionKindValues } from "@elevenhouse/contracts";
import { hashFinanceCommandPayload } from "./canonical-command-payload";
import {
  FinanceAuthorizationIntegrityError,
  FinanceAuthorizationRejectedError,
  type BeginFinanceAuthorizationResult,
  type FinanceAuthorizationBinding,
  type FinanceAuthorizationChallenge,
  type FinanceAuthorizationChallengeDraft,
  type FinanceAuthorizationClock,
  type FinanceAuthorizationCommand,
  type FinanceAuthorizationGrant,
  type FinanceAuthorizationGrantDraft,
  type FinanceAuthorizationRandomSource,
  type FinanceAuthorizationSessionKind,
  type FinanceAuthorizationStore,
  type FinanceAuthorizationVerificationUnitOfWork,
  type FinanceTransactionAuthorizationProof,
  type FinanceWebAuthnAssertionVerifier,
  type FinanceWebAuthnCredentialCounterMutationResult
} from "./finance-authorization-boundary";

const challengeByteLength = 32;
const authorizationLifetimeSeconds = 300;
const authorizationTimeoutMilliseconds = 300_000 as const;
const sensitiveActionKinds = new Set<string>(financeSensitiveActionKindValues);
const base64UrlChallengePattern = /^[A-Za-z0-9_-]{43}$/;
const payloadHashPattern = /^sha256:[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function beginFinanceAuthorization(
  input: FinanceAuthorizationCommand & {
    readonly store: FinanceAuthorizationStore;
    readonly randomSource: FinanceAuthorizationRandomSource;
    readonly clock: FinanceAuthorizationClock;
    readonly rpId: string;
    readonly origin: string;
  }
): Promise<BeginFinanceAuthorizationResult> {
  assertStandardSession(input.sessionKind);
  const binding = commandBinding(input);
  const { rpId, origin } = normalizeRelyingParty(input.rpId, input.origin);
  const issuedAt = readClock(input.clock);
  const expiresAt = issuedAt.add({ seconds: authorizationLifetimeSeconds });
  const challengeBytes = input.randomSource.randomBytes(challengeByteLength);
  if (
    !(challengeBytes instanceof Uint8Array) ||
    challengeBytes.byteLength !== challengeByteLength
  ) {
    throw new FinanceAuthorizationIntegrityError();
  }
  const challenge = Buffer.from(challengeBytes).toString("base64url");

  const draft: FinanceAuthorizationChallengeDraft = {
    ...binding,
    challenge,
    rpId,
    origin,
    issuedAt: issuedAt.toString(),
    expiresAt: expiresAt.toString(),
    status: "active",
    consumedAt: null
  };
  const persisted = await input.store.createChallenge(draft);
  assertPersistedChallenge(persisted, draft);

  return {
    challengeId: persisted.id,
    expiresAt: persisted.expiresAt,
    publicKey: {
      challenge: persisted.challenge,
      rpId: persisted.rpId,
      timeout: authorizationTimeoutMilliseconds,
      userVerification: "required"
    }
  };
}

export async function verifyFinanceAuthorizationAndIssueGrant(input: {
  readonly actorUserId: string;
  readonly sessionId: string;
  readonly sessionKind: FinanceAuthorizationSessionKind;
  readonly challengeId: string;
  readonly assertion: unknown;
  readonly store: FinanceAuthorizationStore;
  readonly verificationUnitOfWork: FinanceAuthorizationVerificationUnitOfWork;
  readonly verifier: FinanceWebAuthnAssertionVerifier;
  readonly clock: FinanceAuthorizationClock;
}): Promise<{ readonly authorizationId: string; readonly expiresAt: string }> {
  assertStandardSession(input.sessionKind);
  assertIdentifier(input.actorUserId);
  assertIdentifier(input.sessionId);
  assertIdentifier(input.challengeId);
  const initialNow = readClock(input.clock);
  const challenge = await input.store.findChallengeById(input.challengeId);
  assertUsableChallengeForSession(challenge, input, initialNow);

  const verification = await input.verifier.verifyAssertion({
    assertion: input.assertion,
    expectedChallenge: challenge.challenge,
    allowedOrigin: challenge.origin,
    rpId: challenge.rpId,
    requireUserVerification: true
  });
  if (!verification.verified || !verification.userVerified) throw rejected();
  assertCounter(verification.signatureCounter);
  assertIdentifier(verification.credentialId);

  const transactionResult = await input.verificationUnitOfWork.transactForChallenge(
    challenge.id,
    async (transaction) => {
      const verifiedAt = readClock(input.clock);
      const authoritativeChallenge = transaction.lockedChallenge;
      assertUsableChallengeForSession(authoritativeChallenge, input, verifiedAt);
      assertSameChallengeSnapshot(authoritativeChallenge, challenge);

      const credential = await transaction.credentialStore.findCredentialById(
        verification.credentialId
      );
      if (credential && credential.credentialId !== verification.credentialId) {
        throw new FinanceAuthorizationIntegrityError();
      }
      if (
        !credential ||
        credential.status !== "active" ||
        credential.ownerUserId !== authoritativeChallenge.actorUserId
      ) {
        return { outcome: "rejected" as const };
      }
      assertCounter(credential.signatureCounter);

      const counterMutation = await transaction.credentialStore.advanceSignatureCounterOrQuarantine(
        {
          credentialId: verification.credentialId,
          expectedSignatureCounter: credential.signatureCounter,
          assertedSignatureCounter: verification.signatureCounter,
          verifiedAt: verifiedAt.toString()
        }
      );
      if (
        !counterMutationAccepted(
          counterMutation,
          credential.signatureCounter,
          verification.signatureCounter
        )
      ) {
        return { outcome: "rejected" as const };
      }

      const grantDraft: FinanceAuthorizationGrantDraft = {
        ...bindingFromChallenge(authoritativeChallenge),
        verifiedAt: verifiedAt.toString(),
        expiresAt: verifiedAt.add({ seconds: authorizationLifetimeSeconds }).toString(),
        status: "active",
        consumedAt: null
      };
      const grant = await transaction.authorizationStore.consumeChallengeAndCreateGrant({
        challengeId: authoritativeChallenge.id,
        consumedAt: verifiedAt.toString(),
        grant: grantDraft
      });
      if (!grant) throw rejected();
      assertPersistedGrant(grant, grantDraft);
      return { outcome: "issued" as const, grant };
    }
  );
  if (transactionResult.outcome === "rejected") throw rejected();

  return {
    authorizationId: transactionResult.grant.authorizationId,
    expiresAt: transactionResult.grant.expiresAt
  };
}

export async function consumeFinanceAuthorizationGrant(
  input: FinanceAuthorizationCommand & {
    readonly authorizationId: string;
    readonly store: FinanceAuthorizationStore;
    readonly clock: FinanceAuthorizationClock;
  }
): Promise<FinanceTransactionAuthorizationProof> {
  assertStandardSession(input.sessionKind);
  assertIdentifier(input.authorizationId);
  const binding = commandBinding(input);
  const consumedAt = readClock(input.clock);
  const grant = await input.store.findGrantById(input.authorizationId);
  assertUsableGrant(grant, input.authorizationId, binding, consumedAt);

  const consumed = await input.store.consumeGrant({
    authorizationId: input.authorizationId,
    consumedAt: consumedAt.toString()
  });
  if (!consumed) throw rejected();
  assertConsumedGrant(consumed, grant, consumedAt.toString());

  return {
    authorizationId: consumed.authorizationId,
    actorUserId: consumed.actorUserId,
    sessionId: consumed.sessionId,
    actionKind: consumed.actionKind,
    aggregateId: consumed.aggregateId,
    expectedVersion: consumed.expectedVersion,
    payloadHash: consumed.payloadHash,
    verifiedAt: consumed.verifiedAt,
    expiresAt: consumed.expiresAt,
    status: "consumed"
  };
}

function commandBinding(command: FinanceAuthorizationCommand): FinanceAuthorizationBinding {
  assertIdentifier(command.actorUserId);
  assertIdentifier(command.sessionId);
  assertIdentifier(command.aggregateId);
  if (!sensitiveActionKinds.has(command.actionKind)) throw rejected();
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
    throw rejected();
  }

  return {
    actorUserId: command.actorUserId,
    sessionId: command.sessionId,
    actionKind: command.actionKind,
    aggregateId: command.aggregateId,
    expectedVersion: command.expectedVersion,
    payloadHash: hashFinanceCommandPayload(command.payload)
  };
}

function normalizeRelyingParty(rpIdValue: string, originValue: string) {
  if (typeof rpIdValue !== "string" || rpIdValue.trim() !== rpIdValue || !rpIdValue) {
    throw new FinanceAuthorizationIntegrityError();
  }
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new FinanceAuthorizationIntegrityError();
  }
  if (origin.origin !== originValue || !["https:", "http:"].includes(origin.protocol)) {
    throw new FinanceAuthorizationIntegrityError();
  }
  return { rpId: rpIdValue, origin: origin.origin };
}

function readClock(clock: FinanceAuthorizationClock): Temporal.Instant {
  try {
    return Temporal.Instant.from(clock.now());
  } catch {
    throw new FinanceAuthorizationIntegrityError();
  }
}

function assertStandardSession(sessionKind: FinanceAuthorizationSessionKind): void {
  if (sessionKind !== "standard") throw rejected();
}

function assertIdentifier(value: string): void {
  if (typeof value !== "string" || !value || value.trim() !== value) throw rejected();
}

function assertIdentifierIntegrity(value: string): void {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new FinanceAuthorizationIntegrityError();
  }
}

function assertCounter(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw rejected();
}

function assertPersistedChallenge(
  challenge: FinanceAuthorizationChallenge,
  draft: FinanceAuthorizationChallengeDraft
): void {
  if (
    !challenge ||
    !uuidPattern.test(challenge.id) ||
    challenge.status !== "active" ||
    challenge.consumedAt !== null ||
    !challengeMatchesBinding(challenge, draft) ||
    challenge.challenge !== draft.challenge ||
    challenge.rpId !== draft.rpId ||
    challenge.origin !== draft.origin ||
    challenge.issuedAt !== draft.issuedAt ||
    challenge.expiresAt !== draft.expiresAt ||
    !base64UrlChallengePattern.test(challenge.challenge)
  ) {
    throw new FinanceAuthorizationIntegrityError();
  }
  assertLifetime(challenge.issuedAt, challenge.expiresAt);
}

function assertUsableChallengeForSession(
  challenge: FinanceAuthorizationChallenge | null,
  session: {
    readonly actorUserId: string;
    readonly sessionId: string;
    readonly challengeId: string;
  },
  now: Temporal.Instant
): asserts challenge is FinanceAuthorizationChallenge {
  if (
    !challenge ||
    challenge.status !== "active" ||
    challenge.consumedAt !== null ||
    challenge.actorUserId !== session.actorUserId ||
    challenge.sessionId !== session.sessionId
  ) {
    throw rejected();
  }
  assertChallengeIntegrity(challenge, session.challengeId);
  const expiresAt = parsePersistedInstant(challenge.expiresAt);
  if (Temporal.Instant.compare(expiresAt, now) <= 0) throw rejected();
}

function assertChallengeIntegrity(
  challenge: FinanceAuthorizationChallenge,
  expectedChallengeId: string
): void {
  if (
    challenge.id !== expectedChallengeId ||
    !uuidPattern.test(challenge.id) ||
    !base64UrlChallengePattern.test(challenge.challenge) ||
    !sensitiveActionKinds.has(challenge.actionKind) ||
    !payloadHashPattern.test(challenge.payloadHash) ||
    !Number.isSafeInteger(challenge.expectedVersion) ||
    challenge.expectedVersion < 0
  ) {
    throw new FinanceAuthorizationIntegrityError();
  }
  assertIdentifierIntegrity(challenge.actorUserId);
  assertIdentifierIntegrity(challenge.sessionId);
  assertIdentifierIntegrity(challenge.aggregateId);
  const relyingParty = normalizeRelyingParty(challenge.rpId, challenge.origin);
  if (relyingParty.rpId !== challenge.rpId || relyingParty.origin !== challenge.origin) {
    throw new FinanceAuthorizationIntegrityError();
  }
  assertLifetime(challenge.issuedAt, challenge.expiresAt);
}

function assertSameChallengeSnapshot(
  locked: FinanceAuthorizationChallenge,
  verified: FinanceAuthorizationChallenge
): void {
  if (
    locked.id !== verified.id ||
    !challengeMatchesBinding(locked, verified) ||
    locked.challenge !== verified.challenge ||
    locked.rpId !== verified.rpId ||
    locked.origin !== verified.origin ||
    locked.issuedAt !== verified.issuedAt ||
    locked.expiresAt !== verified.expiresAt
  ) {
    throw new FinanceAuthorizationIntegrityError();
  }
}

function assertPersistedGrant(
  grant: FinanceAuthorizationGrant,
  draft: FinanceAuthorizationGrantDraft
): void {
  if (
    !grant ||
    !uuidPattern.test(grant.authorizationId) ||
    grant.status !== "active" ||
    grant.consumedAt !== null ||
    !grantMatchesBinding(grant, draft) ||
    grant.verifiedAt !== draft.verifiedAt ||
    grant.expiresAt !== draft.expiresAt
  ) {
    throw new FinanceAuthorizationIntegrityError();
  }
  assertLifetime(grant.verifiedAt, grant.expiresAt);
}

function assertUsableGrant(
  grant: FinanceAuthorizationGrant | null,
  expectedAuthorizationId: string,
  binding: FinanceAuthorizationBinding,
  now: Temporal.Instant
): asserts grant is FinanceAuthorizationGrant {
  if (grant && grant.authorizationId !== expectedAuthorizationId) {
    throw new FinanceAuthorizationIntegrityError();
  }
  if (
    !grant ||
    grant.status !== "active" ||
    grant.consumedAt !== null ||
    !grantMatchesBinding(grant, binding)
  ) {
    throw rejected();
  }
  const expiresAt = parsePersistedInstant(grant.expiresAt);
  assertLifetime(grant.verifiedAt, grant.expiresAt);
  if (Temporal.Instant.compare(expiresAt, now) <= 0) throw rejected();
}

function assertConsumedGrant(
  consumed: FinanceAuthorizationGrant,
  active: FinanceAuthorizationGrant,
  expectedConsumedAt: string
): void {
  if (
    consumed.status !== "consumed" ||
    consumed.consumedAt !== expectedConsumedAt ||
    consumed.authorizationId !== active.authorizationId ||
    !grantMatchesBinding(consumed, active) ||
    consumed.verifiedAt !== active.verifiedAt ||
    consumed.expiresAt !== active.expiresAt
  ) {
    throw new FinanceAuthorizationIntegrityError();
  }
  parsePersistedInstant(consumed.consumedAt);
}

function counterMutationAccepted(
  result: FinanceWebAuthnCredentialCounterMutationResult,
  storedCounter: number,
  assertedCounter: number
): boolean {
  const counterless = storedCounter === 0 && assertedCounter === 0;
  const advancing = assertedCounter > storedCounter;

  if (result.outcome === "quarantined" || result.outcome === "unavailable") {
    return false;
  }
  if (
    (counterless && result.outcome === "unchanged_zero" && result.signatureCounter === 0) ||
    (advancing && result.outcome === "advanced" && result.signatureCounter === assertedCounter)
  ) {
    return true;
  }
  throw new FinanceAuthorizationIntegrityError();
}

function assertLifetime(startValue: string, expiryValue: string): void {
  const start = parsePersistedInstant(startValue);
  const expiry = parsePersistedInstant(expiryValue);
  const durationNanoseconds = expiry.epochNanoseconds - start.epochNanoseconds;
  if (
    durationNanoseconds <= 0n ||
    durationNanoseconds > BigInt(authorizationTimeoutMilliseconds) * 1_000_000n
  ) {
    throw new FinanceAuthorizationIntegrityError();
  }
}

function parsePersistedInstant(value: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new FinanceAuthorizationIntegrityError();
  }
}

function challengeMatchesBinding(
  challenge: FinanceAuthorizationChallenge | FinanceAuthorizationChallengeDraft,
  binding: FinanceAuthorizationBinding
): boolean {
  return bindingMatches(challenge, binding);
}

function bindingFromChallenge(
  challenge: FinanceAuthorizationChallenge
): FinanceAuthorizationBinding {
  return {
    actorUserId: challenge.actorUserId,
    sessionId: challenge.sessionId,
    actionKind: challenge.actionKind,
    aggregateId: challenge.aggregateId,
    expectedVersion: challenge.expectedVersion,
    payloadHash: challenge.payloadHash
  };
}

function grantMatchesBinding(
  grant: FinanceAuthorizationGrant | FinanceAuthorizationGrantDraft,
  binding: FinanceAuthorizationBinding
): boolean {
  return bindingMatches(grant, binding);
}

function bindingMatches(
  persisted: FinanceAuthorizationBinding,
  expected: FinanceAuthorizationBinding
): boolean {
  return (
    persisted.actorUserId === expected.actorUserId &&
    persisted.sessionId === expected.sessionId &&
    persisted.actionKind === expected.actionKind &&
    persisted.aggregateId === expected.aggregateId &&
    persisted.expectedVersion === expected.expectedVersion &&
    persisted.payloadHash === expected.payloadHash
  );
}

function rejected(): FinanceAuthorizationRejectedError {
  return new FinanceAuthorizationRejectedError();
}

export {
  FinanceAuthorizationPayloadError,
  canonicalizeFinanceCommandPayload,
  hashFinanceCommandPayload
} from "./canonical-command-payload";
export * from "./finance-authorization-boundary";
