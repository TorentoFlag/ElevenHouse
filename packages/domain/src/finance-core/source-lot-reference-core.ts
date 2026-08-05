import { Temporal } from "@js-temporal/polyfill";
import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import { serializeFinanceSourceKey, type FinanceSourceKey } from "./finance-source-key";
import {
  chargebackRestrictionArray,
  chargebackRestrictionHistoryArray,
  childLot,
  consumeLot,
  createHoldReleaseEvidence,
  createPayableLotBlockSnapshot,
  createPaymentCaptureIntegrityAuthority,
  createReserveAllocationDecision,
  freezeTransition,
  hydratePayableLotOperationAuthority,
  hydrateSelection,
  identifierArray,
  payableLotHistoryKeys,
  safeSourceKey
} from "./source-lot-codec";
import {
  allocationMatchesLot,
  assertConservation,
  assertFreshOutputIds,
  compareCodeUnits,
  scopedLots
} from "./source-lot-collection";
import {
  type ChargebackLotAllocation,
  type ChargebackRestriction,
  type ChargebackRestrictionHistoryRecord,
  type PayableLotBlockSnapshot,
  type PayableLotBucket,
  type PayableLotHistoryRecord,
  type PayableLotReferenceState,
  type PayableLotTransition,
  type PayableSourceLot,
  type PaymentCaptureIntegrityAuthority,
  type PayoutRequestLotAllocation,
  type PayoutReturnAuthority,
  type RefundLotOrigin
} from "./source-lot-types";
import {
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  instant,
  money,
  nullableIdentifier,
  positiveVersion
} from "./source-lot-validation";

