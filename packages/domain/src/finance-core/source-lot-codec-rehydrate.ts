import { Temporal } from "@js-temporal/polyfill";
import {
  readPersistedVerifiedEconomicPaymentCaptureReceipt,
  readUnverifiedStoredEconomicPaymentCaptureCandidate,
  type EconomicCaptureEffect,
  type EconomicPaymentIntent,
  type PersistedVerifiedEconomicPaymentCaptureReceipt
} from "./economic-payment";
import { createFinanceSourceKey, type FinanceSourceKey } from "./finance-source-key";
import { createOrderEconomicsSnapshot, type OrderEconomicsSnapshot } from "./order-economics";
import { createRiskPolicySnapshot, type RiskPolicySnapshot } from "./risk-policy";
import {
  type PayableLotBucket,
  type PayableLotCaptureSource,
  type PayableLotSelection,
  type PayableSourceLot,
  type SupportedFulfillmentSnapshot
} from "./source-lot-types";
import {
  exactDataArray,
  exactDataRecord,
  fail,
  identifier,
  instant,
  integer,
  money,
  nullableIdentifier,
  positiveVersion,
  sameMoney
} from "./source-lot-validation";

import {
  freezeCaptureSource,
  freezeLot,
  freezeSelection,
  sha256Digest
} from "./source-lot-codec-core";
import {
  allocationKeys,
  bucketSet,
  captureSourceKeys,
  fulfillmentKeys,
  intentKeys,
  lotKeys,
  selectionKeys
} from "./source-lot-codec-shapes";
export function hydrateSelection(value: unknown): PayableLotSelection {
  const fields = exactDataRecord(value, selectionKeys);
  if (fields.kind !== "payout" && fields.kind !== "refund") fail("selection_mismatch");
  const astrologerUserId = identifier(fields.astrologerUserId);
  if (fields.currency !== "RUB") fail("selection_mismatch");
  const orderId = nullableIdentifier(fields.orderId);
  if ((fields.kind === "payout") !== (orderId === null)) fail("selection_mismatch");
  const totalAmountMinor = integer(
    fields.totalAmountMinor,
    1,
    Number.MAX_SAFE_INTEGER,
    "selection_mismatch"
  );
  const stateVersion = positiveVersion(fields.stateVersion, "selection_mismatch");
  const stateDigest = sha256Digest(fields.stateDigest);
  const allocations = exactDataArray(fields.allocations).map((entry) => {
    const allocation = exactDataRecord(entry, allocationKeys);
    if (!bucketSet.has(allocation.bucket)) fail("selection_mismatch");
    return Object.freeze({
      lotId: identifier(allocation.lotId),
      rootLotId: identifier(allocation.rootLotId),
      sourceId: identifier(allocation.sourceId),
      bucket: allocation.bucket as PayableLotBucket,
      amountMinor: integer(
        allocation.amountMinor,
        1,
        Number.MAX_SAFE_INTEGER,
        "selection_mismatch"
      ),
      becameAvailableAt:
        allocation.becameAvailableAt === null ? null : instant(allocation.becameAvailableAt)
    });
  });
  if (
    allocations.length === 0 ||
    new Set(allocations.map((allocation) => allocation.lotId)).size !== allocations.length ||
    allocations.reduce((sum, allocation) => sum + BigInt(allocation.amountMinor), 0n) !==
      BigInt(totalAmountMinor)
  ) {
    fail("selection_mismatch");
  }
  return freezeSelection({
    kind: fields.kind,
    stateVersion,
    stateDigest,
    astrologerUserId,
    currency: "RUB",
    orderId,
    totalAmountMinor,
    allocations
  });
}

