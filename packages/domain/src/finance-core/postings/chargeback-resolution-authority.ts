import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import { readChargebackSourceAuthority } from "./chargeback-source-authority";
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
import {
  assertResolutionCanonicalRefs,
  readResolutionAllocationRef,
  readResolutionOutcomeRef,
  readResolutionProviderRef,
  readResolutionRecoveryRef
} from "./chargeback-resolution-authority-refs";
import type {
  ChargebackLostResolutionPostingAuthority,
  ChargebackWonResolutionPostingAuthority
} from "./chargeback-resolution-types";

const baseKeys = [
  "kind",
  "schemaVersion",
  "authorityId",
  "version",
  "authorizationStatus",
  "atomicityStatus",
  "digestPurpose",
  "chargebackCaseId",
  "originalOrderId",
  "astrologerUserId",
  "arcProviderAccountId",
  "providerPaymentId",
  "sourceAuthority",
  "sourceAuthorityDigest",
  "outcomeEvidenceRef",
  "latestProviderBindingRef",
  "allocationRefs",
  "recoveryRefs",
  "disputedPrincipal",
  "unallocatedSuspense",
  "decidedAt",
  "canonicalDigest"
] as const;

export function readChargebackWonResolutionPostingAuthority(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): ChargebackWonResolutionPostingAuthority {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    ...baseKeys,
    "operationReceiptId",
    "operationReceiptDigest",
    "componentBindingsDigest",
    "outstandingRecovery",
    "restoredPayable",
    "platformReversal"
  ]);
  assertLiterals(fields, "chargeback_won_resolution_posting");
  const source = readChargebackSourceAuthority(fields.sourceAuthority, envelope);
  if (source.authority.kind !== "chargeback_won") mismatch();
  const common = readCommon(fields, source.canonicalDigest, envelope);
  const core = Object.freeze({
    kind: "chargeback_won_resolution_posting" as const,
    ...common,
    sourceAuthority: source.authority,
    operationReceiptId: readFinancePostingIdentifier(fields.operationReceiptId),
    operationReceiptDigest: readFinancePostingDigest(fields.operationReceiptDigest),
    componentBindingsDigest: readFinancePostingDigest(fields.componentBindingsDigest),
    outstandingRecovery: readChargebackUnsignedMoney(fields.outstandingRecovery),
    restoredPayable: readChargebackUnsignedMoney(fields.restoredPayable),
    platformReversal: readChargebackUnsignedMoney(fields.platformReversal)
  });
  if (
    core.authorityId !== source.authority.authorityId ||
    core.version !== source.authority.version ||
    core.chargebackCaseId !== source.authority.chargebackCaseId ||
    core.decidedAt !== source.authority.wonAt ||
    core.outcomeEvidenceRef.outcome !== "won"
  )
    mismatch();
  money(source.authority.restoredPayableAmount, core.restoredPayable);
  money(source.authority.suspenseClearedAmount, core.unallocatedSuspense);
  const total = [
    core.outstandingRecovery,
    core.restoredPayable,
    core.platformReversal,
    core.unallocatedSuspense
  ].reduce((sum, value) => sum + BigInt(value.amountMinor), 0n);
  if (total !== BigInt(core.disputedPrincipal.amountMinor)) amountMismatch();
  return finish(core, fields.canonicalDigest);
}

export function readChargebackLostResolutionPostingAuthority(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): ChargebackLostResolutionPostingAuthority {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [...baseKeys, "resultingRestrictionStatus"]);
  assertLiterals(fields, "chargeback_lost_resolution_no_posting");
  const source = readChargebackSourceAuthority(fields.sourceAuthority, envelope);
  if (source.authority.kind !== "chargeback_lost") mismatch();
  const common = readCommon(fields, source.canonicalDigest, envelope);
  if (
    fields.resultingRestrictionStatus !== "allocation_blocked" &&
    fields.resultingRestrictionStatus !== "closed_lost"
  )
    mismatch();
  const core = Object.freeze({
    kind: "chargeback_lost_resolution_no_posting" as const,
    ...common,
    sourceAuthority: source.authority,
    resultingRestrictionStatus: fields.resultingRestrictionStatus
  });
  if (
    core.authorityId !== source.authority.authorityId ||
    core.version !== source.authority.version ||
    core.chargebackCaseId !== source.authority.chargebackCaseId ||
    core.decidedAt !== source.authority.lostAt ||
    core.outcomeEvidenceRef.outcome !== "lost"
  )
    mismatch();
  money(source.authority.unallocatedSuspense, core.unallocatedSuspense);
  const expected =
    core.unallocatedSuspense.amountMinor === 0 ? "closed_lost" : "allocation_blocked";
  if (core.resultingRestrictionStatus !== expected) amountMismatch();
  return finish(core, fields.canonicalDigest);
}

function readCommon(
  fields: Record<string, unknown>,
  sourceDigest: string,
  envelope: FinancePostingDecoderEnvelope
) {
  const allocationRefs = Object.freeze(
    readExactDataArray(fields.allocationRefs, 1, envelope.maxAllocations).map(
      readResolutionAllocationRef
    )
  );
  assertResolutionCanonicalRefs(allocationRefs);
  const recoveryRefs = Object.freeze(
    readExactDataArray(fields.recoveryRefs, 0, envelope.maxAllocations).map(
      readResolutionRecoveryRef
    )
  );
  assertResolutionCanonicalRefs(recoveryRefs);
  const common = Object.freeze({
    schemaVersion: 1 as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    originalOrderId: readFinancePostingIdentifier(fields.originalOrderId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    arcProviderAccountId: readFinancePostingIdentifier(fields.arcProviderAccountId),
    providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId),
    sourceAuthorityDigest: readFinancePostingDigest(fields.sourceAuthorityDigest),
    outcomeEvidenceRef: readResolutionOutcomeRef(fields.outcomeEvidenceRef),
    latestProviderBindingRef: readResolutionProviderRef(fields.latestProviderBindingRef),
    allocationRefs,
    recoveryRefs,
    disputedPrincipal: readChargebackUnsignedMoney(fields.disputedPrincipal),
    unallocatedSuspense: readChargebackUnsignedMoney(fields.unallocatedSuspense),
    decidedAt: readFinancePostingInstant(fields.decidedAt)
  });
  if (common.sourceAuthorityDigest !== sourceDigest) evidenceMismatch();
  return common;
}

function assertLiterals(fields: Record<string, unknown>, kind: string) {
  if (
    fields.kind !== kind ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  )
    mismatch();
}
function finish<T extends object>(
  core: T,
  digest: unknown
): T & { canonicalDigest: `sha256:${string}` } {
  const canonicalDigest = readFinancePostingDigest(digest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) evidenceMismatch();
  return Object.freeze({ ...core, canonicalDigest });
}
function money(
  left: { amountMinor: number; currency: string },
  right: { amountMinor: number; currency: string }
) {
  if (left.amountMinor !== right.amountMinor || left.currency !== right.currency) amountMismatch();
}
function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
function amountMismatch(): never {
  throw new FinancePostingIntegrityError("amount_mismatch");
}
function evidenceMismatch(): never {
  throw new FinancePostingIntegrityError("evidence_mismatch");
}
