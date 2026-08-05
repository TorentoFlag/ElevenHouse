import {
  rehydratePayableLotOperationReceipt,
  type PayableLotOperationEffect,
  type PayableLotOperationReceipt,
  type PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import type { PayableLotHistoryRecord } from "../source-lot-types";
import { FinancePostingIntegrityError, sameCanonicalFinancePostingValue } from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type {
  FinancePostingEvidenceRef,
  FinancePostingOperationSnapshotRef,
  UnverifiedFinanceComponentSlotResolutionBinding
} from "./posting-types";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import {
  buildRefundReceiptComponentBindings,
  buildRefundReceiptSnapshotRef
} from "./refund-posting-receipt-support";
import { assertRefundReceiptStructuralPreflight } from "./refund-posting-receipt-preflight";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";

type StandardRefundOperation = "approved" | "confirmed" | "failed";
type ExpectedReceiptAuthority = Readonly<{
  kind: "refund_approval" | "refund_confirmed" | "refund_failed";
  authorityId: string;
  version: number;
  evidenceId: string | null;
  canonicalDigest: string;
}>;

export type RefundReceiptPostingProjection = Readonly<{
  receipt: PayableLotOperationReceipt;
  sourceEvidenceRef: FinancePostingEvidenceRef;
  operationSnapshotRef: FinancePostingOperationSnapshotRef;
  rows: ReturnType<typeof projectUnverifiedReceiptLinkedPostingRows>["rows"];
  componentBindings: readonly UnverifiedFinanceComponentSlotResolutionBinding[];
}>;

export function projectStandardRefundReceipt(input: {
  readonly operationReceipt: unknown;
  readonly allocation: RefundPostingAllocationAuthorityV1;
  readonly operation: StandardRefundOperation;
  readonly expectedAuthority: ExpectedReceiptAuthority;
  readonly expectedOccurredAt: string;
  readonly postingEnvelope: FinancePostingDecoderEnvelope;
  readonly receiptEnvelope: PayableLotReceiptDecoderEnvelope;
}): RefundReceiptPostingProjection {
  try {
    assertRefundReceiptStructuralPreflight(input.operationReceipt, input.receiptEnvelope);
    const receipt = rehydratePayableLotOperationReceipt(
      input.operationReceipt,
      input.receiptEnvelope
    );
    assertReceiptScope(receipt, input.allocation, input.operation, input.expectedOccurredAt);
    assertReceiptAuthority(receipt, input.expectedAuthority);
    const componentIds = resolveStandardComponentIds(receipt, input.allocation, input.operation);
    const componentBindings = buildRefundReceiptComponentBindings(receipt, componentIds);
    const projection = projectUnverifiedReceiptLinkedPostingRows(
      { operationReceipt: receipt, componentBindings },
      input.postingEnvelope,
      input.receiptEnvelope
    );
    return Object.freeze({
      receipt: projection.receipt,
      sourceEvidenceRef: projection.sourceEvidenceRef,
      operationSnapshotRef: buildRefundReceiptSnapshotRef(projection.receipt),
      rows: projection.rows,
      componentBindings
    });
  } catch {
    throw mismatch();
  }
}

function assertReceiptScope(
  receipt: PayableLotOperationReceipt,
  allocation: RefundPostingAllocationAuthorityV1,
  operation: StandardRefundOperation,
  expectedOccurredAt: string
): void {
  const expectedKind = `refund_${operation}` as PayableLotHistoryRecord["kind"];
  if (
    receipt.operationKind !== expectedKind ||
    receipt.sourceKey.kind !== "refund" ||
    receipt.sourceKey.operation !== operation ||
    receipt.sourceKey.sourceId !== allocation.refundId ||
    receipt.astrologerUserId !== allocation.astrologerUserId ||
    receipt.occurredAt !== expectedOccurredAt
  ) {
    throw mismatch();
  }
}

function assertReceiptAuthority(
  receipt: PayableLotOperationReceipt,
  expected: ExpectedReceiptAuthority
): void {
  const authority = receipt.authorityRefs[0];
  if (
    receipt.authorityRefs.length !== 1 ||
    !authority ||
    authority.kind !== expected.kind ||
    authority.authorityId !== expected.authorityId ||
    authority.authorityVersion !== String(expected.version) ||
    authority.evidenceId !== expected.evidenceId ||
    authority.canonicalDigest !== expected.canonicalDigest
  ) {
    throw mismatch();
  }
}

function resolveStandardComponentIds(
  receipt: PayableLotOperationReceipt,
  allocation: RefundPostingAllocationAuthorityV1,
  operation: StandardRefundOperation
): readonly string[] {
  const components = allocation.payableComponents;
  const expectedEffects = components.length * (operation === "confirmed" ? 1 : 2);
  if (receipt.effects.length !== expectedEffects) throw mismatch();
  const bySourceLot = new Map(components.map((row) => [row.sourceLotId, row] as const));
  const byRefundPendingLot = new Map(
    components.map((row) => [row.refundPendingLotId, row] as const)
  );
  const lineageByEffect = new Map<
    string,
    Exclude<PayableLotOperationReceipt["lineage"][number], { readonly relation: "referenced" }>
  >();
  for (const entry of receipt.lineage) {
    if (entry.relation === "referenced" || entry.economicEffectId === null) continue;
    if (lineageByEffect.has(entry.economicEffectId)) throw mismatch();
    lineageByEffect.set(entry.economicEffectId, entry);
  }
  const matchedRoles = new Set<string>();
  const componentIds = receipt.effects.map((effect) => {
    const lineage = lineageByEffect.get(effect.effectId);
    if (!lineage) throw mismatch();
    const component = findStandardComponent({
      bySourceLot,
      byRefundPendingLot,
      effect,
      lineage,
      operation,
      orderId: allocation.orderId
    });
    const role = `${component.componentId}:${effect.side}`;
    if (matchedRoles.has(role)) throw mismatch();
    matchedRoles.add(role);
    return component.componentId;
  });
  if (matchedRoles.size !== expectedEffects) throw mismatch();
  return Object.freeze(componentIds);
}

function findStandardComponent(input: {
  bySourceLot: ReadonlyMap<string, RefundPostingAllocationAuthorityV1["payableComponents"][number]>;
  byRefundPendingLot: ReadonlyMap<
    string,
    RefundPostingAllocationAuthorityV1["payableComponents"][number]
  >;
  effect: PayableLotOperationEffect;
  lineage: Exclude<
    PayableLotOperationReceipt["lineage"][number],
    { readonly relation: "referenced" }
  >;
  operation: StandardRefundOperation;
  orderId: string;
}) {
  const { bySourceLot, byRefundPendingLot, effect, lineage, operation, orderId } = input;
  if (lineage.lotId !== effect.knownLinks.payableLotId) throw mismatch();
  if (operation === "approved") {
    const component =
      effect.side === "debit"
        ? bySourceLot.get(effect.knownLinks.payableLotId)
        : byRefundPendingLot.get(effect.knownLinks.payableLotId);
    if (!component) throw mismatch();
    const expectedBucket = effect.side === "debit" ? component.originalBucket : "refund_pending";
    if (
      (effect.side === "debit" && lineage.relation !== "consumed") ||
      (effect.side === "credit" &&
        (lineage.relation !== "created" || lineage.parentLotId !== component.sourceLotId))
    ) {
      throw mismatch();
    }
    assertComponentEffect(effect, component, expectedBucket, orderId);
    return component;
  }
  if (effect.side === "debit") {
    const component = byRefundPendingLot.get(effect.knownLinks.payableLotId);
    if (!component || lineage.relation !== "consumed") throw mismatch();
    assertComponentEffect(effect, component, "refund_pending", orderId);
    return component;
  }
  if (operation !== "failed" || lineage.relation !== "created" || lineage.parentLotId === null) {
    throw mismatch();
  }
  const component = byRefundPendingLot.get(lineage.parentLotId);
  if (!component) throw mismatch();
  assertComponentEffect(effect, component, component.originalBucket, orderId);
  return component;
}

function assertComponentEffect(
  effect: PayableLotOperationEffect,
  component: RefundPostingAllocationAuthorityV1["payableComponents"][number],
  expectedBucket: PayableLotOperationEffect["bucket"],
  orderId: string
): void {
  if (
    effect.bucket !== expectedBucket ||
    effect.knownLinks.originalSaleId !== orderId ||
    effect.knownLinks.rootLotId !== component.rootLotId ||
    effect.knownLinks.payoutAllocationId !== component.payoutAllocationId ||
    !sameCanonicalFinancePostingValue(effect.amount, component.amount)
  ) {
    throw mismatch();
  }
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
}
