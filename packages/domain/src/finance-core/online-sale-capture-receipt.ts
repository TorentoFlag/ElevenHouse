import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import { createFinanceSourceKey, type FinanceSourceKey } from "./finance-source-key";
import { rehydratePayableLotPersistenceTransition } from "./source-lot-persistence-transition";
import type {
  PayableLotTransition,
  PayableSourceLot,
  SupportedFulfillmentSnapshot
} from "./source-lot-types";
import { exactDataRecord, fail, identifier } from "./source-lot-validation";
import type { OrderEconomicsSnapshot } from "./order-economics";
import type { RiskPolicySnapshot } from "./risk-policy";

const inputKeys = [
  "walletId",
  "expectedWalletRevision",
  "previousCommitmentDigest",
  "transition"
] as const;

/**
 * Bounded online receipt for a root client-sale lot. Unlike v1 payable-lot receipts it has no
 * full-source-state digest: its predecessor is the database-issued wallet commitment chain.
 * It is intentionally not accepted by the v1 sealed writer until the separate v2 persistence
 * graph/proof contract is wired end-to-end.
 */
export type OnlineSaleCaptureReceipt = Readonly<{
  kind: "online_sale_capture_receipt";
  schemaVersion: 2;
  receiptId: string;
  operationId: string;
  walletId: string;
  expectedWalletRevision: string;
  nextWalletRevision: string;
  previousCommitmentDigest: string | null;
  sourceKey: FinanceSourceKey;
  occurredAt: string;
  rootLot: PayableSourceLot;
  captureAuthority: Readonly<{
    canonicalEvidenceId: string;
    intentId: string;
    providerAccountId: string;
    providerPaymentId: string;
  }>;
  orderEconomics: OrderEconomicsSnapshot;
  riskPolicy: RiskPolicySnapshot;
  fulfillment: SupportedFulfillmentSnapshot;
  canonicalDigest: string;
}>;

export function createOnlineSaleCaptureReceipt(input: unknown): OnlineSaleCaptureReceipt {
  const fields = exactDataRecord(input, inputKeys);
  const walletId = uuid(fields.walletId);
  const expectedWalletRevision = revision(fields.expectedWalletRevision);
  const previousCommitmentDigest = previousCommitment(
    fields.previousCommitmentDigest,
    expectedWalletRevision
  );
  const transition = rehydratePayableLotPersistenceTransition(fields.transition);
  const rootLot = rootSaleLot(transition);
  const sourceKey = createFinanceSourceKey(rootLot.captureSource.sourceKey);
  if (
    sourceKey.kind !== "order" ||
    sourceKey.operation !== "sale_captured" ||
    sourceKey.sourceId !== rootLot.sourceId ||
    rootLot.captureSource.canonicalEvidenceId !== transition.operationId
  ) {
    fail("lineage_invalid");
  }
  const captureAuthority = Object.freeze({
    canonicalEvidenceId: identifier(rootLot.captureSource.canonicalEvidenceId),
    intentId: identifier(rootLot.captureSource.intentId),
    providerAccountId: identifier(rootLot.captureSource.providerAccountId),
    providerPaymentId: identifier(rootLot.captureSource.providerPaymentId)
  });
  const core = {
    kind: "online_sale_capture_receipt" as const,
    schemaVersion: 2 as const,
    receiptId: transition.operationId,
    operationId: transition.operationId,
    walletId,
    expectedWalletRevision,
    nextWalletRevision: (BigInt(expectedWalletRevision) + 1n).toString(),
    previousCommitmentDigest,
    sourceKey,
    occurredAt: rootLot.capturedAt,
    rootLot,
    captureAuthority,
    orderEconomics: rootLot.economics,
    riskPolicy: rootLot.riskPolicy,
    fulfillment: rootLot.fulfillment
  };
  return Object.freeze({ ...core, canonicalDigest: digestFinanceCanonicalValueV1(core) });
}

function rootSaleLot(transition: PayableLotTransition): PayableSourceLot {
  if (transition.consumedLots.length !== 0 || transition.createdLots.length !== 1) {
    fail("lineage_invalid");
  }
  const root = transition.createdLots[0];
  if (
    !root ||
    root.parentLotId !== null ||
    root.rootLotId !== root.lotId ||
    root.lineageDepth !== 0 ||
    root.status !== "active" ||
    root.bucket !== "pending" ||
    root.createdByOperationId !== transition.operationId ||
    root.consumedByOperationId !== null ||
    root.consumedAt !== null
  ) {
    fail("lineage_invalid");
  }
  return root;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    fail("invalid_field");
  }
  return value;
}

function revision(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail("invalid_field");
  }
  return value;
}

function previousCommitment(value: unknown, expectedWalletRevision: string): string | null {
  if (expectedWalletRevision === "0") {
    if (value !== null) fail("invalid_field");
    return null;
  }
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("invalid_field");
  }
  return value;
}
