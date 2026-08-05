import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { ChargebackLostAuthority, ChargebackWonAuthority } from "../source-lot-types";
import { readChargebackSourceAuthority } from "./chargeback-source-authority";
import {
  FinancePostingIntegrityError,
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

export type UnverifiedChargebackOutcomeEvidenceBinding = Readonly<{
  kind: "unverified_chargeback_outcome_evidence_binding";
  schemaVersion: 1;
  evidenceId: string;
  version: number;
  authorizationStatus: "unverified";
  digestPurpose: "drift_detection_only";
  auditSource: "internal_case_review";
  outcome: "won" | "lost";
  chargebackCaseId: string;
  sourceAuthority: ChargebackWonAuthority | ChargebackLostAuthority;
  sourceAuthorityDigest: FinanceAuthorizationPayloadHash;
  auditedByActorUserId: string;
  decidedAt: string;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type UnverifiedChargebackOutcomeEvidenceRef = Readonly<{
  kind: "unverified_chargeback_outcome_evidence_binding";
  evidenceId: string;
  version: number;
  outcome: "won" | "lost";
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export function readUnverifiedChargebackOutcomeEvidenceBinding(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedChargebackOutcomeEvidenceBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "evidenceId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "auditSource",
    "outcome",
    "chargebackCaseId",
    "sourceAuthority",
    "sourceAuthorityDigest",
    "auditedByActorUserId",
    "decidedAt",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "unverified_chargeback_outcome_evidence_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.auditSource !== "internal_case_review" ||
    (fields.outcome !== "won" && fields.outcome !== "lost")
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const decoded = readChargebackSourceAuthority(fields.sourceAuthority, envelope);
  const source = decoded.authority;
  if (source.kind !== "chargeback_won" && source.kind !== "chargeback_lost") {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  if (
    (fields.outcome === "won" && source.kind !== "chargeback_won") ||
    (fields.outcome === "lost" && source.kind !== "chargeback_lost")
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const decidedAt = readFinancePostingInstant(fields.decidedAt);
  const evidenceId = readFinancePostingIdentifier(fields.evidenceId);
  const chargebackCaseId = readFinancePostingIdentifier(fields.chargebackCaseId);
  if (
    source.chargebackCaseId !== chargebackCaseId ||
    source.canonicalEvidenceId !== evidenceId ||
    (source.kind === "chargeback_won" ? source.wonAt : source.lostAt) !== decidedAt
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const core = Object.freeze({
    kind: "unverified_chargeback_outcome_evidence_binding" as const,
    schemaVersion: 1 as const,
    evidenceId,
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    auditSource: "internal_case_review" as const,
    outcome: fields.outcome,
    chargebackCaseId,
    sourceAuthority: source,
    sourceAuthorityDigest: readFinancePostingDigest(fields.sourceAuthorityDigest),
    auditedByActorUserId: readFinancePostingIdentifier(fields.auditedByActorUserId),
    decidedAt
  });
  if (core.sourceAuthorityDigest !== decoded.canonicalDigest) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, canonicalDigest });
}

export function outcomeEvidenceRef(
  evidence: UnverifiedChargebackOutcomeEvidenceBinding
): UnverifiedChargebackOutcomeEvidenceRef {
  return Object.freeze({
    kind: evidence.kind,
    evidenceId: evidence.evidenceId,
    version: evidence.version,
    outcome: evidence.outcome,
    canonicalDigest: evidence.canonicalDigest
  });
}
