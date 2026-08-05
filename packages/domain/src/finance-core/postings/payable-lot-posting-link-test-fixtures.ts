import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  createPayableLotOperationReceipt,
  type PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { createUnverifiedFinanceJournalPostingRecipe as createRecipe } from "./posting-recipe";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const createUnverifiedFinanceJournalPostingRecipe = withPostingDecoderEnvelope(createRecipe);

export const receiptDecoderEnvelope = Object.freeze({
  maxAuthorityRefs: 8,
  maxEffects: 16,
  maxLineage: 32,
  maxComponentSlots: 16,
  maxDecimalDigits: 8
}) satisfies PayableLotReceiptDecoderEnvelope;

export function walletLinkedProofFixture(
  options: {
    semanticEdgeId?: string;
    lotAllocationId?: string;
    accountCode?: "astrologer_pending" | "astrologer_available";
    astrologerUserId?: string;
    componentBindingComponentId?: string;
  } = {}
) {
  const receiptCase = buildReceiptTransitionCases().find(
    (candidate) => candidate.kind === "sale_capture"
  );
  if (!receiptCase) throw new Error("missing wallet-linked receipt fixture");
  const operationReceipt = createPayableLotOperationReceipt(receiptCase.transition);
  const effect = operationReceipt.effects[0];
  const slot = operationReceipt.requiredExternalLinkSlots[0];
  if (!effect || !slot) throw new Error("missing wallet-linked source effect");
  const componentId = "component-wallet-linked";
  const result = createReceiptScopedRecipe(
    operationReceipt,
    [
      {
        account: {
          code: options.accountCode ?? "astrologer_pending",
          astrologerUserId: options.astrologerUserId ?? operationReceipt.astrologerUserId,
          currency: "RUB"
        },
        side: effect.side,
        amount: effect.amount,
        links: {
          originalSaleId: effect.knownLinks.originalSaleId,
          componentId,
          payableLotId: effect.knownLinks.payableLotId,
          payoutAllocationId: effect.knownLinks.payoutAllocationId
        }
      }
    ],
    [
      null,
      {
        semanticEdgeId: options.semanticEdgeId ?? effect.effectId,
        lotAllocationId: options.lotAllocationId ?? effect.lotAllocationId
      }
    ]
  );
  const bindingCore = {
    kind: "finance_component_slot_resolution_binding" as const,
    bindingId: `binding-${slot.slotId}`,
    version: "1",
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationReceiptId: operationReceipt.receiptId,
    operationReceiptDigest: operationReceipt.canonicalDigest as `sha256:${string}`,
    slotId: slot.slotId,
    effectId: effect.effectId,
    componentId: options.componentBindingComponentId ?? componentId,
    requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
  };
  return {
    proof: result.linkProof,
    transaction: result.transaction,
    operationReceipt,
    componentBindings: [{ ...bindingCore, bindingDigest: hashFinanceCommandPayload(bindingCore) }]
  };
}

export function createReceiptScopedRecipe(
  operationReceipt: ReturnType<typeof createPayableLotOperationReceipt>,
  walletEntries: readonly {
    account: Parameters<
      typeof createUnverifiedFinanceJournalPostingRecipe
    >[0]["entries"][number]["account"];
    side: "debit" | "credit";
    amount: { amountMinor: number; currency: "RUB" };
    links: {
      originalSaleId: string | null;
      componentId: string | null;
      payableLotId: string | null;
      payoutAllocationId: string | null;
    };
  }[],
  entrySourceLinks: Parameters<
    typeof createUnverifiedFinanceJournalPostingRecipe
  >[0]["entrySourceLinks"]
) {
  const effectTotal = walletEntries.reduce((sum, entry) => sum + entry.amount.amountMinor, 0);
  const controlSide = walletEntries[0]?.side === "debit" ? "credit" : "debit";
  return createUnverifiedFinanceJournalPostingRecipe({
    context: {
      journalTransactionId: `journal-${operationReceipt.operationId}`,
      linkProofId: `proof-${operationReceipt.operationId}`,
      operationId: operationReceipt.operationId,
      sourceKey: operationReceipt.sourceKey,
      occurredAt: operationReceipt.occurredAt,
      postedAt: operationReceipt.occurredAt
    },
    authorityRef: {
      kind: "wallet-linked-test",
      authorityId: `authority-${operationReceipt.operationId}`,
      version: 1,
      canonicalDigest: `sha256:${"5".repeat(64)}`
    },
    sourceEvidenceRef: {
      kind: "payable_lot_operation_receipt",
      evidenceId: operationReceipt.receiptId,
      canonicalDigest: operationReceipt.canonicalDigest as `sha256:${string}`
    },
    operationSnapshotRef: {
      snapshotId: `snapshot-${operationReceipt.operationId}`,
      operationId: operationReceipt.operationId,
      sourceKey: operationReceipt.sourceKey,
      previousWalletRevision: "40",
      nextWalletRevision: "41",
      previousLotStateDigest: operationReceipt.previousLotState.digest as `sha256:${string}`,
      nextLotStateDigest: operationReceipt.nextLotState.digest as `sha256:${string}`,
      historyRecordDigest: operationReceipt.historyRecord.canonicalDigest as `sha256:${string}`,
      snapshotDigest: `sha256:${"4".repeat(64)}`
    },
    entrySourceLinks,
    entries: [
      {
        account: {
          code: "arc_provider_clearing",
          arcProviderAccountId: "arc-provider-test",
          currency: "RUB"
        },
        side: controlSide,
        amount: { amountMinor: effectTotal || 1, currency: "RUB" },
        links: {
          originalSaleId: null,
          componentId: null,
          payableLotId: null,
          payoutAllocationId: null
        }
      },
      ...(walletEntries.length > 0
        ? walletEntries
        : [
            {
              account: {
                code: "arc_provider_clearing" as const,
                arcProviderAccountId: "arc-provider-test",
                currency: "RUB" as const
              },
              side: "credit" as const,
              amount: { amountMinor: 1, currency: "RUB" as const },
              links: {
                originalSaleId: null,
                componentId: null,
                payableLotId: null,
                payoutAllocationId: null
              }
            }
          ])
    ]
  });
}