export function hydrateLot(value: unknown): PayableSourceLot {
  const fields = exactDataRecord(value, lotKeys);
  const lotId = identifier(fields.lotId);
  const rootLotId = identifier(fields.rootLotId);
  const parentLotId = nullableIdentifier(fields.parentLotId);
  const lineageDepth = integer(fields.lineageDepth, 0, Number.MAX_SAFE_INTEGER, "lineage_invalid");
  if (
    (parentLotId === null && (rootLotId !== lotId || lineageDepth !== 0)) ||
    (parentLotId !== null && (parentLotId === lotId || lineageDepth === 0))
  ) {
    fail("lineage_invalid");
  }
  const economics = safeEconomics(fields.economics);
  const riskPolicy = safeRiskPolicy(fields.riskPolicy);
  const fulfillment = supportedFulfillment(fields.fulfillment);
  const captureSource = hydrateCaptureSource(fields.captureSource);
  const sourceId = identifier(fields.sourceId);
  const astrologerUserId = identifier(fields.astrologerUserId);
  const amount = money(fields.amount, true, "invalid_field");
  if (!bucketSet.has(fields.bucket)) fail("invalid_field");
  const bucket = fields.bucket as PayableLotBucket;
  if (fields.status !== "active" && fields.status !== "consumed") fail("invalid_field");
  const status = fields.status;
  const capturedAt = instant(fields.capturedAt);
  const createdAt = instant(fields.createdAt);
  const becameAvailableAt =
    fields.becameAvailableAt === null ? null : instant(fields.becameAvailableAt);
  const createdByOperationId = identifier(fields.createdByOperationId);
  const consumedByOperationId = nullableIdentifier(fields.consumedByOperationId);
  const consumedAt = fields.consumedAt === null ? null : instant(fields.consumedAt);
  const payoutRequestId = nullableIdentifier(fields.payoutRequestId);
  const payoutAllocationId = nullableIdentifier(fields.payoutAllocationId);
  const refundId = nullableIdentifier(fields.refundId);

  if (
    sourceId !== economics.orderId ||
    astrologerUserId !== economics.astrologerUserId ||
    amount.currency !== economics.payable.currency ||
    amount.amountMinor > economics.payable.amountMinor ||
    captureSource.sourceKey.sourceId !== sourceId ||
    captureSource.paymentIntent.sourceId !== sourceId ||
    !sameMoney(captureSource.paymentIntent.amount, economics.gross)
  ) {
    fail("capture_correlation_mismatch");
  }
  if (
    (status === "active" && (consumedByOperationId !== null || consumedAt !== null)) ||
    (status === "consumed" && (consumedByOperationId === null || consumedAt === null)) ||
    Temporal.Instant.compare(capturedAt, createdAt) > 0 ||
    Temporal.Instant.compare(riskPolicy.effectiveAt, capturedAt) > 0 ||
    (consumedAt !== null && Temporal.Instant.compare(consumedAt, createdAt) < 0) ||
    (becameAvailableAt !== null && Temporal.Instant.compare(becameAvailableAt, capturedAt) < 0) ||
    (bucket === "available" && becameAvailableAt === null)
  ) {
    fail("invalid_field");
  }
  if (
    (bucket === "payout_pending") !== (payoutRequestId !== null) ||
    (bucket === "payout_pending" && payoutAllocationId === null) ||
    (bucket === "refund_pending") !== (refundId !== null) ||
    (payoutRequestId !== null && refundId !== null)
  ) {
    fail("invalid_field");
  }

  return freezeLot({
    lotId,
    rootLotId,
    parentLotId,
    lineageDepth,
    sourceId,
    astrologerUserId,
    amount,
    bucket,
    status,
    capturedAt,
    createdAt,
    becameAvailableAt,
    createdByOperationId,
    consumedByOperationId,
    consumedAt,
    payoutRequestId,
    payoutAllocationId,
    refundId,
    economics,
    riskPolicy,
    fulfillment,
    captureSource
  });
}

