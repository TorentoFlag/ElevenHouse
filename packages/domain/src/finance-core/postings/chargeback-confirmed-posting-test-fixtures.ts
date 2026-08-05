import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { confirmChargebackRestriction, createChargebackConfirmedAuthority } from "../source-lots";
import { chargebackRestrictedState } from "../source-lot-reference-test-fixtures";
import { sha } from "./posting-test-primitives";

export const receiptDecoderEnvelope = Object.freeze({
  maxAuthorityRefs: 8,
  maxEffects: 16,
  maxLineage: 32,
  maxComponentSlots: 16,
  maxDecimalDigits: 40
});

export function chargebackConfirmedPostingFixture() {
  const { authority, restricted } = chargebackRestrictedState();
  return fixtureFromTransition(authority, restricted, "1");
}

export function chargebackCumulativeUpdatePostingFixture() {
  const initial = chargebackRestrictedState();
  const authority = createChargebackConfirmedAuthority({
    kind: "chargeback_confirmed",
    authorityId: "chargeback-confirmed-authority-2",
    version: 2,
    confirmationId: "chargeback-confirmation-2",
    restrictionId: initial.authority.restrictionId,
    confirmationKind: "cumulative_update",
    amountBasis: "cumulative",
    priorRestrictionVersion: 1,
    chargebackCaseId: initial.authority.chargebackCaseId,
    orderId: initial.authority.orderId,
    astrologerUserId: initial.authority.astrologerUserId,
    providerAccount: initial.authority.providerAccount,
    providerPaymentId: initial.authority.providerPaymentId,
    priorCumulativeDisputedAmount: initial.authority.nextCumulativeDisputedAmount,
    nextCumulativeDisputedAmount: { amountMinor: 5_500, currency: "RUB" },
    disputedDelta: { amountMinor: 500, currency: "RUB" },
    canonicalEvidenceId: "chargeback-confirmed-evidence-2",
    confirmedAt: "2026-08-04T01:00:00Z"
  });
  const transition = confirmChargebackRestriction({
    state: initial.restricted.state,
    expectedVersion: initial.restricted.nextVersion,
    authority,
    operationId: "chargeback-confirmed-2",
    sourceKey: {
      kind: "chargeback",
      sourceId: authority.confirmationId,
      operation: "confirmed"
    },
    occurredAt: authority.confirmedAt
  });
  return fixtureFromTransition(authority, transition, "2");
}

function fixtureFromTransition(
  authority: ReturnType<typeof createChargebackConfirmedAuthority>,
  transition: Parameters<typeof createPayableLotOperationReceipt>[0],
  suffix: string
) {
  const operationReceipt = createPayableLotOperationReceipt(transition);
  const providerEvidenceCore = Object.freeze({
    kind: "arc_payment_chargeback" as const,
    evidenceId: authority.canonicalEvidenceId,
    providerAccountId: authority.providerAccount.providerAccountId,
    providerPaymentId: authority.providerPaymentId,
    amount: authority.disputedDelta,
    observedAt: authority.confirmedAt
  });
  const providerEvidence = Object.freeze({
    kind: providerEvidenceCore.kind,
    evidenceId: providerEvidenceCore.evidenceId,
    canonicalDigest: hashFinanceCommandPayload(providerEvidenceCore),
    providerAccountId: providerEvidenceCore.providerAccountId,
    providerPaymentId: providerEvidenceCore.providerPaymentId,
    amount: providerEvidenceCore.amount,
    observedAt: providerEvidenceCore.observedAt
  });
  const bindingCore = Object.freeze({
    kind: "unverified_chargeback_provider_evidence_binding" as const,
    schemaVersion: 1 as const,
    bindingId: authority.confirmationId,
    version: authority.version,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    principalComponentId: "component-chargeback-principal",
    componentRegistryAuthorityRef: Object.freeze({
      kind: "finance_component_registry" as const,
      authorityId: "component-registry-chargeback-principal",
      version: 1,
      canonicalDigest: sha("a")
    }),
    sourceAuthority: authority,
    sourceAuthorityDigest: hashFinanceCommandPayload(authority),
    operationReceiptId: operationReceipt.receiptId,
    operationReceiptDigest: operationReceipt.canonicalDigest,
    providerEvidence
  });
  const providerEvidenceBinding = Object.freeze({
    ...bindingCore,
    bindingDigest: hashFinanceCommandPayload(bindingCore)
  });
  const operationSnapshotRef = Object.freeze({
    snapshotId: `wallet-snapshot-chargeback-confirmed-${suffix}`,
    operationId: operationReceipt.operationId,
    sourceKey: operationReceipt.sourceKey,
    previousWalletRevision: "40",
    nextWalletRevision: "41",
    previousLotStateDigest: operationReceipt.previousLotState.digest,
    nextLotStateDigest: operationReceipt.nextLotState.digest,
    historyRecordDigest: operationReceipt.historyRecord.canonicalDigest,
    snapshotDigest: sha("b")
  });
  const context = Object.freeze({
    journalTransactionId: `journal-chargeback-confirmed-${suffix}`,
    linkProofId: `proof-chargeback-confirmed-${suffix}`,
    operationId: operationReceipt.operationId,
    sourceKey: operationReceipt.sourceKey,
    occurredAt: operationReceipt.occurredAt,
    postedAt: suffix === "1" ? "2026-08-04T00:00:01Z" : "2026-08-04T01:00:01Z"
  });
  return Object.freeze({
    context,
    providerEvidenceBinding,
    operationReceipt,
    operationSnapshotRef,
    componentBindings: Object.freeze([])
  });
}

export function rehashChargebackProviderBinding(input: Record<string, unknown>) {
  const core = { ...input };
  delete core.bindingDigest;
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}
