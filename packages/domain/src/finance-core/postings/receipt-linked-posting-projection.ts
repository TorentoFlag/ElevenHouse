import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { FinanceJournalEntryInput } from "../journal";
import { createFinanceLedgerAccountRef, type FinanceLedgerAccountCode } from "../ledger-chart";
import {
  normalizePayableLotReceiptDecoderEnvelope,
  rehydratePayableLotOperationReceipt,
  type PayableLotOperationReceipt,
  type PayableLotReceiptDecoderEnvelope,
  type PayableLotReceiptEffectBucket
} from "../source-lot-operation-receipt";
import { readUnverifiedFinanceComponentSlotResolutionBindings } from "./component-slot-resolution";
import {
  assertFinancePostingNotProxy,
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  readFinancePostingDigest
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type { FinancePostingEntrySourceLink, FinancePostingEvidenceRef } from "./posting-types";

export type UnverifiedReceiptLinkedPostingRow = Readonly<{
  entry: FinanceJournalEntryInput;
  sourceLink: FinancePostingEntrySourceLink;
}>;

export type UnverifiedReceiptLinkedPostingProjection = Readonly<{
  receipt: PayableLotOperationReceipt;
  sourceEvidenceRef: FinancePostingEvidenceRef;
  rows: readonly UnverifiedReceiptLinkedPostingRow[];
}>;

const receiptEnvelopeKeys = [
  "maxAuthorityRefs",
  "maxEffects",
  "maxLineage",
  "maxComponentSlots",
  "maxDecimalDigits"
] as const;

const receiptKeys = [
  "kind",
  "schemaVersion",
  "receiptId",
  "operationId",
  "operationKind",
  "sourceKey",
  "occurredAt",
  "astrologerUserId",
  "currency",
  "previousLotState",
  "nextLotState",
  "historyRecord",
  "authorityRefs",
  "effects",
  "lineage",
  "requiredExternalLinkSlots",
  "digestPurpose",
  "integrityStatus",
  "canonicalDigest"
] as const;

const bucketAccountCodes = Object.freeze({
  pending: "astrologer_pending",
  available: "astrologer_available",
  reserved: "astrologer_reserved",
  payout_pending: "astrologer_payout_pending",
  refund_pending: "astrologer_refund_pending",
  recovery_receivable: "astrologer_recovery_receivable"
} satisfies Record<PayableLotReceiptEffectBucket, FinanceLedgerAccountCode>);

/**
 * Consistency-only projection. It resolves receipt effects to immutable wallet
 * rows and evidence, but grants no authority, atomicity or snapshot trust.
 */
export function projectUnverifiedReceiptLinkedPostingRows(
  input: {
    readonly operationReceipt: unknown;
    readonly componentBindings: unknown;
  },
  postingDecoderEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptDecoderEnvelopeInput: PayableLotReceiptDecoderEnvelope
): UnverifiedReceiptLinkedPostingProjection;

export function projectUnverifiedReceiptLinkedPostingRows(
  input: unknown,
  postingDecoderEnvelopeInput: unknown,
  receiptDecoderEnvelopeInput: unknown
): UnverifiedReceiptLinkedPostingProjection {
  const postingEnvelope = normalizeFinancePostingDecoderEnvelope(postingDecoderEnvelopeInput);
  const receiptEnvelope = readReceiptEnvelope(receiptDecoderEnvelopeInput);
  const root = readExactDataRecord(input, ["operationReceipt", "componentBindings"]);
  const receipt = readPayableLotReceipt(root.operationReceipt, receiptEnvelope);
  const componentBindings = readUnverifiedFinanceComponentSlotResolutionBindings(
    root.componentBindings,
    postingEnvelope
  );
  const slotsByEffectId = new Map(
    receipt.requiredExternalLinkSlots.map((slot) => [slot.effectId, slot] as const)
  );
  const bindingsBySlotId = new Map(
    componentBindings.map((binding) => [binding.slotId, binding] as const)
  );
  if (
    receipt.effects.length !== receipt.requiredExternalLinkSlots.length ||
    componentBindings.length !== receipt.requiredExternalLinkSlots.length ||
    slotsByEffectId.size !== receipt.requiredExternalLinkSlots.length ||
    bindingsBySlotId.size !== componentBindings.length
  ) {
    throw mismatch();
  }
  const rows = Object.freeze(
    receipt.effects.map((effect) => {
      const slot = slotsByEffectId.get(effect.effectId);
      const binding = bindingsBySlotId.get(effect.componentSlotId);
      if (
        !slot ||
        slot.slotId !== effect.componentSlotId ||
        !binding ||
        binding.operationReceiptId !== receipt.receiptId ||
        binding.operationReceiptDigest !== receipt.canonicalDigest ||
        binding.effectId !== effect.effectId ||
        binding.requiredAuthorityDigest !== hashFinanceCommandPayload(slot.requiredAuthority)
      ) {
        throw mismatch();
      }
      return Object.freeze({
        entry: Object.freeze({
          account: createReceiptBucketAccount(effect.bucket, receipt.astrologerUserId),
          side: effect.side,
          amount: effect.amount,
          links: Object.freeze({
            originalSaleId: effect.knownLinks.originalSaleId,
            componentId: binding.componentId,
            payableLotId: effect.knownLinks.payableLotId,
            payoutAllocationId: effect.knownLinks.payoutAllocationId
          })
        }),
        sourceLink: Object.freeze({
          semanticEdgeId: effect.effectId,
          lotAllocationId: effect.lotAllocationId
        })
      });
    })
  );
  const sourceEvidenceRef = Object.freeze({
    kind: "payable_lot_operation_receipt",
    evidenceId: receipt.receiptId,
    canonicalDigest: readFinancePostingDigest(receipt.canonicalDigest)
  });
  return Object.freeze({ receipt, sourceEvidenceRef, rows });
}

function readReceiptEnvelope(input: unknown): PayableLotReceiptDecoderEnvelope {
  try {
    return normalizePayableLotReceiptDecoderEnvelope(
      readExactDataRecord(input, receiptEnvelopeKeys)
    );
  } catch {
    throw mismatch();
  }
}

function readPayableLotReceipt(
  input: unknown,
  envelope: PayableLotReceiptDecoderEnvelope
): PayableLotOperationReceipt {
  try {
    const fields = readExactDataRecord(input, receiptKeys);
    const authorityRefs = readExactDataArray(fields.authorityRefs, 0, envelope.maxAuthorityRefs);
    const effects = readExactDataArray(fields.effects, 0, envelope.maxEffects);
    const lineage = readExactDataArray(fields.lineage, 0, envelope.maxLineage);
    const componentSlots = readExactDataArray(
      fields.requiredExternalLinkSlots,
      0,
      envelope.maxComponentSlots
    );
    const active = new WeakSet<object>();
    for (const value of [
      fields.sourceKey,
      fields.previousLotState,
      fields.nextLotState,
      fields.historyRecord,
      ...authorityRefs,
      ...effects,
      ...lineage,
      ...componentSlots
    ]) {
      assertProxyFreeReceiptRecord(value, active, 0);
    }
    return rehydratePayableLotOperationReceipt(
      {
        ...fields,
        authorityRefs,
        effects,
        lineage,
        requiredExternalLinkSlots: componentSlots
      },
      envelope
    );
  } catch {
    throw mismatch();
  }
}

function assertProxyFreeReceiptRecord(
  input: unknown,
  active: WeakSet<object>,
  depth: number
): void {
  if (typeof input !== "object" || input === null) return;
  assertFinancePostingNotProxy(input);
  if (Array.isArray(input) || depth > 4 || active.has(input)) throw mismatch();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw mismatch();
  active.add(input);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string") throw mismatch();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw mismatch();
    assertProxyFreeReceiptRecord(descriptor.value, active, depth + 1);
  }
  active.delete(input);
}

function createReceiptBucketAccount(
  bucket: PayableLotReceiptEffectBucket,
  astrologerUserId: string
) {
  return createFinanceLedgerAccountRef({
    code: bucketAccountCodes[bucket],
    astrologerUserId,
    currency: "RUB"
  });
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
}
