import { operationAuthorityRefs } from "./source-lot-operation-receipt-authority";
import { deepFreeze, digestValue } from "./source-lot-operation-receipt-core";
import type { BoundedTransitionEvidence } from "./source-lot-operation-receipt-evidence";
import type {
  PayableLotOperationComponentSlot,
  PayableLotOperationEffect,
  PayableLotOperationLineageEntry,
  PayableLotOperationReceipt,
  PayableLotReceiptEffectBucket
} from "./source-lot-operation-receipt-types";
import type { PayableSourceLot } from "./source-lot-types";
import { fail } from "./source-lot-validation";

export function createReceiptFromEvidence(
  evidence: BoundedTransitionEvidence
): PayableLotOperationReceipt {
  const effects: PayableLotOperationEffect[] = [];
  const componentSlots: PayableLotOperationComponentSlot[] = [];
  const debitEffectByLot = new Map<string, string>();
  const creditEffectByLot = new Map<string, string>();
  const consumedById = new Map(evidence.consumedLots.map((lot) => [lot.lotId, lot] as const));
  const createdByParent = new Map<string, PayableSourceLot[]>();
  for (const created of evidence.createdLots) {
    if (created.parentLotId === null) continue;
    const siblings = createdByParent.get(created.parentLotId) ?? [];
    siblings.push(created);
    createdByParent.set(created.parentLotId, siblings);
  }
  const payoutAllocationByLotId = payoutAllocationLinksByLotId(evidence);

  const appendEffect = (
    lot: PayableSourceLot,
    bucket: PayableLotReceiptEffectBucket,
    side: "debit" | "credit",
    amountMinor: number
  ): PayableLotOperationEffect => {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) fail("conservation_violation");
    const effectId = `${evidence.operationId}:effect:${effects.length + 1}`;
    const lotAllocationId = `${evidence.operationId}:lot-allocation:${effects.length + 1}`;
    const componentSlotId = `${evidence.operationId}:component-slot:${effects.length + 1}`;
    let payoutAllocationId: string | null;
    if (payoutAllocationByLotId) {
      const authorityAllocationId = payoutAllocationByLotId.get(lot.lotId);
      if (authorityAllocationId === undefined) fail("lineage_invalid");
      payoutAllocationId = authorityAllocationId;
    } else {
      payoutAllocationId = lot.payoutAllocationId;
    }
    const knownLinks = Object.freeze({
      originalSaleId: lot.sourceId,
      rootLotId: lot.rootLotId,
      payableLotId: lot.lotId,
      payoutAllocationId
    });
    const effect = Object.freeze({
      effectId,
      lotAllocationId,
      bucket,
      side,
      amount: Object.freeze({ amountMinor, currency: "RUB" as const }),
      knownLinks,
      componentSlotId
    });
    effects.push(effect);
    componentSlots.push(
      Object.freeze({
        slotId: componentSlotId,
        effectId,
        field: "componentId" as const,
        requiredAuthority: Object.freeze({
          kind: "finance_component_registry" as const,
          operationKind: evidence.kind,
          bucket,
          side,
          ...knownLinks
        })
      })
    );
    return effect;
  };

  for (const consumed of evidence.consumedLots) {
    const structuralRemainders = (createdByParent.get(consumed.lotId) ?? []).filter(
      (candidate) => candidate.bucket === consumed.bucket
    );
    if (structuralRemainders.length > 1) fail("lineage_invalid");
    const remainderMinor = structuralRemainders[0]?.amount.amountMinor ?? 0;
    const debitMinor = consumed.amount.amountMinor - remainderMinor;
    const debit = appendEffect(consumed, consumed.bucket, "debit", debitMinor);
    debitEffectByLot.set(consumed.lotId, debit.effectId);
    if (evidence.kind === "chargeback_recovery_collected") {
      appendEffect(consumed, "recovery_receivable", "credit", debitMinor);
    }
  }

  const referencedIds = new Set(evidence.historyRecord.referencedLotIds);
  for (const created of evidence.createdLots) {
    const consumedParent =
      created.parentLotId === null ? undefined : consumedById.get(created.parentLotId);
    const parentIsConsumed = consumedParent !== undefined;
    const isStructuralRemainder =
      consumedParent !== undefined && consumedParent.bucket === created.bucket;
    const parentIsReferenced =
      created.parentLotId !== null && referencedIds.has(created.parentLotId);
    const isRoot = created.parentLotId === null;
    if (!parentIsConsumed && !parentIsReferenced && !isRoot) fail("lineage_invalid");
    if (isRoot && evidence.kind !== "sale_capture") fail("lineage_invalid");
    if (!isStructuralRemainder) {
      const credit = appendEffect(created, created.bucket, "credit", created.amount.amountMinor);
      creditEffectByLot.set(created.lotId, credit.effectId);
    }
  }

  const lineage: PayableLotOperationLineageEntry[] = [
    ...evidence.consumedLots.map((lot) =>
      Object.freeze({
        relation: "consumed" as const,
        lotId: lot.lotId,
        rootLotId: lot.rootLotId,
        parentLotId: lot.parentLotId,
        bucket: lot.bucket,
        amount: lot.amount,
        economicEffectId: debitEffectByLot.get(lot.lotId) ?? null
      })
    ),
    ...evidence.createdLots.map((lot) =>
      Object.freeze({
        relation: lot.parentLotId === null ? ("root_created" as const) : ("created" as const),
        lotId: lot.lotId,
        rootLotId: lot.rootLotId,
        parentLotId: lot.parentLotId,
        bucket: lot.bucket,
        amount: lot.amount,
        economicEffectId: creditEffectByLot.get(lot.lotId) ?? null
      })
    ),
    ...evidence.historyRecord.referencedLotIds.map((lotId) => {
      const children = createdByParent.get(lotId) ?? [];
      if (children.length !== 1) return fail("lineage_invalid");
      const child = children[0] as PayableSourceLot;
      return Object.freeze({
        relation: "referenced" as const,
        lotId,
        rootLotId: child.rootLotId,
        economicEffectId: null
      });
    })
  ];

  const authorityRefs = operationAuthorityRefs(evidence);
  const historyRecord = Object.freeze({
    kind: evidence.kind,
    canonicalDigest: digestValue(evidence.historyRecord),
    digestPurpose: "drift_detection_only" as const
  });
  const content = {
    kind: "payable_lot_operation_receipt" as const,
    schemaVersion: 1 as const,
    receiptId: evidence.operationId,
    operationId: evidence.operationId,
    operationKind: evidence.kind,
    sourceKey: evidence.sourceKey,
    occurredAt: evidence.historyRecord.occurredAt,
    astrologerUserId: evidence.astrologerUserId,
    currency: evidence.currency,
    previousLotState: Object.freeze({
      version: String(evidence.previousVersion),
      digest: evidence.previousStateDigest
    }),
    nextLotState: Object.freeze({
      version: String(evidence.nextVersion),
      digest: evidence.nextStateDigest
    }),
    historyRecord,
    authorityRefs: Object.freeze(authorityRefs),
    effects: Object.freeze(effects),
    lineage: Object.freeze(lineage),
    requiredExternalLinkSlots: Object.freeze(componentSlots),
    digestPurpose: "drift_detection_only" as const,
    integrityStatus: "unverified" as const
  };
  return deepFreeze({
    ...content,
    canonicalDigest: digestValue(content)
  });
}

function payoutAllocationLinksByLotId(
  evidence: BoundedTransitionEvidence
): ReadonlyMap<string, string> | null {
  if (
    evidence.kind === "payout_requested" &&
    evidence.historyRecord.authority?.kind === "payout_request"
  ) {
    const links = new Map<string, string>();
    for (const allocation of evidence.historyRecord.authority.allocations) {
      if (links.has(allocation.sourceLotId) || links.has(allocation.payoutPendingLotId)) {
        fail("lineage_invalid");
      }
      links.set(allocation.sourceLotId, allocation.payoutAllocationId);
      links.set(allocation.payoutPendingLotId, allocation.payoutAllocationId);
    }
    return links;
  }
  return null;
}
