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
  readRecoveryAllocationRef,
  readRecoveryExposure,
  readRecoveryOutcomeRef,
  readRecoveryPriorRef,
  readRecoveryProviderRef
} from "./chargeback-recovery-posting-authority-rows";
import { readChargebackRecoveryCollectionRow } from "./chargeback-recovery-posting-collection-row";
import { readChargebackRecoveryTranche } from "./chargeback-recovery-posting-tranche";
import type { ChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-types";

export function readChargebackRecoveryPostingAllocationAuthority(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): ChargebackRecoveryPostingAllocationAuthority {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
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
    "latestProviderBindingRef",
    "allocationRefs",
    "priorAuthorityRef",
    "latestOutcomeEvidenceRef",
    "operationReceiptId",
    "operationReceiptDigest",
    "componentBindingsDigest",
    "collectionTotal",
    "exposures",
    "tranches",
    "collectionRows",
    "collectedAt",
    "canonicalDigest"
  ]);
  if (
    fields.kind !== "chargeback_recovery_posting_allocation" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  )
    mismatch();
  const source = readChargebackSourceAuthority(fields.sourceAuthority, envelope);
  if (source.authority.kind !== "chargeback_recovery_collection") mismatch();
  const refs = Object.freeze(
    readExactDataArray(fields.allocationRefs, 1, envelope.maxAllocations).map(
      readRecoveryAllocationRef
    )
  );
  const exposures = Object.freeze(
    readExactDataArray(fields.exposures, 1, envelope.maxAllocations).map(readRecoveryExposure)
  );
  const collectionRows = Object.freeze(
    readExactDataArray(fields.collectionRows, 1, envelope.maxAllocations).map(
      readChargebackRecoveryCollectionRow
    )
  );
  const tranches = Object.freeze(
    readExactDataArray(fields.tranches, 1, envelope.maxAllocations).map((value) =>
      readChargebackRecoveryTranche(value, envelope)
    )
  );
  const core = Object.freeze({
    kind: "chargeback_recovery_posting_allocation" as const,
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
    sourceAuthority: source.authority,
    sourceAuthorityDigest: readFinancePostingDigest(fields.sourceAuthorityDigest),
    latestProviderBindingRef: readRecoveryProviderRef(fields.latestProviderBindingRef),
    allocationRefs: refs,
    priorAuthorityRef: readRecoveryPriorRef(fields.priorAuthorityRef),
    latestOutcomeEvidenceRef: readRecoveryOutcomeRef(fields.latestOutcomeEvidenceRef),
    operationReceiptId: readFinancePostingIdentifier(fields.operationReceiptId),
    operationReceiptDigest: readFinancePostingDigest(fields.operationReceiptDigest),
    componentBindingsDigest: readFinancePostingDigest(fields.componentBindingsDigest),
    collectionTotal: readChargebackUnsignedMoney(fields.collectionTotal),
    exposures,
    tranches,
    collectionRows,
    collectedAt: readFinancePostingInstant(fields.collectedAt)
  });
  assertCore(core, source.canonicalDigest);
  const canonicalDigest = readFinancePostingDigest(fields.canonicalDigest);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) evidenceMismatch();
  return Object.freeze({ ...core, canonicalDigest });
}

function assertCore(
  authority: Omit<ChargebackRecoveryPostingAllocationAuthority, "canonicalDigest">,
  sourceDigest: string
): void {
  const source = authority.sourceAuthority;
  const latest = authority.allocationRefs.at(-1);
  if (
    !latest ||
    authority.authorityId !== source.recoveryCollectionId ||
    authority.chargebackCaseId !== source.chargebackCaseId ||
    authority.astrologerUserId !== source.astrologerUserId ||
    authority.collectedAt !== source.collectedAt ||
    authority.sourceAuthorityDigest !== sourceDigest
  )
    mismatch();
  if (
    !strictlyAscending(authority.allocationRefs.map((ref) => ref.version)) ||
    !strictlyAscending(authority.exposures.map((row) => row.exposureId)) ||
    !canonicalTranches(authority.tranches) ||
    !strictlyAscending(authority.collectionRows.map((row) => row.receiptPayableEffectId)) ||
    new Set(authority.exposures.map((row) => row.exposureId)).size !== authority.exposures.length
  )
    mismatch();
  const effectIds = authority.collectionRows.flatMap((row) => [
    row.receiptPayableEffectId,
    row.receiptRecoveryEffectId
  ]);
  if (
    new Set(effectIds).size !== effectIds.length ||
    new Set(
      authority.tranches.map(
        (row) => `${row.accountingAllocationRevisionId}\u0000${row.exposureId}`
      )
    ).size !== authority.tranches.length ||
    new Set(
      authority.tranches.map(
        (row) =>
          `${row.originalJournalEntry.transactionId}\u0000${row.originalJournalEntry.entryIndex}`
      )
    ).size !== authority.tranches.length ||
    authority.tranches.some(
      (row) =>
        row.amount.amountMinor === 0 ||
        !authority.exposures.some((exposure) => exposure.exposureId === row.exposureId)
    ) ||
    authority.collectionRows.some(
      (row) =>
        row.amount.amountMinor === 0 ||
        !authority.exposures.some((exposure) => exposure.exposureId === row.exposureId)
    )
  ) {
    mismatch();
  }
  let delta = 0n;
  for (const row of authority.exposures) {
    const prior = BigInt(row.priorCollectedAmount.amountMinor);
    const change = BigInt(row.collectionDelta.amountMinor);
    const next = BigInt(row.nextCollectedAmount.amountMinor);
    const capacity = BigInt(row.sourceCapacity.amountMinor);
    const allocated = BigInt(row.allocatedAmount.amountMinor);
    const allocatedByTranches = authority.tranches
      .filter((tranche) => tranche.exposureId === row.exposureId)
      .reduce((sum, tranche) => sum + BigInt(tranche.amount.amountMinor), 0n);
    const collectedByRows = authority.collectionRows
      .filter((collection) => collection.exposureId === row.exposureId)
      .reduce((sum, collection) => sum + BigInt(collection.amount.amountMinor), 0n);
    if (
      prior + change !== next ||
      allocated === 0n ||
      allocated !== allocatedByTranches ||
      allocated > capacity ||
      next > allocated ||
      change !== collectedByRows
    ) {
      throw new FinancePostingIntegrityError("amount_mismatch");
    }
    delta += change;
  }
  if (
    delta === 0n ||
    delta !== BigInt(authority.collectionTotal.amountMinor) ||
    delta !== BigInt(source.collectedPayableAmount.amountMinor)
  ) {
    throw new FinancePostingIntegrityError("amount_mismatch");
  }
}

const strictlyAscending = (values: readonly (string | number)[]) =>
  values.every((value, index) => index === 0 || (values[index - 1] as string | number) < value);
const canonicalTranches = (rows: ChargebackRecoveryPostingAllocationAuthority["tranches"]) =>
  rows.every((row, index) => {
    const previous = rows[index - 1];
    return (
      !previous ||
      previous.allocationAuthorityVersion < row.allocationAuthorityVersion ||
      (previous.allocationAuthorityVersion === row.allocationAuthorityVersion &&
        previous.exposureId < row.exposureId)
    );
  });
function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
function evidenceMismatch(): never {
  throw new FinancePostingIntegrityError("evidence_mismatch");
}