export function moveSelection(input: {
  readonly lots: unknown;
  readonly selection: unknown;
  readonly expectedKind: "payout" | "refund";
  readonly targetBucket: "payout_pending" | "refund_pending";
  readonly operationId: unknown;
  readonly occurredAt: unknown;
  readonly outputLotIds: unknown;
  readonly payoutRequestId: string | null;
  readonly refundId: string | null;
  readonly payoutAllocations: readonly PayoutRequestLotAllocation[] | null;
}): PayableLotTransition {
  const selection = hydrateSelection(input.selection);
  if (selection.kind !== input.expectedKind) fail("selection_mismatch");
  const lots = scopedLots(input.lots, selection.astrologerUserId, selection.currency);
  const byId = new Map(lots.map((lot) => [lot.lotId, lot] as const));
  const operationId = identifier(input.operationId);
  const occurredAt = instant(input.occurredAt);
  const outputRows = exactDataArray(input.outputLotIds).map((value) => {
    const fields = exactDataRecord(value, ["sourceLotId", "targetLotId", "remainderLotId"]);
    return Object.freeze({
      sourceLotId: identifier(fields.sourceLotId),
      targetLotId: identifier(fields.targetLotId),
      remainderLotId: nullableIdentifier(fields.remainderLotId)
    });
  });
  if (outputRows.length !== selection.allocations.length) fail("selection_mismatch");
  if (new Set(outputRows.map((row) => row.sourceLotId)).size !== outputRows.length) {
    fail("selection_mismatch");
  }
  const outputBySource = new Map(outputRows.map((row) => [row.sourceLotId, row] as const));
  const payoutAllocationBySource = new Map(
    (input.payoutAllocations ?? []).map(
      (allocation) => [allocation.sourceLotId, allocation] as const
    )
  );
  if (
    (selection.kind === "payout") !== (input.payoutAllocations !== null) ||
    (selection.kind === "payout" &&
      (payoutAllocationBySource.size !== selection.allocations.length ||
        input.payoutAllocations?.some((allocation) =>
          lots.some((lot) => lot.payoutAllocationId === allocation.payoutAllocationId)
        )))
  ) {
    fail("selection_mismatch");
  }
  const inputIds = lots.map((lot) => lot.lotId);
  assertFreshOutputIds(
    outputRows.flatMap((row) => [row.targetLotId, row.remainderLotId]),
    inputIds
  );

  const consumed: PayableSourceLot[] = [];
  const created: PayableSourceLot[] = [];
  for (const allocation of selection.allocations) {
    const lot = byId.get(allocation.lotId);
    const output = outputBySource.get(allocation.lotId);
    const payoutAllocation = payoutAllocationBySource.get(allocation.lotId);
    if (!lot || !output || !allocationMatchesLot(allocation, lot)) fail("selection_mismatch");
    if (
      selection.kind === "payout" &&
      (!payoutAllocation ||
        payoutAllocation.payoutPendingLotId !== output.targetLotId ||
        payoutAllocation.amountMinor !== allocation.amountMinor)
    ) {
      fail("selection_mismatch");
    }
    if (lot.status !== "active") fail("lot_already_consumed");
    if (
      (selection.kind === "payout" && lot.bucket !== "available") ||
      (selection.kind === "refund" &&
        lot.bucket !== "pending" &&
        lot.bucket !== "available" &&
        lot.bucket !== "reserved")
    ) {
      fail("lot_bucket_ineligible");
    }
    if (allocation.amountMinor > lot.amount.amountMinor) fail("conservation_violation");
    const remainder = lot.amount.amountMinor - allocation.amountMinor;
    if ((remainder === 0) !== (output.remainderLotId === null)) fail("lineage_invalid");

    consumed.push(consumeLot(lot, operationId, occurredAt));
    created.push(
      childLot({
        parent: lot,
        lotId: output.targetLotId,
        amountMinor: allocation.amountMinor,
        bucket: input.targetBucket,
        operationId,
        createdAt: occurredAt,
        becameAvailableAt: lot.becameAvailableAt,
        payoutRequestId: input.payoutRequestId,
        payoutAllocationId: payoutAllocation?.payoutAllocationId,
        refundId: input.refundId
      })
    );
    if (remainder > 0 && output.remainderLotId) {
      created.push(
        childLot({
          parent: lot,
          lotId: output.remainderLotId,
          amountMinor: remainder,
          bucket: lot.bucket,
          operationId,
          createdAt: occurredAt,
          becameAvailableAt: lot.becameAvailableAt,
          payoutRequestId: lot.payoutRequestId,
          refundId: lot.refundId
        })
      );
    }
  }
  assertConservation(
    selection.allocations.map((allocation) => {
      const lot = byId.get(allocation.lotId);
      if (!lot) fail("selection_mismatch");
      return lot;
    }),
    created
  );
  return freezeTransition(operationId, consumed, created);
}

