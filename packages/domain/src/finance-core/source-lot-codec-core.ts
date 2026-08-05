import { Temporal } from "@js-temporal/polyfill";
import { createFinanceSourceKey, type FinanceSourceKey } from "./finance-source-key";
import {
  type PayableLotAllocation,
  type PayableLotBucket,
  type PayableLotCaptureSource,
  type PayableLotReferenceState,
  type PayableLotSelection,
  type PayableLotTransition,
  type PayableSourceLot
} from "./source-lot-types";
import { exactDataArray, fail, identifier } from "./source-lot-validation";

export function freezeCaptureSource(input: PayableLotCaptureSource): PayableLotCaptureSource {
  return Object.freeze({
    intentId: input.intentId,
    providerAccountId: input.providerAccountId,
    providerPaymentId: input.providerPaymentId,
    canonicalEvidenceId: input.canonicalEvidenceId,
    paymentIntent: input.paymentIntent,
    sourceKey: input.sourceKey
  });
}

export function childLot(input: {
  readonly parent: PayableSourceLot;
  readonly lotId: string;
  readonly amountMinor: number;
  readonly bucket: PayableLotBucket;
  readonly operationId: string;
  readonly createdAt: string;
  readonly becameAvailableAt: string | null;
  readonly payoutRequestId: string | null;
  readonly payoutAllocationId?: string | null;
  readonly refundId: string | null;
}): PayableSourceLot {
  return freezeLot({
    ...input.parent,
    lotId: input.lotId,
    rootLotId: input.parent.rootLotId,
    parentLotId: input.parent.lotId,
    lineageDepth: input.parent.lineageDepth + 1,
    amount: Object.freeze({ amountMinor: input.amountMinor, currency: "RUB" }),
    bucket: input.bucket,
    status: "active",
    createdAt: input.createdAt,
    becameAvailableAt: input.becameAvailableAt,
    createdByOperationId: input.operationId,
    consumedByOperationId: null,
    consumedAt: null,
    payoutRequestId: input.payoutRequestId,
    payoutAllocationId: input.payoutAllocationId ?? input.parent.payoutAllocationId,
    refundId: input.refundId
  });
}

export function consumeLot(
  lot: PayableSourceLot,
  operationId: string,
  occurredAt: string
): PayableSourceLot {
  if (lot.status !== "active") fail("lot_already_consumed");
  if (Temporal.Instant.compare(occurredAt, lot.createdAt) < 0) fail("invalid_field");
  return freezeLot({
    ...lot,
    status: "consumed",
    consumedByOperationId: operationId,
    consumedAt: occurredAt
  });
}

export function freezeLot(input: PayableSourceLot): PayableSourceLot {
  return Object.freeze({
    lotId: input.lotId,
    rootLotId: input.rootLotId,
    parentLotId: input.parentLotId,
    lineageDepth: input.lineageDepth,
    sourceId: input.sourceId,
    astrologerUserId: input.astrologerUserId,
    amount: input.amount,
    bucket: input.bucket,
    status: input.status,
    capturedAt: input.capturedAt,
    createdAt: input.createdAt,
    becameAvailableAt: input.becameAvailableAt,
    createdByOperationId: input.createdByOperationId,
    consumedByOperationId: input.consumedByOperationId,
    consumedAt: input.consumedAt,
    payoutRequestId: input.payoutRequestId,
    payoutAllocationId: input.payoutAllocationId,
    refundId: input.refundId,
    economics: input.economics,
    riskPolicy: input.riskPolicy,
    fulfillment: input.fulfillment,
    captureSource: input.captureSource
  });
}

export function freezeAllocation(lot: PayableSourceLot, amountMinor: number): PayableLotAllocation {
  return Object.freeze({
    lotId: lot.lotId,
    rootLotId: lot.rootLotId,
    sourceId: lot.sourceId,
    bucket: lot.bucket,
    amountMinor,
    becameAvailableAt: lot.becameAvailableAt
  });
}

export function freezeSelection(input: PayableLotSelection): PayableLotSelection {
  return Object.freeze({
    kind: input.kind,
    stateVersion: input.stateVersion,
    stateDigest: input.stateDigest,
    astrologerUserId: input.astrologerUserId,
    currency: "RUB",
    orderId: input.orderId,
    totalAmountMinor: input.totalAmountMinor,
    allocations: Object.freeze([...input.allocations])
  });
}

export function assertSelectionBoundToState(
  selection: PayableLotSelection,
  state: PayableLotReferenceState
): void {
  if (selection.stateVersion !== state.version || selection.stateDigest !== state.stateDigest) {
    fail("selection_mismatch");
  }
}

export function sameSelection(left: PayableLotSelection, right: PayableLotSelection): boolean {
  return (
    left.kind === right.kind &&
    left.stateVersion === right.stateVersion &&
    left.stateDigest === right.stateDigest &&
    left.astrologerUserId === right.astrologerUserId &&
    left.currency === right.currency &&
    left.orderId === right.orderId &&
    left.totalAmountMinor === right.totalAmountMinor &&
    JSON.stringify(left.allocations) === JSON.stringify(right.allocations)
  );
}

export function freezeTransition(
  operationId: string,
  consumedLots: readonly PayableSourceLot[],
  createdLots: readonly PayableSourceLot[]
): PayableLotTransition {
  return Object.freeze({
    operationId,
    consumedLots: Object.freeze([...consumedLots]),
    createdLots: Object.freeze([...createdLots])
  });
}

export function rubCurrency(value: unknown): "RUB" {
  if (value !== "RUB") fail("owner_currency_mismatch");
  return value;
}

export function safeSourceKey(value: unknown): FinanceSourceKey {
  try {
    return createFinanceSourceKey(value);
  } catch {
    return fail("invalid_shape");
  }
}

export function sha256Digest(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    fail("invalid_field");
  }
  return value;
}

export function identifierArray(value: unknown): readonly string[] {
  const values = exactDataArray(value).map(identifier);
  if (new Set(values).size !== values.length) fail("lineage_invalid");
  return Object.freeze(values);
}

export function nonEmptyIdentifierArray(value: unknown): readonly string[] {
  const values = identifierArray(value);
  if (values.length === 0) fail("selection_mismatch");
  return values;
}
