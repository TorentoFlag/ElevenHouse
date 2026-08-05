import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  ChargebackPrincipalConfirmedBasisIntegrityError,
  readChargebackPrincipalConfirmedBasis
} from "../chargeback-principal-confirmed-basis";
import {
  readChargebackPositionPreviousRef,
  readDecimalVersion
} from "./chargeback-principal-position-authority";
import { assertChargebackPrincipalPositionIntegrity } from "./chargeback-principal-position-integrity";
import {
  readChargebackPaidRecoveryPosition,
  readChargebackPlatformPosition
} from "./chargeback-principal-position-rows";
import type { UnverifiedChargebackPrincipalPositionTransitionBinding } from "./chargeback-principal-position-types";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingVersion
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";

export { FinancePostingIntegrityError } from "./posting-codec";
export {
  assertChargebackPrincipalPositionPriorResolved,
  assertChargebackPrincipalPriorChainsAligned
} from "./chargeback-principal-position-prior";
export type {
  ChargebackPrincipalPositionTransitionRef,
  UnverifiedChargebackPrincipalPositionTransitionBinding
} from "./chargeback-principal-position-types";

export function readUnverifiedChargebackPrincipalPositionTransitionBinding(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedChargebackPrincipalPositionTransitionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "bindingId",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "positionId",
    "expectedPositionVersion",
    "nextPositionVersion",
    "previousBindingRef",
    "chargebackCaseId",
    "orderId",
    "astrologerUserId",
    "providerAccountId",
    "accountingAllocationId",
    "accountingAllocationRevisionId",
    "accountingAllocationVersion",
    "providerEvidenceBindingDigest",
    "confirmedBasis",
    "caseExposure",
    "recoveryPositions",
    "platformPositions",
    "observedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_chargeback_principal_position_transition_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    mismatch("authority_mismatch");
  }
  const recoveryRows = readExactDataArray(fields.recoveryPositions, 0, envelope.maxAllocations);
  const platformRows = readExactDataArray(fields.platformPositions, 0, envelope.maxAllocations);
  if (recoveryRows.length + platformRows.length > envelope.maxAllocations) {
    mismatch("decoder_envelope_exceeded");
  }
  const core = Object.freeze({
    kind: "unverified_chargeback_principal_position_transition_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: readFinancePostingIdentifier(fields.positionId),
    expectedPositionVersion: readDecimalVersion(
      fields.expectedPositionVersion,
      envelope.maxDecimalDigits
    ),
    nextPositionVersion: readDecimalVersion(fields.nextPositionVersion, envelope.maxDecimalDigits),
    previousBindingRef: readChargebackPositionPreviousRef(
      fields.previousBindingRef,
      envelope.maxDecimalDigits
    ),
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    orderId: readFinancePostingIdentifier(fields.orderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
    accountingAllocationId: readFinancePostingIdentifier(fields.accountingAllocationId),
    accountingAllocationRevisionId: readFinancePostingIdentifier(
      fields.accountingAllocationRevisionId
    ),
    accountingAllocationVersion: readFinancePostingVersion(fields.accountingAllocationVersion),
    providerEvidenceBindingDigest: readFinancePostingDigest(fields.providerEvidenceBindingDigest),
    confirmedBasis: readConfirmedBasis(fields.confirmedBasis),
    caseExposure: readCaseExposure(fields.caseExposure),
    recoveryPositions: Object.freeze(recoveryRows.map(readChargebackPaidRecoveryPosition)),
    platformPositions: Object.freeze(
      platformRows.map((row) => readChargebackPlatformPosition(row, envelope))
    ),
    observedAt: readFinancePostingInstant(fields.observedAt)
  });
  assertChargebackPrincipalPositionIntegrity(core);
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) mismatch("evidence_mismatch");
  return Object.freeze({ ...core, bindingDigest });
}

function readCaseExposure(input: unknown) {
  const fields = readExactDataRecord(input, [
    "disputedPrincipal",
    "allocatedBefore",
    "payableDelta",
    "recoveryDelta",
    "platformDelta",
    "allocationDelta",
    "allocatedAfter",
    "unallocatedAfter"
  ]);
  return Object.freeze({
    disputedPrincipal: readChargebackUnsignedMoney(fields.disputedPrincipal),
    allocatedBefore: readChargebackUnsignedMoney(fields.allocatedBefore),
    payableDelta: readChargebackUnsignedMoney(fields.payableDelta),
    recoveryDelta: readChargebackUnsignedMoney(fields.recoveryDelta),
    platformDelta: readChargebackUnsignedMoney(fields.platformDelta),
    allocationDelta: readChargebackUnsignedMoney(fields.allocationDelta),
    allocatedAfter: readChargebackUnsignedMoney(fields.allocatedAfter),
    unallocatedAfter: readChargebackUnsignedMoney(fields.unallocatedAfter)
  });
}

function readConfirmedBasis(input: unknown) {
  try {
    return readChargebackPrincipalConfirmedBasis(input);
  } catch (error) {
    if (error instanceof ChargebackPrincipalConfirmedBasisIntegrityError) {
      mismatch("authority_mismatch");
    }
    throw error;
  }
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
