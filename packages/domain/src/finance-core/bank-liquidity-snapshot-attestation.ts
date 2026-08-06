import {
  hashFinanceCommandPayload,
  type FinanceTransactionAuthorizationProof
} from "../finance-authorization";
import type { FinanceCurrency, RawBankArtifactRef } from "./ports/finance-port-types";
import type {
  BankLiquiditySnapshotAttestationReceiptRef,
  VerifiedBankLiquiditySnapshotEvidence
} from "./ports/trusted-finance-evidence";

export class BankLiquiditySnapshotAttestationIssuanceError extends Error {
  readonly code = "bank_liquidity_snapshot_attestation_issuance_invalid" as const;

  constructor() {
    super("Bank liquidity snapshot evidence could not be issued from the exact attestation");
    this.name = "BankLiquiditySnapshotAttestationIssuanceError";
  }
}

export type BankLiquiditySnapshotAttestationInput = Readonly<{
  attestationId: string;
  bankCashPoolId: string;
  currency: FinanceCurrency;
  expectedBankLiquidityRevision: string;
  unrestrictedAvailableMinor: string;
  sourceCheckpoint: string;
  asOf: string;
  expiresAt: string;
  evidenceArtifact: RawBankArtifactRef;
}>;

/** Exact payload that a passkey signs before a manual bank balance enters the liquidity system. */
export function createBankLiquiditySnapshotAttestationAuthorizationPayload(
  input: BankLiquiditySnapshotAttestationInput
) {
  const value = normalize(input);
  return Object.freeze({
    bankCashPoolId: value.bankCashPoolId,
    currency: "RUB" as const,
    expectedBankLiquidityRevision: value.expectedBankLiquidityRevision,
    unrestrictedAvailableMinor: value.unrestrictedAvailableMinor,
    sourceCheckpoint: value.sourceCheckpoint,
    asOf: value.asOf,
    expiresAt: value.expiresAt,
    evidenceArtifact: Object.freeze({
      artifactId: value.evidenceArtifact.artifactId,
      sha256Digest: value.evidenceArtifact.sha256Digest,
      byteLength: value.evidenceArtifact.byteLength
    })
  });
}

/**
 * Server-side issuer for the nominal evidence passed to snapshot adoption. The receipt itself is
 * persisted in the same finance transaction; this function merely prevents an HTTP handler from
 * manufacturing evidence outside that audited receipt boundary.
 */
export function issueVerifiedBankLiquiditySnapshotEvidence(input: Readonly<
  BankLiquiditySnapshotAttestationInput & {
    authorization: FinanceTransactionAuthorizationProof;
    receipt: BankLiquiditySnapshotAttestationReceiptRef;
  }
>): VerifiedBankLiquiditySnapshotEvidence {
  const value = normalize(input);
  const payload = createBankLiquiditySnapshotAttestationAuthorizationPayload(value);
  assertAuthorization(input.authorization, value, payload);
  if (
    input.receipt.kind !== "bank_liquidity_snapshot_attestation_receipt" ||
    input.receipt.attestationId !== value.attestationId ||
    input.receipt.version !== 1 ||
    !digest(input.receipt.canonicalDigest)
  ) {
    fail();
  }
  return Object.freeze({
    kind: "verified_bank_liquidity_snapshot_evidence",
    bankCashPoolId: value.bankCashPoolId,
    balanceBasis: "unrestricted_available",
    unrestrictedAvailableMinor: value.unrestrictedAvailableMinor,
    currency: "RUB",
    sourceCheckpoint: value.sourceCheckpoint,
    asOf: value.asOf,
    expiresAt: value.expiresAt,
    evidenceDigest: input.receipt.canonicalDigest,
    attestation: input.receipt
  }) as VerifiedBankLiquiditySnapshotEvidence;
}

function assertAuthorization(
  authorization: FinanceTransactionAuthorizationProof,
  value: ReturnType<typeof normalize>,
  payload: ReturnType<typeof createBankLiquiditySnapshotAttestationAuthorizationPayload>
): void {
  if (
    authorization.status !== "consumed" ||
    authorization.actionKind !== "bank_snapshot_attest" ||
    authorization.aggregateId !== value.attestationId ||
    authorization.expectedVersion !== safeRevision(value.expectedBankLiquidityRevision) ||
    authorization.payloadHash !== hashFinanceCommandPayload(payload) ||
    !uuid(authorization.authorizationId) ||
    !uuid(authorization.actorUserId) ||
    !uuid(authorization.sessionId) ||
    !instant(authorization.verifiedAt) ||
    !instant(authorization.expiresAt)
  ) {
    fail();
  }
}

function normalize(input: BankLiquiditySnapshotAttestationInput) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail();
  const attestationId = uuid(input.attestationId);
  const bankCashPoolId = identifier(input.bankCashPoolId, 160);
  if (input.currency !== "RUB") fail();
  const expectedBankLiquidityRevision = nonNegativeRevision(input.expectedBankLiquidityRevision);
  const unrestrictedAvailableMinor = nonNegativeRevision(input.unrestrictedAvailableMinor);
  const sourceCheckpoint = identifier(input.sourceCheckpoint, 320);
  const asOf = instant(input.asOf);
  const expiresAt = instant(input.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(asOf)) fail();
  const evidenceArtifact = normalizeArtifact(input.evidenceArtifact, bankCashPoolId);
  return Object.freeze({
    attestationId,
    bankCashPoolId,
    currency: "RUB" as const,
    expectedBankLiquidityRevision,
    unrestrictedAvailableMinor,
    sourceCheckpoint,
    asOf,
    expiresAt,
    evidenceArtifact
  });
}

function normalizeArtifact(value: RawBankArtifactRef, bankCashPoolId: string): RawBankArtifactRef {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !identifier(value.artifactId, 160) ||
    !digest(value.sha256Digest) ||
    !positiveSafeInteger(value.byteLength) ||
    value.bankCashPoolId !== bankCashPoolId ||
    !digest(value.statementSourceFingerprint)
  ) {
    fail();
  }
  return Object.freeze({ ...value });
}

function identifier(value: unknown, maximum: number): string {
  // Exact ASCII C0/DEL rejection is part of the immutable finance identifier boundary.
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    // eslint-disable-next-line no-control-regex -- exact ASCII C0/DEL rejection is the boundary contract.
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail();
  }
  return value;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    fail();
  }
  return value;
}

function nonNegativeRevision(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) fail();
  return value;
}

function safeRevision(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail();
  return parsed;
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function digest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail();
  }
  return value;
}

function fail(): never {
  throw new BankLiquiditySnapshotAttestationIssuanceError();
}
