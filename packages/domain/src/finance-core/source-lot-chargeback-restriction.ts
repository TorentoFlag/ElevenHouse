import {
  assertFreshHistoryIdentity,
  assertPayableLotReferenceStateVersion,
  buildNextPayableLotReferenceState,
  createChargebackConfirmedAuthority,
  freezePayableLotHistoryRecord,
  freezePayableLotReferenceStateTransition,
  safeSourceKey
} from "./source-lot-integrity";
import { sameProviderAccountIdentityBinding } from "./provider-account-binding";
import { latestChargebackConfirmation } from "./source-lot-chargeback-confirmed-basis";
import { rebuildPayableLotReferenceState } from "./source-lot-reference";
import {
  type ChargebackRestriction,
  type PayableLotReferenceStateTransition
} from "./source-lot-types";
import { exactDataRecord, fail, identifier, instant } from "./source-lot-validation";
export function confirmChargebackRestriction(input: unknown): PayableLotReferenceStateTransition {
  const fields = exactDataRecord(input, [
    "state",
    "expectedVersion",
    "authority",
    "operationId",
    "sourceKey",
    "occurredAt"
  ]);
  const state = rebuildPayableLotReferenceState(fields.state);
  assertPayableLotReferenceStateVersion(state, fields.expectedVersion);
  const authority = createChargebackConfirmedAuthority(fields.authority);
  const operationId = identifier(fields.operationId);
  const sourceKey = safeSourceKey(fields.sourceKey);
  if (
    sourceKey.kind !== "chargeback" ||
    sourceKey.operation !== "confirmed" ||
    sourceKey.sourceId !== authority.confirmationId ||
    authority.confirmedAt !== instant(fields.occurredAt) ||
    authority.astrologerUserId !== state.astrologerUserId
  ) {
    fail("invalid_field");
  }
  assertFreshHistoryIdentity(state, operationId, sourceKey);
  const orderLots = state.lots.filter((lot) => lot.sourceId === authority.orderId);
  if (
    orderLots.length === 0 ||
    orderLots.some(
      (lot) =>
        lot.astrologerUserId !== authority.astrologerUserId ||
        lot.captureSource.providerAccountId !== authority.providerAccount.providerAccountId ||
        lot.captureSource.providerPaymentId !== authority.providerPaymentId ||
        lot.amount.currency !== authority.nextCumulativeDisputedAmount.currency ||
        authority.nextCumulativeDisputedAmount.amountMinor > lot.economics.gross.amountMinor
    )
  ) {
    fail("capture_correlation_mismatch");
  }
  const existing = state.chargebackRestrictions.find(
    (restriction) => restriction.chargebackCaseId === authority.chargebackCaseId
  );
  let restriction: ChargebackRestriction;
  let restrictions: readonly ChargebackRestriction[];
  if (authority.confirmationKind === "initial") {
    if (
      existing ||
      state.chargebackRestrictions.some(
        (candidate) =>
          candidate.restrictionId === authority.restrictionId ||
          (candidate.providerAccountId === authority.providerAccount.providerAccountId &&
            candidate.providerPaymentId === authority.providerPaymentId)
      )
    ) {
      fail("duplicate_operation_source");
    }
    restriction = Object.freeze({
      restrictionId: authority.restrictionId,
      version: 1,
      chargebackCaseId: authority.chargebackCaseId,
      orderId: authority.orderId,
      astrologerUserId: authority.astrologerUserId,
      providerAccountId: authority.providerAccount.providerAccountId,
      providerPaymentId: authority.providerPaymentId,
      disputedAmount: authority.nextCumulativeDisputedAmount,
      canonicalEvidenceId: authority.canonicalEvidenceId,
      status: "active",
      confirmedAt: authority.confirmedAt,
      closedAt: null
    });
    restrictions = [...state.chargebackRestrictions, restriction];
  } else {
    const priorConfirmation = latestChargebackConfirmation(state, authority.chargebackCaseId);
    if (!existing || existing.status !== "active") fail("release_blocked");
    if (
      !priorConfirmation ||
      !sameProviderAccountIdentityBinding(
        priorConfirmation.providerAccount,
        authority.providerAccount
      ) ||
      existing.restrictionId !== authority.restrictionId ||
      existing.orderId !== authority.orderId ||
      existing.astrologerUserId !== authority.astrologerUserId ||
      existing.providerAccountId !== authority.providerAccount.providerAccountId ||
      existing.providerPaymentId !== authority.providerPaymentId ||
      existing.disputedAmount.currency !== authority.priorCumulativeDisputedAmount.currency ||
      existing.disputedAmount.amountMinor !== authority.priorCumulativeDisputedAmount.amountMinor
    ) {
      fail("capture_correlation_mismatch");
    }
    if (authority.priorRestrictionVersion !== existing.version) fail("version_conflict");
    restriction = Object.freeze({
      ...existing,
      version: existing.version + 1,
      disputedAmount: authority.nextCumulativeDisputedAmount,
      canonicalEvidenceId: authority.canonicalEvidenceId
    });
    restrictions = state.chargebackRestrictions.map((candidate) =>
      candidate.restrictionId === existing.restrictionId ? restriction : candidate
    );
  }
  const record = freezePayableLotHistoryRecord({
    kind: "chargeback_confirmed",
    operationId,
    sourceKey,
    previousVersion: state.version,
    nextVersion: state.version + 1,
    occurredAt: authority.confirmedAt,
    consumedLotIds: [],
    createdLotIds: [],
    referencedLotIds: [],
    refundOrigins: [],
    chargebackAllocations: [],
    reserveAllocation: null,
    paymentIntegrity: null,
    blocks: null,
    authority
  });
  const nextState = buildNextPayableLotReferenceState(state, [], [], record, restrictions);
  return freezePayableLotReferenceStateTransition(state, nextState, [], [], record);
}
