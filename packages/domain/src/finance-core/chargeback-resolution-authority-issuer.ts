import {
  hashFinanceCommandPayload,
  type FinanceTransactionAuthorizationProof
} from "../finance-authorization";
import type {
  FinanceDigest,
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef
} from "./ports/finance-port-types";
import type {
  VerifiedChargebackProviderEvidence,
  VerifiedChargebackResolutionAuthority
} from "./ports/trusted-finance-evidence";

export class ChargebackResolutionAuthorityIssuanceError extends Error {
  readonly code = "chargeback_resolution_authority_issuance_invalid" as const;

  constructor() {
    super("Chargeback resolution authority could not be issued from the finance authorization proof");
    this.name = "ChargebackResolutionAuthorityIssuanceError";
  }
}

/** Exact, user-confirmed outcome associated with a sealed signed provider webhook. */
export type ChargebackResolutionDecisionAuthorizationPayload = Readonly<{
  chargebackCaseId: string;
  chargebackCaseVersion: number;
  outcomeWebhookEventId: string;
  resolution: "won" | "lost";
  currency: "RUB";
}>;

/**
 * Converts a consumed admin passkey authorization plus a server-read sealed ArcPay outcome into
 * the branded terminal capability accepted by the ledger. Neither browser payload nor an
 * unsealed attachment can manufacture this authority.
 */
export function issueVerifiedChargebackResolutionAuthority(input: Readonly<{
  authorization: FinanceTransactionAuthorizationProof;
  chargebackCaseId: string;
  chargebackCaseVersion: number;
  outcomeWebhookEventId: string;
  resolution: "won" | "lost";
  providerAccount: FinanceProviderAccountIdentity;
  providerPaymentId: string;
  cumulativePrincipalMinor: string;
  outcomeArtifact: RawProviderArtifactRef;
  observedAt: string;
  decidedAt: string;
}>): VerifiedChargebackResolutionAuthority {
  const chargebackCaseId = identifier(input.chargebackCaseId);
  const chargebackCaseVersion = version(input.chargebackCaseVersion);
  const outcomeWebhookEventId = identifier(input.outcomeWebhookEventId);
  const resolution = outcome(input.resolution);
  const providerAccount = providerBinding(input.providerAccount);
  const providerPaymentId = identifier(input.providerPaymentId);
  const cumulativePrincipalMinor = positiveMinor(input.cumulativePrincipalMinor);
  const artifact = artifactRef(input.outcomeArtifact);
  const observedAt = instant(input.observedAt);
  const decidedAt = instant(input.decidedAt);
  const payload: ChargebackResolutionDecisionAuthorizationPayload = Object.freeze({
    chargebackCaseId,
    chargebackCaseVersion,
    outcomeWebhookEventId,
    resolution,
    currency: "RUB"
  });
  assertAuthorization(input.authorization, payload);
  const providerEvidence = Object.freeze({
    kind: "verified_chargeback_provider_evidence" as const,
    providerAccount,
    chargebackCaseId,
    providerPaymentId,
    lifecycleFact: resolution,
    cumulativePrincipalMinor,
    currency: "RUB" as const,
    artifact,
    observedAt
  }) as VerifiedChargebackProviderEvidence;
  const allocationAuthorityDigest = hashFinanceCommandPayload({
    kind: "chargeback_resolution_authority.v1",
    chargebackCaseId,
    chargebackCaseVersion,
    outcomeWebhookEventId,
    resolution,
    providerAccount,
    providerPaymentId,
    cumulativePrincipalMinor,
    artifact,
    decidedByActorId: input.authorization.actorUserId,
    decidedAt
  });
  return Object.freeze({
    kind: "verified_chargeback_resolution_authority" as const,
    chargebackCaseId,
    expectedChargebackVersion: chargebackCaseVersion,
    resolution,
    cumulativePrincipalMinor,
    providerEvidence,
    allocationAuthorityId: input.authorization.authorizationId,
    allocationAuthorityVersion: "1",
    allocationAuthorityDigest,
    decidedByActorId: input.authorization.actorUserId,
    decidedAt
  }) as VerifiedChargebackResolutionAuthority;
}

function assertAuthorization(
  proof: FinanceTransactionAuthorizationProof,
  payload: ChargebackResolutionDecisionAuthorizationPayload
): void {
  if (
    proof.status !== "consumed" ||
    proof.actionKind !== "chargeback_resolution" ||
    proof.aggregateId !== payload.chargebackCaseId ||
    proof.expectedVersion !== payload.chargebackCaseVersion ||
    proof.payloadHash !== hashFinanceCommandPayload(payload) ||
    !identifier(proof.actorUserId) ||
    !identifier(proof.sessionId) ||
    !identifier(proof.authorizationId) ||
    !instant(proof.verifiedAt) ||
    !instant(proof.expiresAt)
  ) {
    fail();
  }
}

function providerBinding(value: unknown): FinanceProviderAccountIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const fields = value as Record<string, unknown>;
  if (Reflect.ownKeys(fields).length !== 3) fail();
  return Object.freeze({
    seriesId: identifier(fields.seriesId),
    providerAccountId: identifier(fields.providerAccountId),
    identityVersion: version(fields.identityVersion)
  });
}

function artifactRef(value: unknown): RawProviderArtifactRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const fields = value as Record<string, unknown>;
  const byteLength = fields.byteLength;
  if (
    Reflect.ownKeys(fields).length !== 3 ||
    typeof byteLength !== "number" ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0
  ) fail();
  return Object.freeze({
    artifactId: identifier(fields.artifactId),
    sha256Digest: digest(fields.sha256Digest),
    byteLength
  });
}

function outcome(value: unknown): "won" | "lost" {
  if (value === "won" || value === "lost") return value;
  fail();
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value.trim() !== value ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })
  ) fail();
  return value;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail();
  return Number(value);
}

function positiveMinor(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) fail();
  return value;
}

function digest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) fail();
  return value as FinanceDigest;
}

function instant(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) || Number.isNaN(Date.parse(value))) fail();
  return value;
}

function fail(): never {
  throw new ChargebackResolutionAuthorityIssuanceError();
}