export function payableLotHistoryArray(value: unknown): readonly PayableLotHistoryRecord[] {
  return Object.freeze(
    exactDataArray(value).map((entry) => {
      const fields = exactDataRecord(entry, payableLotHistoryKeys);
      if (
        fields.kind !== "sale_capture" &&
        fields.kind !== "hold_release" &&
        fields.kind !== "reserve_release" &&
        fields.kind !== "payout_requested" &&
        fields.kind !== "payout_released" &&
        fields.kind !== "payout_paid" &&
        fields.kind !== "payout_returned_reserved" &&
        fields.kind !== "refund_approved" &&
        fields.kind !== "refund_confirmed" &&
        fields.kind !== "refund_failed" &&
        fields.kind !== "refund_bridge_payout_failed" &&
        fields.kind !== "chargeback_confirmed" &&
        fields.kind !== "chargeback_principal_allocated" &&
        fields.kind !== "chargeback_recovery_collected" &&
        fields.kind !== "chargeback_won_reserved"
      ) {
        fail("invalid_field");
      }
      const reserveAllocation =
        fields.reserveAllocation === null
          ? null
          : createReserveAllocationDecision(fields.reserveAllocation);
      const paymentIntegrity =
        fields.paymentIntegrity === null
          ? null
          : createPaymentCaptureIntegrityAuthority(fields.paymentIntegrity);
      const blocks = fields.blocks === null ? null : createPayableLotBlockSnapshot(fields.blocks);
      const holdReleaseEvidence =
        fields.holdReleaseEvidence === null
          ? null
          : createHoldReleaseEvidence(fields.holdReleaseEvidence);
      const authority =
        fields.authority === null ? null : hydratePayableLotOperationAuthority(fields.authority);
      return freezePayableLotHistoryRecord({
        kind: fields.kind,
        operationId: identifier(fields.operationId),
        sourceKey: safeSourceKey(fields.sourceKey),
        previousVersion: positiveVersion(fields.previousVersion, "invalid_field"),
        nextVersion: positiveVersion(fields.nextVersion, "invalid_field"),
        occurredAt: instant(fields.occurredAt),
        consumedLotIds: identifierArray(fields.consumedLotIds),
        createdLotIds: identifierArray(fields.createdLotIds),
        referencedLotIds: identifierArray(fields.referencedLotIds),
        refundOrigins: refundLotOriginArray(fields.refundOrigins),
        chargebackAllocations: chargebackLotAllocationArray(fields.chargebackAllocations),
        reserveAllocation,
        paymentIntegrity,
        blocks,
        holdReleaseEvidence,
        authority
      });
    })
  );
}

export function refundLotOriginArray(value: unknown): readonly RefundLotOrigin[] {
  const origins = exactDataArray(value).map((entry) => {
    const fields = exactDataRecord(entry, [
      "refundPendingLotId",
      "sourceLotId",
      "rootLotId",
      "originalBucket",
      "amountMinor",
      "becameAvailableAt"
    ]);
    if (
      fields.originalBucket !== "pending" &&
      fields.originalBucket !== "available" &&
      fields.originalBucket !== "reserved"
    ) {
      fail("invalid_field");
    }
    const becameAvailableAt =
      fields.becameAvailableAt === null ? null : instant(fields.becameAvailableAt);
    if ((fields.originalBucket === "available") !== (becameAvailableAt !== null)) {
      fail("invalid_field");
    }
    const amount = money(
      { amountMinor: fields.amountMinor, currency: "RUB" },
      true,
      "invalid_field"
    );
    return Object.freeze({
      refundPendingLotId: identifier(fields.refundPendingLotId),
      sourceLotId: identifier(fields.sourceLotId),
      rootLotId: identifier(fields.rootLotId),
      originalBucket: fields.originalBucket,
      amountMinor: amount.amountMinor,
      becameAvailableAt
    });
  });
  if (
    new Set(origins.map((origin) => origin.refundPendingLotId)).size !== origins.length ||
    new Set(origins.map((origin) => origin.sourceLotId)).size !== origins.length
  ) {
    fail("lineage_invalid");
  }
  return Object.freeze(origins);
}

export function chargebackLotAllocationArray(value: unknown): readonly ChargebackLotAllocation[] {
  const allocations = exactDataArray(value).map((entry) => {
    const fields = exactDataRecord(entry, [
      "sourceLotId",
      "rootLotId",
      "originalBucket",
      "allocatedAmountMinor",
      "remainderLotId"
    ]);
    if (
      fields.originalBucket !== "pending" &&
      fields.originalBucket !== "available" &&
      fields.originalBucket !== "reserved"
    ) {
      fail("invalid_field");
    }
    const amount = money(
      { amountMinor: fields.allocatedAmountMinor, currency: "RUB" },
      true,
      "invalid_field"
    );
    return Object.freeze({
      sourceLotId: identifier(fields.sourceLotId),
      rootLotId: identifier(fields.rootLotId),
      originalBucket: fields.originalBucket,
      allocatedAmountMinor: amount.amountMinor,
      remainderLotId: nullableIdentifier(fields.remainderLotId)
    });
  });
  if (
    new Set(allocations.map((allocation) => allocation.sourceLotId)).size !== allocations.length
  ) {
    fail("lineage_invalid");
  }
  return Object.freeze(allocations);
}

