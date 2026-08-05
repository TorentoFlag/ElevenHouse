import { sameCanonicalValue } from "./source-lot-operation-receipt-core";
import {
  canonicalBoundedTransition,
  payableLotReceiptTransitionKeys,
  type BoundedTransitionEvidence
} from "./source-lot-operation-receipt-evidence";
import { createReceiptFromEvidence } from "./source-lot-operation-receipt-projection";
import type { PayableLotOperationReceipt } from "./source-lot-operation-receipt-types";
import { buildNextPayableLotReferenceState, consumeLot } from "./source-lot-integrity";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import type {
  ChargebackConfirmedAuthority,
  ChargebackRestriction,
  ChargebackWonAuthority,
  PayableLotHistoryRecord,
  PayableLotReferenceState
} from "./source-lot-types";
import { exactDataRecord, fail } from "./source-lot-validation";

export function rebuildPayableLotOperationReceipt(input: unknown): PayableLotOperationReceipt {
  const fields = exactDataRecord(input, ["previousState", "transition"]);
  const previousState = rebuildPayableLotReferenceState(fields.previousState);
  const transitionFields = exactDataRecord(fields.transition, payableLotReceiptTransitionKeys);
  const nextState = rebuildPayableLotReferenceState(transitionFields.state);
  const evidence = canonicalBoundedTransition(fields.transition);

  if (
    evidence.previousVersion !== previousState.version ||
    evidence.previousStateDigest !== previousState.stateDigest ||
    evidence.nextVersion !== nextState.version ||
    evidence.nextStateDigest !== nextState.stateDigest ||
    previousState.astrologerUserId !== nextState.astrologerUserId ||
    previousState.currency !== nextState.currency
  ) {
    fail("state_digest_mismatch");
  }

  assertConsumedLotsAreExact(previousState, evidence);
  const expectedRestrictions = deriveNextRestrictions(previousState, evidence.historyRecord);
  const expectedState = buildNextPayableLotReferenceState(
    previousState,
    evidence.consumedLots,
    evidence.createdLots,
    evidence.historyRecord,
    expectedRestrictions
  );
  if (!sameCanonicalValue(expectedState, nextState)) fail("lineage_invalid");

  return createReceiptFromEvidence(evidence);
}

function assertConsumedLotsAreExact(
  previousState: PayableLotReferenceState,
  evidence: BoundedTransitionEvidence
): void {
  for (const consumed of evidence.consumedLots) {
    const prior = previousState.lots.find((lot) => lot.lotId === consumed.lotId);
    if (!prior || prior.status !== "active") fail("lineage_invalid");
    const expected = consumeLot(prior, evidence.operationId, evidence.historyRecord.occurredAt);
    if (!sameCanonicalValue(expected, consumed)) fail("lineage_invalid");
  }
  if (
    evidence.createdLots.some((created) =>
      previousState.lots.some((prior) => prior.lotId === created.lotId)
    )
  ) {
    fail("duplicate_lot_id");
  }
}

function deriveNextRestrictions(
  previousState: PayableLotReferenceState,
  record: PayableLotHistoryRecord
): readonly ChargebackRestriction[] {
  if (record.kind === "chargeback_confirmed") {
    if (record.authority?.kind !== "chargeback_confirmed") fail("lineage_invalid");
    return deriveConfirmedRestrictions(previousState, record.authority);
  }
  if (record.kind === "chargeback_won_reserved") {
    if (record.authority?.kind !== "chargeback_won") fail("lineage_invalid");
    return deriveWonRestrictions(previousState, record.authority);
  }
  return previousState.chargebackRestrictions;
}

function deriveConfirmedRestrictions(
  state: PayableLotReferenceState,
  authority: ChargebackConfirmedAuthority
): readonly ChargebackRestriction[] {
  const existing = state.chargebackRestrictions.find(
    (restriction) => restriction.chargebackCaseId === authority.chargebackCaseId
  );
  if (authority.confirmationKind === "initial") {
    if (existing) fail("lineage_invalid");
    return Object.freeze([
      ...state.chargebackRestrictions,
      Object.freeze({
        restrictionId: authority.restrictionId,
        version: 1,
        chargebackCaseId: authority.chargebackCaseId,
        orderId: authority.orderId,
        astrologerUserId: authority.astrologerUserId,
        providerAccountId: authority.providerAccount.providerAccountId,
        providerPaymentId: authority.providerPaymentId,
        disputedAmount: authority.nextCumulativeDisputedAmount,
        canonicalEvidenceId: authority.canonicalEvidenceId,
        status: "active" as const,
        confirmedAt: authority.confirmedAt,
        closedAt: null
      })
    ]);
  }
  if (!existing || authority.priorRestrictionVersion !== existing.version) {
    fail("lineage_invalid");
  }
  return Object.freeze(
    state.chargebackRestrictions.map((restriction) =>
      restriction.chargebackCaseId === authority.chargebackCaseId
        ? Object.freeze({
            ...restriction,
            version: restriction.version + 1,
            disputedAmount: authority.nextCumulativeDisputedAmount,
            canonicalEvidenceId: authority.canonicalEvidenceId
          })
        : restriction
    )
  );
}

function deriveWonRestrictions(
  state: PayableLotReferenceState,
  authority: ChargebackWonAuthority
): readonly ChargebackRestriction[] {
  const existing = state.chargebackRestrictions.find(
    (restriction) => restriction.chargebackCaseId === authority.chargebackCaseId
  );
  if (!existing || existing.status !== "active") fail("lineage_invalid");
  return Object.freeze(
    state.chargebackRestrictions.map((restriction) =>
      restriction.chargebackCaseId === authority.chargebackCaseId
        ? Object.freeze({
            ...restriction,
            version: restriction.version + 1,
            status: "closed_won" as const,
            canonicalEvidenceId: authority.canonicalEvidenceId,
            closedAt: authority.wonAt
          })
        : restriction
    )
  );
}