export function persistedVerifiedClientCapture(
  value: PersistedVerifiedEconomicPaymentCaptureReceipt
): Readonly<{
  intent: EconomicPaymentIntent;
  effect: Extract<EconomicCaptureEffect, { kind: "client_sale_captured" }>;
}> {
  let verified;
  try {
    verified = readPersistedVerifiedEconomicPaymentCaptureReceipt(value);
  } catch {
    return fail("authoritative_capture_required");
  }
  if (verified.effect.kind !== "client_sale_captured") {
    fail("authoritative_capture_required");
  }
  return Object.freeze({ intent: verified.intent, effect: verified.effect });
}

export function safeEconomics(value: unknown): OrderEconomicsSnapshot {
  try {
    return createOrderEconomicsSnapshot(value);
  } catch {
    return fail("invalid_shape");
  }
}

export function safeRiskPolicy(value: unknown): RiskPolicySnapshot {
  try {
    return createRiskPolicySnapshot(value);
  } catch {
    return fail("invalid_shape");
  }
}

export function supportedFulfillment(value: unknown): SupportedFulfillmentSnapshot {
  const fields = exactDataRecord(value, fulfillmentKeys);
  const terminal = exactDataRecord(fields.terminalEvidence, ["owner", "status", "contractVersion"]);
  const cancellation = exactDataRecord(fields.cancellationAllocator, [
    "owner",
    "port",
    "policyVersion"
  ]);
  const registryKey = fields.registryKey;
  if (
    fields.supported !== true ||
    (registryKey !== "single.once.live.solo" && registryKey !== "async.once.async.solo") ||
    fields.registryRevision !== 1 ||
    fields.holdAnchor !== "booking_completed" ||
    terminal.owner !== "booking" ||
    terminal.status !== "completed" ||
    terminal.contractVersion !== 1 ||
    cancellation.owner !== "booking" ||
    cancellation.port !== "BookingCancellationRefundDecisionPort" ||
    cancellation.policyVersion !== 1
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    supported: true,
    registryKey,
    registryRevision: 1,
    holdAnchor: "booking_completed",
    terminalEvidence: Object.freeze({
      owner: "booking",
      status: "completed",
      contractVersion: 1
    }),
    cancellationAllocator: Object.freeze({
      owner: "booking",
      port: "BookingCancellationRefundDecisionPort",
      policyVersion: 1
    })
  });
}

export function hydrateCaptureSource(value: unknown): PayableLotCaptureSource {
  const fields = exactDataRecord(value, captureSourceKeys);
  let sourceKey: FinanceSourceKey;
  try {
    sourceKey = createFinanceSourceKey(fields.sourceKey);
  } catch {
    return fail("invalid_shape");
  }
  if (sourceKey.kind !== "order" || sourceKey.operation !== "sale_captured") {
    fail("invalid_field");
  }
  const paymentIntentFields = exactDataRecord(fields.paymentIntent, intentKeys);
  if (paymentIntentFields.capture === null) fail("authoritative_capture_required");
  const capture = readUnverifiedStoredEconomicPaymentCaptureCandidate({
    intent: fields.paymentIntent,
    effect: paymentIntentFields.capture
  });
  if (
    fields.intentId !== capture.effect.intentId ||
    fields.providerAccountId !== capture.effect.providerAccount.providerAccountId ||
    fields.providerPaymentId !== capture.effect.providerPaymentId ||
    fields.canonicalEvidenceId !== capture.effect.canonicalEvidenceId ||
    sourceKey.sourceId !== capture.effect.sourceId
  ) {
    fail("capture_correlation_mismatch");
  }
  return freezeCaptureSource({
    intentId: identifier(fields.intentId),
    providerAccountId: identifier(fields.providerAccountId),
    providerPaymentId: identifier(fields.providerPaymentId),
    canonicalEvidenceId: identifier(fields.canonicalEvidenceId),
    paymentIntent: capture.intent,
    sourceKey: Object.freeze({
      kind: "order",
      sourceId: sourceKey.sourceId,
      operation: "sale_captured"
    })
  });
}
