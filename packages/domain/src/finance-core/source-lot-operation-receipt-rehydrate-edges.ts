import { sameCanonicalValue } from "./source-lot-operation-receipt-core";
import {
  receiptEffectBucket,
  receiptHistoryKind
} from "./source-lot-operation-receipt-rehydrate-values";
import type {
  PayableLotOperationComponentSlot,
  PayableLotOperationEffect,
  PayableLotOperationLineageEntry
} from "./source-lot-operation-receipt-types";
import type { PayableLotHistoryRecord } from "./source-lot-types";
import {
  dataRecord,
  exactDataRecord,
  fail,
  identifier,
  money,
  nullableIdentifier
} from "./source-lot-validation";

export function operationEffect(
  input: unknown,
  operationId: string,
  operationKind: PayableLotHistoryRecord["kind"],
  index: number
): PayableLotOperationEffect {
  const fields = exactDataRecord(input, [
    "effectId",
    "lotAllocationId",
    "bucket",
    "side",
    "amount",
    "knownLinks",
    "componentSlotId"
  ]);
  const effectId = `${operationId}:effect:${index + 1}`;
  const lotAllocationId = `${operationId}:lot-allocation:${index + 1}`;
  const componentSlotId = `${operationId}:component-slot:${index + 1}`;
  if (
    fields.effectId !== effectId ||
    fields.lotAllocationId !== lotAllocationId ||
    fields.componentSlotId !== componentSlotId
  ) {
    fail("invalid_field");
  }
  const bucket = receiptEffectBucket(fields.bucket);
  if (fields.side !== "debit" && fields.side !== "credit") fail("invalid_field");
  if (
    (bucket === "recovery_receivable" &&
      (operationKind !== "chargeback_recovery_collected" || fields.side !== "credit")) ||
    (operationKind !== "chargeback_recovery_collected" && bucket === "recovery_receivable")
  ) {
    fail("invalid_field");
  }
  return Object.freeze({
    effectId,
    lotAllocationId,
    bucket,
    side: fields.side,
    amount: money(fields.amount, true, "invalid_field"),
    knownLinks: knownLinks(fields.knownLinks),
    componentSlotId
  });
}

export function componentSlot(
  input: unknown,
  operationId: string,
  operationKind: PayableLotHistoryRecord["kind"],
  effects: readonly PayableLotOperationEffect[],
  index: number
): PayableLotOperationComponentSlot {
  const fields = exactDataRecord(input, ["slotId", "effectId", "field", "requiredAuthority"]);
  const effect = effects[index];
  if (!effect) fail("invalid_shape");
  const slotId = `${operationId}:component-slot:${index + 1}`;
  const effectId = `${operationId}:effect:${index + 1}`;
  if (fields.slotId !== slotId || fields.effectId !== effectId || fields.field !== "componentId") {
    fail("invalid_field");
  }
  const authorityFields = exactDataRecord(fields.requiredAuthority, [
    "kind",
    "operationKind",
    "bucket",
    "side",
    "originalSaleId",
    "rootLotId",
    "payableLotId",
    "payoutAllocationId"
  ]);
  if (
    authorityFields.kind !== "finance_component_registry" ||
    (authorityFields.side !== "debit" && authorityFields.side !== "credit")
  ) {
    fail("invalid_field");
  }
  const authority = Object.freeze({
    kind: "finance_component_registry" as const,
    operationKind: receiptHistoryKind(authorityFields.operationKind),
    bucket: receiptEffectBucket(authorityFields.bucket),
    side: authorityFields.side,
    originalSaleId: identifier(authorityFields.originalSaleId),
    rootLotId: identifier(authorityFields.rootLotId),
    payableLotId: identifier(authorityFields.payableLotId),
    payoutAllocationId: nullableIdentifier(authorityFields.payoutAllocationId)
  });
  if (
    authority.operationKind !== operationKind ||
    !sameCanonicalValue(authority, {
      kind: "finance_component_registry",
      operationKind,
      bucket: effect.bucket,
      side: effect.side,
      ...effect.knownLinks
    })
  ) {
    fail("invalid_field");
  }
  return Object.freeze({ slotId, effectId, field: "componentId", requiredAuthority: authority });
}

function knownLinks(input: unknown) {
  const fields = exactDataRecord(input, [
    "originalSaleId",
    "rootLotId",
    "payableLotId",
    "payoutAllocationId"
  ]);
  return Object.freeze({
    originalSaleId: identifier(fields.originalSaleId),
    rootLotId: identifier(fields.rootLotId),
    payableLotId: identifier(fields.payableLotId),
    payoutAllocationId: nullableIdentifier(fields.payoutAllocationId)
  });
}

export function lineageEntry(
  input: unknown,
  effectIds: ReadonlySet<string>
): PayableLotOperationLineageEntry {
  const projected = dataRecord(input);
  if (projected.relation === "referenced") {
    const fields = exactDataRecord(input, ["relation", "lotId", "rootLotId", "economicEffectId"]);
    if (fields.economicEffectId !== null) fail("invalid_field");
    return Object.freeze({
      relation: "referenced",
      lotId: identifier(fields.lotId),
      rootLotId: identifier(fields.rootLotId),
      economicEffectId: null
    });
  }
  const fields = exactDataRecord(input, [
    "relation",
    "lotId",
    "rootLotId",
    "parentLotId",
    "bucket",
    "amount",
    "economicEffectId"
  ]);
  if (
    fields.relation !== "consumed" &&
    fields.relation !== "created" &&
    fields.relation !== "root_created"
  ) {
    fail("invalid_field");
  }
  const parentLotId = nullableIdentifier(fields.parentLotId);
  if (
    (fields.relation === "root_created" && parentLotId !== null) ||
    (fields.relation === "created" && parentLotId === null)
  ) {
    fail("lineage_invalid");
  }
  const economicEffectId =
    fields.economicEffectId === null ? null : operationScopedEffectId(fields.economicEffectId);
  if (economicEffectId !== null && !effectIds.has(economicEffectId)) fail("lineage_invalid");
  return Object.freeze({
    relation: fields.relation,
    lotId: identifier(fields.lotId),
    rootLotId: identifier(fields.rootLotId),
    parentLotId,
    bucket: receiptEffectBucket(fields.bucket, false),
    amount: money(fields.amount, true, "invalid_field"),
    economicEffectId
  });
}

export function assertLineageOrder(lineage: readonly PayableLotOperationLineageEntry[]): void {
  let priorRank = -1;
  const identities = new Set<string>();
  for (const entry of lineage) {
    const rank =
      entry.relation === "consumed"
        ? 0
        : entry.relation === "created" || entry.relation === "root_created"
          ? 1
          : 2;
    if (rank < priorRank) fail("lineage_invalid");
    priorRank = rank;
    const identity = `${entry.relation}:${entry.lotId}`;
    if (identities.has(identity)) fail("lineage_invalid");
    identities.add(identity);
  }
}

function operationScopedEffectId(value: unknown): string {
  if (typeof value !== "string" || !/^[^\s]+:effect:[1-9]\d*$/.test(value)) {
    fail("invalid_field");
  }
  return value;
}