export function exactActiveLots(
  state: PayableLotReferenceState,
  lotIds: readonly string[],
  bucket: PayableLotBucket,
  payoutRequestId: string | null
): readonly PayableSourceLot[] {
  return Object.freeze(
    lotIds.map((lotId) => {
      const lot = state.lots.find((candidate) => candidate.lotId === lotId);
      if (!lot) return fail("selection_mismatch");
      if (lot.status !== "active") return fail("lot_already_consumed");
      if (lot.bucket !== bucket || lot.payoutRequestId !== payoutRequestId) {
        return fail("lot_bucket_ineligible");
      }
      return lot;
    })
  );
}

export function allActivePayoutLots(
  state: PayableLotReferenceState,
  payoutRequestId: string
): readonly PayableSourceLot[] {
  const lots = state.lots.filter(
    (lot) =>
      lot.status === "active" &&
      lot.bucket === "payout_pending" &&
      lot.payoutRequestId === payoutRequestId
  );
  if (lots.length === 0) fail("selection_mismatch");
  return Object.freeze([...lots].sort((left, right) => compareCodeUnits(left.lotId, right.lotId)));
}

export function exactWholeLotOutputRows(
  value: unknown,
  sourceLotIds: readonly string[],
  existingLots: readonly PayableSourceLot[]
): ReadonlyMap<string, string> {
  const rows = exactDataArray(value).map((entry) => {
    const fields = exactDataRecord(entry, ["sourceLotId", "targetLotId"]);
    return Object.freeze({
      sourceLotId: identifier(fields.sourceLotId),
      targetLotId: identifier(fields.targetLotId)
    });
  });
  if (
    rows.length !== sourceLotIds.length ||
    new Set(rows.map((row) => row.sourceLotId)).size !== rows.length ||
    !sameIdentifierSet(
      rows.map((row) => row.sourceLotId),
      sourceLotIds
    )
  ) {
    fail("selection_mismatch");
  }
  assertFreshOutputIds(
    rows.map((row) => row.targetLotId),
    existingLots.map((lot) => lot.lotId)
  );
  return new Map(rows.map((row) => [row.sourceLotId, row.targetLotId] as const));
}

export function assertClearCurrentBlocks(
  blocks: PayableLotBlockSnapshot,
  occurredAt: string
): void {
  if (blocks.evaluatedAt !== occurredAt) fail("release_blocked");
  if (blocks.refund || blocks.chargeback || blocks.reconciliation || blocks.manualRisk) {
    fail("release_blocked");
  }
}

export function assertPayoutReturnSource(
  authority: PayoutReturnAuthority,
  sourceKey: FinanceSourceKey
): void {
  if (authority.outcome === "returned_without_debit") {
    if (
      sourceKey.kind !== "payout" ||
      sourceKey.operation !== "returned_without_debit" ||
      sourceKey.sourceId !== authority.payoutRequestId
    ) {
      fail("invalid_field");
    }
    return;
  }
  if (authority.bankCreditEvidencePath === "unknown_credit_reclassification") {
    if (
      sourceKey.kind !== "bank" ||
      sourceKey.operation !== "suspense_reclassified" ||
      sourceKey.sourceId !== authority.bankStatementEntryId
    ) {
      fail("invalid_field");
    }
    return;
  }
  if (
    authority.bankCreditEvidencePath !== "direct_match" ||
    sourceKey.kind !== "bank" ||
    sourceKey.operation !== "payout_return_credit_matched" ||
    sourceKey.sourceId !== authority.bankStatementEntryId
  ) {
    fail("invalid_field");
  }
}

