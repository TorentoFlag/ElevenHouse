import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion,
  readPositiveFinancePostingDecimal
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  isPayoutBankExposureStatus,
  isPayoutBankExposureTransitionKind,
  payoutBankExposureTransitionMatches,
  samePayoutBeneficiarySnapshot,
  type PayoutBankExposureBindingRef,
  type PayoutBankExposureStatus,
  type PayoutBankExposureTransitionKind,
  type PayoutBeneficiarySnapshotBinding,
  type UnverifiedPayoutBankExposureTransitionBinding
} from "./payout-bank-exposure-types";
import type { FinancePostingAuthorityRef } from "./posting-types";

export function readUnverifiedPayoutBankExposureTransitionBinding(
  input: unknown,
  decoderEnvelopeInput: unknown
): UnverifiedPayoutBankExposureTransitionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const root = readExactDataRecord(input, ["binding", "previousBinding"]);
  const previous =
    root.previousBinding === null ? null : readExposureBinding(root.previousBinding, envelope);
  const binding = readExposureBinding(root.binding, envelope);
  assertPreviousBinding(binding, previous);
  return binding;
}

export function readUnverifiedPayoutBankExposureBinding(
  input: unknown,
  decoderEnvelopeInput: unknown
): UnverifiedPayoutBankExposureTransitionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  return readExposureBinding(input, envelope);
}

function readExposureBinding(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): UnverifiedPayoutBankExposureTransitionBinding {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "bindingId",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "bankExposureId",
    "payoutRequestId",
    "astrologerUserId",
    "beneficiarySnapshot",
    "bankCashPoolId",
    "amount",
    "approvedByActorUserId",
    "transitionKind",
    "previousBindingRef",
    "exposureVersion",
    "status",
    "transitionAuthorityRef",
    "occurredAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_payout_bank_exposure_transition_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const transitionKind = exactTransitionKind(fields.transitionKind);
  const status = exactExposureStatus(fields.status);
  const previousBindingRef =
    fields.previousBindingRef === null
      ? null
      : readExposureBindingRef(fields.previousBindingRef, envelope);
  const exposureVersion = readPositiveFinancePostingDecimal(
    fields.exposureVersion,
    envelope.maxDecimalDigits
  );
  assertInternalTransition(transitionKind, previousBindingRef, status, exposureVersion);
  const core = Object.freeze({
    kind: "unverified_payout_bank_exposure_transition_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bankExposureId: readFinancePostingIdentifier(fields.bankExposureId),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    beneficiarySnapshot: readBeneficiarySnapshot(fields.beneficiarySnapshot),
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    amount: readFinancePostingMoney(fields.amount),
    approvedByActorUserId: readFinancePostingIdentifier(fields.approvedByActorUserId),
    transitionKind,
    previousBindingRef,
    exposureVersion,
    status,
    transitionAuthorityRef: readAuthorityRef(fields.transitionAuthorityRef),
    occurredAt: readFinancePostingInstant(fields.occurredAt)
  });
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, bindingDigest });
}

function readBeneficiarySnapshot(input: unknown): PayoutBeneficiarySnapshotBinding {
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

function readExposureBindingRef(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): PayoutBankExposureBindingRef {
  const fields = readExactDataRecord(input, [
    "bindingId",
    "exposureVersion",
    "status",
    "bindingDigest"
  ]);
  return Object.freeze({
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    exposureVersion: readPositiveFinancePostingDecimal(
      fields.exposureVersion,
      envelope.maxDecimalDigits
    ),
    status: exactExposureStatus(fields.status),
    bindingDigest: readFinancePostingDigest(fields.bindingDigest)
  });
}

function readAuthorityRef(input: unknown): FinancePostingAuthorityRef {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  return Object.freeze({
    kind: readFinancePostingIdentifier(fields.kind),
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

function assertInternalTransition(
  kind: PayoutBankExposureTransitionKind,
  previous: PayoutBankExposureBindingRef | null,
  status: PayoutBankExposureStatus,
  version: string
): void {
  if (kind === "approval_committed") {
    if (previous !== null || status !== "committed" || version !== "1") mismatch();
    return;
  }
  if (
    previous === null ||
    !payoutBankExposureTransitionMatches(kind, previous.status, status) ||
    BigInt(version) !== BigInt(previous.exposureVersion) + 1n
  ) {
    mismatch();
  }
}

function assertPreviousBinding(
  binding: UnverifiedPayoutBankExposureTransitionBinding,
  previous: UnverifiedPayoutBankExposureTransitionBinding | null
): void {
  if (previous === null) {
    if (binding.previousBindingRef !== null) mismatch();
    return;
  }
  const ref = binding.previousBindingRef;
  if (
    ref === null ||
    ref.bindingId !== previous.bindingId ||
    ref.exposureVersion !== previous.exposureVersion ||
    ref.status !== previous.status ||
    ref.bindingDigest !== previous.bindingDigest ||
    binding.bindingId === previous.bindingId
  ) {
    mismatch();
  }
  if (
    binding.bankExposureId !== previous.bankExposureId ||
    binding.payoutRequestId !== previous.payoutRequestId ||
    binding.astrologerUserId !== previous.astrologerUserId ||
    binding.bankCashPoolId !== previous.bankCashPoolId ||
    binding.approvedByActorUserId !== previous.approvedByActorUserId ||
    !samePayoutBeneficiarySnapshot(binding.beneficiarySnapshot, previous.beneficiarySnapshot)
  ) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
  assertFinancePostingMoneyEqual(binding.amount, previous.amount, "amount_mismatch");
  if (compareFinancePostingInstants(binding.occurredAt, previous.occurredAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

function exactExposureStatus(value: unknown): PayoutBankExposureStatus {
  if (!isPayoutBankExposureStatus(value)) mismatch();
  return value;
}

function exactTransitionKind(value: unknown): PayoutBankExposureTransitionKind {
  if (!isPayoutBankExposureTransitionKind(value)) mismatch();
  return value;
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
