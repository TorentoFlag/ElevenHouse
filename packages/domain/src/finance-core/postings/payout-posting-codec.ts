import type { FinanceTransactionAuthorizationProof } from "../../finance-authorization/finance-authorization-boundary";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingVersion,
  readPositiveFinancePostingDecimal
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type {
  PayoutBeneficiarySnapshotBinding,
  PayoutBankExposureBindingRef
} from "./payout-bank-exposure-types";
import { isPayoutBankExposureStatus } from "./payout-bank-exposure-types";
import type {
  PayoutStateTransitionBinding,
  PayoutPostingStatus
} from "./hold-payout-posting-types";
import type { FinancePostingAuthorityRef, FinancePostingEvidenceRef } from "./posting-types";

const payoutStatuses = new Set<PayoutPostingStatus>([
  "requested",
  "under_review",
  "approved",
  "processing_manual",
  "paid",
  "failed",
  "rejected",
  "cancelled"
]);

export function readPayoutStateTransition(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): PayoutStateTransitionBinding {
  const fields = readExactDataRecord(input, ["expectedVersion", "from", "nextVersion", "to"]);
  const expectedVersion = readPositiveFinancePostingDecimal(
    fields.expectedVersion,
    envelope.maxDecimalDigits
  );
  const nextVersion = readPositiveFinancePostingDecimal(
    fields.nextVersion,
    envelope.maxDecimalDigits
  );
  if (
    !payoutStatuses.has(fields.from as PayoutPostingStatus) ||
    !payoutStatuses.has(fields.to as PayoutPostingStatus) ||
    BigInt(nextVersion) !== BigInt(expectedVersion) + 1n
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    expectedVersion,
    from: fields.from as PayoutPostingStatus,
    nextVersion,
    to: fields.to as PayoutPostingStatus
  });
}

export function readPayoutBeneficiarySnapshot(input: unknown): PayoutBeneficiarySnapshotBinding {
  const fields = readExactDataRecord(input, [
    "snapshotId",
    "schemaVersion",
    "fingerprint",
    "canonicalDigest"
  ]);
  if (fields.schemaVersion !== 1) {
    throw new FinancePostingIntegrityError("invalid_version");
  }
  return Object.freeze({
    snapshotId: readFinancePostingIdentifier(fields.snapshotId),
    schemaVersion: 1,
    fingerprint: readFinancePostingIdentifier(fields.fingerprint),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readPayoutAuthorizationProof(
  input: unknown,
  expected: {
    actionKind: "payout_approve" | "payout_start_processing" | "payout_confirm_paid";
    aggregateId: string;
    expectedVersion: string;
    payloadHash: string;
    occurredAt: string;
  }
): FinanceTransactionAuthorizationProof {
  const fields = readExactDataRecord(input, [
    "authorizationId",
    "actorUserId",
    "sessionId",
    "actionKind",
    "aggregateId",
    "expectedVersion",
    "payloadHash",
    "verifiedAt",
    "expiresAt",
    "status"
  ]);
  const verifiedAt = readFinancePostingInstant(fields.verifiedAt);
  const expiresAt = readFinancePostingInstant(fields.expiresAt);
  const expectedVersion = readFinancePostingVersion(fields.expectedVersion);
  if (
    fields.status !== "consumed" ||
    fields.actionKind !== expected.actionKind ||
    fields.aggregateId !== expected.aggregateId ||
    String(expectedVersion) !== expected.expectedVersion ||
    fields.payloadHash !== expected.payloadHash ||
    compareFinancePostingInstants(expiresAt, verifiedAt) < 0 ||
    compareFinancePostingInstants(expected.occurredAt, verifiedAt) < 0 ||
    compareFinancePostingInstants(expiresAt, expected.occurredAt) < 0
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    authorizationId: readFinancePostingIdentifier(fields.authorizationId),
    actorUserId: readFinancePostingIdentifier(fields.actorUserId),
    sessionId: readFinancePostingIdentifier(fields.sessionId),
    actionKind: expected.actionKind,
    aggregateId: readFinancePostingIdentifier(fields.aggregateId),
    expectedVersion,
    payloadHash: readFinancePostingDigest(fields.payloadHash),
    verifiedAt,
    expiresAt,
    status: "consumed"
  });
}

export function readPayoutAuthorityRef(input: unknown): FinancePostingAuthorityRef {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  return Object.freeze({
    kind: readFinancePostingIdentifier(fields.kind),
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readPayoutEvidenceRef(input: unknown): FinancePostingEvidenceRef {
  const fields = readExactDataRecord(input, ["kind", "evidenceId", "canonicalDigest"]);
  return Object.freeze({
    kind: readFinancePostingIdentifier(fields.kind),
    evidenceId: readFinancePostingIdentifier(fields.evidenceId),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readPayoutExposureRef(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): PayoutBankExposureBindingRef {
  const fields = readExactDataRecord(input, [
    "bindingId",
    "exposureVersion",
    "status",
    "bindingDigest"
  ]);
  if (!isPayoutBankExposureStatus(fields.status)) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    exposureVersion: readPositiveFinancePostingDecimal(
      fields.exposureVersion,
      envelope.maxDecimalDigits
    ),
    status: fields.status as PayoutBankExposureBindingRef["status"],
    bindingDigest: readFinancePostingDigest(fields.bindingDigest)
  });
}
