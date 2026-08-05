import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingUnsignedDecimal,
  readFinancePostingVersion
} from "./posting-codec";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import type {
  ChargebackPrincipalPositionPreviousRef,
  ChargebackPrincipalPositionTransitionRef,
  UnverifiedChargebackTreatmentDecision
} from "./chargeback-principal-position-types";
import type { FinancePostingAuthorityRef } from "./posting-types";

export function readUnverifiedChargebackTreatmentDecision(
  input: unknown
): UnverifiedChargebackTreatmentDecision {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "decisionId",
    "version",
    "approvalStatus",
    "authorizationStatus",
    "digestPurpose",
    "chargebackCaseId",
    "orderId",
    "astrologerUserId",
    "positionId",
    "treatment",
    "approvedAmount",
    "policyId",
    "policyVersion",
    "proposedByActorUserId",
    "approvedByActorUserId",
    "approvedAt",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "unverified_chargeback_treatment_decision" ||
    fields.schemaVersion !== 1 ||
    fields.approvalStatus !== "approved" ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    (fields.treatment !== "astrologer_recovery" && fields.treatment !== "platform_loss")
  ) {
    mismatch();
  }
  const core = Object.freeze({
    kind: "unverified_chargeback_treatment_decision" as const,
    schemaVersion: 1 as const,
    decisionId: readFinancePostingIdentifier(fields.decisionId),
    version: readFinancePostingVersion(fields.version),
    approvalStatus: "approved" as const,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    orderId: readFinancePostingIdentifier(fields.orderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    positionId: readFinancePostingIdentifier(fields.positionId),
    treatment: fields.treatment,
    approvedAmount: readChargebackUnsignedMoney(fields.approvedAmount),
    policyId: readFinancePostingIdentifier(fields.policyId),
    policyVersion: readFinancePostingVersion(fields.policyVersion),
    proposedByActorUserId: readFinancePostingIdentifier(fields.proposedByActorUserId),
    approvedByActorUserId: readFinancePostingIdentifier(fields.approvedByActorUserId),
    approvedAt: readFinancePostingInstant(fields.approvedAt)
  });
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (
    core.proposedByActorUserId === core.approvedByActorUserId ||
    canonicalDigest !== hashFinanceCommandPayload(core)
  ) {
    mismatch();
  }
  return Object.freeze({ ...core, canonicalDigest });
}

export function readChargebackPositionPreviousRef(
  input: unknown,
  maximumDecimalDigits: number
): ChargebackPrincipalPositionPreviousRef | null {
  if (input === null) return null;
  const fields = readExactDataRecord(input, ["bindingId", "nextPositionVersion", "bindingDigest"]);
  return Object.freeze({
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    nextPositionVersion: readDecimalVersion(fields.nextPositionVersion, maximumDecimalDigits),
    bindingDigest: readFinancePostingDigest(fields.bindingDigest)
  });
}

export function readChargebackPrincipalPositionTransitionRef(
  input: unknown,
  maximumDecimalDigits: number
): ChargebackPrincipalPositionTransitionRef {
  const fields = readExactDataRecord(input, [
    "kind",
    "bindingId",
    "nextPositionVersion",
    "bindingDigest"
  ]);
  if (fields.kind !== "unverified_chargeback_principal_position_transition_binding") {
    mismatch();
  }
  return Object.freeze({
    kind: "unverified_chargeback_principal_position_transition_binding" as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    nextPositionVersion: readDecimalVersion(fields.nextPositionVersion, maximumDecimalDigits),
    bindingDigest: readFinancePostingDigest(fields.bindingDigest)
  });
}

export function readPositionAuthorityRef(input: unknown): FinancePostingAuthorityRef {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  return Object.freeze({
    kind: readFinancePostingIdentifier(fields.kind),
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

export function readDecimalVersion(input: unknown, maximumDecimalDigits: number): string {
  return readFinancePostingUnsignedDecimal(input, maximumDecimalDigits);
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