export function freezePayableLotHistoryRecord(
  input: Omit<PayableLotHistoryRecord, "holdReleaseEvidence"> &
    Partial<Pick<PayableLotHistoryRecord, "holdReleaseEvidence">>
): PayableLotHistoryRecord {
  return Object.freeze({
    kind: input.kind,
    operationId: input.operationId,
    sourceKey: safeSourceKey(input.sourceKey),
    previousVersion: input.previousVersion,
    nextVersion: input.nextVersion,
    occurredAt: input.occurredAt,
    consumedLotIds: Object.freeze([...input.consumedLotIds]),
    createdLotIds: Object.freeze([...input.createdLotIds]),
    referencedLotIds: Object.freeze([...input.referencedLotIds]),
    refundOrigins: Object.freeze(input.refundOrigins.map((origin) => Object.freeze({ ...origin }))),
    chargebackAllocations: Object.freeze(
      input.chargebackAllocations.map((allocation) => Object.freeze({ ...allocation }))
    ),
    reserveAllocation: input.reserveAllocation,
    paymentIntegrity: input.paymentIntegrity,
    blocks: input.blocks,
    holdReleaseEvidence: input.holdReleaseEvidence ?? null,
    authority: input.authority
  });
}

export function freezePayableLotReferenceState(input: {
  readonly version: number;
  readonly astrologerUserId: string;
  readonly currency: "RUB";
  readonly lots: readonly PayableSourceLot[];
  readonly history: readonly PayableLotHistoryRecord[];
  readonly chargebackRestrictions: readonly ChargebackRestriction[];
  readonly restrictionHistory: readonly ChargebackRestrictionHistoryRecord[];
}): PayableLotReferenceState {
  const lots = Object.freeze([...input.lots]);
  const history = Object.freeze(input.history.map(freezePayableLotHistoryRecord));
  const chargebackRestrictions = chargebackRestrictionArray(input.chargebackRestrictions);
  const restrictionHistory = chargebackRestrictionHistoryArray(input.restrictionHistory);
  const stateDigest = payableLotReferenceStateDigest({
    version: input.version,
    astrologerUserId: input.astrologerUserId,
    currency: input.currency,
    lots,
    history,
    chargebackRestrictions,
    restrictionHistory
  });
  return Object.freeze({
    version: input.version,
    astrologerUserId: input.astrologerUserId,
    currency: input.currency,
    lots,
    history,
    chargebackRestrictions,
    restrictionHistory,
    stateDigest
  });
}

export function payableLotReferenceStateDigest(input: {
  readonly version: number;
  readonly astrologerUserId: string;
  readonly currency: "RUB";
  readonly lots: readonly PayableSourceLot[];
  readonly history: readonly PayableLotHistoryRecord[];
  readonly chargebackRestrictions: readonly ChargebackRestriction[];
  readonly restrictionHistory: readonly ChargebackRestrictionHistoryRecord[];
}): string {
  return digestFinanceCanonicalValueV1([
    input.version,
    input.astrologerUserId,
    input.currency,
    input.lots,
    input.chargebackRestrictions,
    input.restrictionHistory,
    input.history.map((record) => [
      record.kind,
      record.operationId,
      serializeFinanceSourceKey(record.sourceKey),
      record.previousVersion,
      record.nextVersion,
      record.occurredAt,
      record.consumedLotIds,
      record.createdLotIds,
      record.referencedLotIds,
      record.refundOrigins,
      record.chargebackAllocations,
      record.reserveAllocation,
      record.paymentIntegrity,
      record.blocks,
      record.holdReleaseEvidence,
      record.authority
    ])
  ]);
}

export function assertPayableLotReferenceStateVersion(
  state: PayableLotReferenceState,
  expectedVersion: unknown
): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== state.version) {
    fail("version_conflict");
  }
}

export function assertFreshHistoryIdentity(
  state: PayableLotReferenceState,
  operationId: string,
  sourceKey: FinanceSourceKey
): void {
  const serialized = serializeFinanceSourceKey(sourceKey);
  if (
    state.history.some(
      (record) =>
        record.operationId === operationId ||
        serializeFinanceSourceKey(record.sourceKey) === serialized
    )
  ) {
    fail("duplicate_operation_source");
  }
}

