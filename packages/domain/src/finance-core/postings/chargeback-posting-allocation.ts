import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  readChargebackPlatformPostingAllocation,
  readChargebackRecoveryPostingAllocation
} from "./chargeback-posting-allocation-rows";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import { readUnverifiedChargebackProviderEvidenceBinding } from "./chargeback-provider-evidence";
import type { ChargebackPrincipalPostingAllocationAuthority } from "./chargeback-posting-allocation-types";
import {
  assertChargebackPrincipalPostingPriorAllocationRef,
  readChargebackPrincipalPostingPriorAllocationAuthorityRef
} from "./chargeback-posting-prior-allocation";
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
  assertChargebackPostingAllocationAmounts,
  assertChargebackPostingAllocationIdentity
} from "./chargeback-posting-allocation-integrity";
import { readChargebackPrincipalPositionTransitionRef } from "./chargeback-principal-position-authority";

export { FinancePostingIntegrityError } from "./posting-codec";
export type {
  ChargebackPlatformPostingAllocation,
  ChargebackPrincipalPostingAllocationAuthority,
  ChargebackRecoveryPostingAllocation
} from "./chargeback-posting-allocation-types";

export function readChargebackPrincipalPostingAllocationAuthority(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): ChargebackPrincipalPostingAllocationAuthority;
export function readChargebackPrincipalPostingAllocationAuthority(
  input: unknown,
  decoderEnvelopeInput: unknown
): ChargebackPrincipalPostingAllocationAuthority {
  const envelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "authorityId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "chargebackCaseId",
    "orderId",
    "astrologerUserId",
    "arcProviderAccountId",
    "allocationStatus",
    "sourceAuthority",
    "confirmedProviderEvidenceBinding",
    "priorAllocationAuthorityRef",
    "positionTransitionRef",
    "disputedPrincipal",
    "payablePrincipal",
    "recoveryPrincipal",
    "platformPrincipal",
    "principalAllocationDelta",
    "nextAllocatedPrincipal",
    "unallocatedSuspense",
    "recoveryAllocations",
    "platformAllocations",
    "approvedAt",
    "canonicalDigest"
  ]);
  assertLiteralFields(fields);
  const source = readChargebackSourceAuthority(fields.sourceAuthority, envelope);
  if (source.authority.kind !== "chargeback_principal_allocation") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const confirmedProviderEvidenceBinding = readUnverifiedChargebackProviderEvidenceBinding(
    fields.confirmedProviderEvidenceBinding,
    envelope
  );
  const priorAllocationAuthorityRef = readChargebackPrincipalPostingPriorAllocationAuthorityRef(
    fields.priorAllocationAuthorityRef
  );
  const positionTransitionRef = readChargebackPrincipalPositionTransitionRef(
    fields.positionTransitionRef,
    envelope.maxDecimalDigits
  );
  const recoveryRows = readExactDataArray(fields.recoveryAllocations, 0, envelope.maxAllocations);
  const platformRows = readExactDataArray(fields.platformAllocations, 0, envelope.maxAllocations);
  if (recoveryRows.length + platformRows.length > envelope.maxAllocations) {
    throw new FinancePostingIntegrityError("decoder_envelope_exceeded");
  }
  const recoveryAllocations = Object.freeze(
    recoveryRows.map(readChargebackRecoveryPostingAllocation)
  );
  const platformAllocations = Object.freeze(
    platformRows.map((row) => readChargebackPlatformPostingAllocation(row, envelope))
  );
  const orderId = readFinancePostingIdentifier(fields.orderId);
  assertCanonicalRows(orderId, recoveryAllocations, platformAllocations);

  const core = Object.freeze({
    kind: "chargeback_principal_posting_allocation" as const,
    schemaVersion: 1 as const,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    orderId,
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    arcProviderAccountId: readFinancePostingIdentifier(fields.arcProviderAccountId),
    allocationStatus: "approved" as const,
    sourceAuthority: source.authority,
    confirmedProviderEvidenceBinding,
    priorAllocationAuthorityRef,
    positionTransitionRef,
    disputedPrincipal: readChargebackUnsignedMoney(fields.disputedPrincipal),
    payablePrincipal: readChargebackUnsignedMoney(fields.payablePrincipal),
    recoveryPrincipal: readChargebackUnsignedMoney(fields.recoveryPrincipal),
    platformPrincipal: readChargebackUnsignedMoney(fields.platformPrincipal),
    principalAllocationDelta: readChargebackUnsignedMoney(fields.principalAllocationDelta),
    nextAllocatedPrincipal: readChargebackUnsignedMoney(fields.nextAllocatedPrincipal),
    unallocatedSuspense: readChargebackUnsignedMoney(fields.unallocatedSuspense),
    recoveryAllocations,
    platformAllocations,
    approvedAt: readFinancePostingInstant(fields.approvedAt)
  });
  assertChargebackPostingAllocationIdentity(core);
  assertChargebackPrincipalPostingPriorAllocationRef(core);
  assertChargebackPostingAllocationAmounts(core);
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, canonicalDigest });
}

function assertLiteralFields(fields: Record<string, unknown>): void {
  if (
    fields.kind !== "chargeback_principal_posting_allocation" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.allocationStatus !== "approved"
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}

function assertCanonicalRows(
  orderId: string,
  recovery: readonly {
    componentId: string;
    allocationId: string;
    payoutAllocationId: string;
    payableLotId: string;
    originalSaleId: string;
  }[],
  platform: readonly {
    componentId: string;
    allocationId: string;
    originalJournalEntry: { transactionId: string; entryIndex: number } | null;
    originalSaleId: string;
  }[]
): void {
  if (!strictlyAscending(recovery.map((row) => row.componentId))) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  if (!strictlyAscending(platform.map((row) => row.componentId))) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const componentIds = [...recovery, ...platform].map((row) => row.componentId);
  const allocationIds = [...recovery, ...platform].map((row) => row.allocationId);
  const payoutIds = recovery.map((row) => row.payoutAllocationId);
  const payableLotIds = recovery.map((row) => row.payableLotId);
  const journalEntries = platform.flatMap((row) =>
    row.originalJournalEntry === null
      ? []
      : [`${row.originalJournalEntry.transactionId}:${row.originalJournalEntry.entryIndex}`]
  );
  if (
    new Set(componentIds).size !== componentIds.length ||
    new Set(allocationIds).size !== allocationIds.length ||
    new Set(payoutIds).size !== payoutIds.length ||
    new Set(payableLotIds).size !== payableLotIds.length ||
    [...recovery, ...platform].some((row) => row.originalSaleId !== orderId) ||
    new Set(journalEntries).size !== journalEntries.length
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}

function strictlyAscending(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] as string) < value);
}