export function assertCurrentPaymentIntegrity(
  authority: PaymentCaptureIntegrityAuthority,
  lot: PayableSourceLot,
  evaluatedAtValue: unknown
): void {
  if (authority.status !== "capture_clear") fail("authoritative_capture_required");
  if (
    authority.intentId !== lot.captureSource.intentId ||
    authority.intentVersion !== lot.captureSource.paymentIntent.version ||
    authority.providerAccountId !== lot.captureSource.providerAccountId ||
    authority.providerPaymentId !== lot.captureSource.providerPaymentId ||
    authority.canonicalEvidenceId !== lot.captureSource.canonicalEvidenceId
  ) {
    fail("capture_correlation_mismatch");
  }
  const evaluatedAt = instant(evaluatedAtValue);
  if (
    Temporal.Instant.compare(authority.evaluatedAt, lot.capturedAt) < 0 ||
    authority.evaluatedAt !== evaluatedAt
  ) {
    fail("authoritative_capture_required");
  }
}

export function lotDescendsFromMap(
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  lot: PayableSourceLot,
  ancestorLotId: string
): boolean {
  const seen = new Set<string>();
  let cursor: PayableSourceLot | undefined = lot;
  while (cursor) {
    if (cursor.lotId === ancestorLotId) return true;
    if (seen.has(cursor.lotId)) fail("lineage_invalid");
    seen.add(cursor.lotId);
    cursor = cursor.parentLotId === null ? undefined : lotsById.get(cursor.parentLotId);
  }
  return false;
}

export function lotDescendsFromAny(
  lotsById: ReadonlyMap<string, PayableSourceLot>,
  lot: PayableSourceLot,
  ancestorLotIds: readonly string[]
): boolean {
  return ancestorLotIds.some((ancestorLotId) => lotDescendsFromMap(lotsById, lot, ancestorLotId));
}

export function assertNoAuxiliaryLotMetadata(
  record: PayableLotHistoryRecord,
  options: Readonly<{ refundOrigins?: boolean; chargebackAllocations?: boolean }> = {}
): void {
  if (
    (!options.refundOrigins && record.refundOrigins.length !== 0) ||
    (!options.chargebackAllocations && record.chargebackAllocations.length !== 0) ||
    record.reserveAllocation !== null ||
    record.paymentIntegrity !== null ||
    record.blocks !== null ||
    record.holdReleaseEvidence !== null
  ) {
    fail("lineage_invalid");
  }
}

export function assertInheritedLotIdentity(
  parent: PayableSourceLot,
  child: PayableSourceLot
): void {
  if (
    child.parentLotId !== parent.lotId ||
    child.rootLotId !== parent.rootLotId ||
    child.lineageDepth !== parent.lineageDepth + 1 ||
    child.sourceId !== parent.sourceId ||
    child.astrologerUserId !== parent.astrologerUserId ||
    child.capturedAt !== parent.capturedAt ||
    child.amount.currency !== parent.amount.currency ||
    JSON.stringify(child.economics) !== JSON.stringify(parent.economics) ||
    JSON.stringify(child.riskPolicy) !== JSON.stringify(parent.riskPolicy) ||
    JSON.stringify(child.fulfillment) !== JSON.stringify(parent.fulfillment) ||
    JSON.stringify(child.captureSource) !== JSON.stringify(parent.captureSource)
  ) {
    fail("lineage_invalid");
  }
}

export function sameIdentifierSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const freezePayableLotState = freezePayableLotReferenceState;
/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const payableLotStateDigest = payableLotReferenceStateDigest;
/** @deprecated Reference/rebuild oracle; forbidden for online mutation. */
export const assertStateVersion = assertPayableLotReferenceStateVersion;
