import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { assertFinanceJournalLinkProofMatchesOperationReceipt } from "./payable-lot-posting-link";
import {
  assertFinancePostingInstantEqual,
  assertFinancePostingMoneyEqual,
  FinancePostingIntegrityError,
  readExactDataRecord
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import {
  readFinanceJournalPostingContext,
  type FinanceJournalPostingContext
} from "./posting-event-identity";
import { createUnverifiedFinanceJournalPostingRecipe } from "./posting-recipe";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import {
  normalizeSaleCaptureReceiptEnvelope,
  readSaleCapturePostingAuthority,
  type SaleCapturePostingAuthority
} from "./sale-capture-posting-authority";
import type { UnverifiedFinancePostingRecipe } from "./posting-types";

type JournalRecipe = Extract<UnverifiedFinancePostingRecipe, { readonly kind: "journal" }>;

export type { SaleCapturePostingAuthority } from "./sale-capture-posting-authority";

export function buildClientSaleCapturePosting(
  input: Readonly<{
    context: FinanceJournalPostingContext;
    authority: SaleCapturePostingAuthority;
    operationReceipt: unknown;
    componentBindings: unknown;
    operationSnapshotRef: unknown;
  }>,
  postingEnvelopeInput: FinancePostingDecoderEnvelope,
  receiptEnvelopeInput: PayableLotReceiptDecoderEnvelope
): JournalRecipe;
export function buildClientSaleCapturePosting(
  input: unknown,
  postingEnvelopeInput: unknown,
  receiptEnvelopeInput: unknown
): JournalRecipe {
  const postingEnvelope = normalizeFinancePostingDecoderEnvelope(postingEnvelopeInput);
  const receiptEnvelope = normalizeSaleCaptureReceiptEnvelope(receiptEnvelopeInput);
  const root = readExactDataRecord(input, [
    "context",
    "authority",
    "operationReceipt",
    "componentBindings",
    "operationSnapshotRef"
  ]);
  const context = readFinanceJournalPostingContext(root.context, postingEnvelope);
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    {
      operationReceipt: root.operationReceipt,
      componentBindings: root.componentBindings
    },
    postingEnvelope,
    receiptEnvelope
  );
  const authority = readSaleCapturePostingAuthority(root.authority);
  const { receipt, rows } = projection;
  const capture = receipt.authorityRefs[0];
  const row = rows[0];
  if (
    receipt.operationKind !== "sale_capture" ||
    capture?.kind !== "canonical_capture" ||
    rows.length !== 1 ||
    !row ||
    row.entry.account.code !== "astrologer_pending" ||
    row.entry.side !== "credit"
  ) {
    fail("proof_operation_receipt_mismatch");
  }
  assertIdentity(context, authority, receipt, row.entry.links.originalSaleId);
  if (
    authority.operationReceiptId !== receipt.receiptId ||
    authority.operationReceiptDigest !== receipt.canonicalDigest ||
    authority.componentBindingsDigest !== hashFinanceCommandPayload(root.componentBindings)
  ) {
    fail("authority_mismatch");
  }
  const economics = authority.orderEconomics;
  if (economics.astrologerUserId !== receipt.astrologerUserId) fail("scope_mismatch");
  assertFinancePostingMoneyEqual(economics.payable, row.entry.amount, "amount_mismatch");
  const payableComponentId = row.entry.links.componentId;
  if (
    payableComponentId === null ||
    new Set([
      payableComponentId,
      authority.providerClearingComponentId,
      authority.platformCommissionComponentId
    ]).size !== 3
  ) {
    fail("authority_mismatch");
  }

  const saleLinks = (componentId: string) =>
    Object.freeze({
      originalSaleId: economics.orderId,
      componentId,
      payableLotId: null,
      payoutAllocationId: null
    });
  const entries = [
    {
      account: {
        code: "arc_provider_clearing" as const,
        arcProviderAccountId: capture.providerAccountId,
        currency: "RUB" as const
      },
      side: "debit" as const,
      amount: economics.gross,
      links: saleLinks(authority.providerClearingComponentId)
    },
    row.entry,
    ...(economics.commission.amountMinor === 0
      ? []
      : [
          {
            account: { code: "platform_commission_deferred" as const, currency: "RUB" as const },
            side: "credit" as const,
            amount: economics.commission,
            links: saleLinks(authority.platformCommissionComponentId)
          }
        ])
  ];
  const recipe = createUnverifiedFinanceJournalPostingRecipe(
    {
      context,
      authorityRef: {
        kind: authority.kind,
        authorityId: authority.authorityId,
        version: authority.version,
        canonicalDigest: authority.canonicalDigest
      },
      sourceEvidenceRef: projection.sourceEvidenceRef,
      operationSnapshotRef: root.operationSnapshotRef as never,
      entries,
      entrySourceLinks: [null, row.sourceLink, ...(entries.length === 3 ? [null] : [])]
    },
    postingEnvelope
  );
  assertFinanceJournalLinkProofMatchesOperationReceipt(
    {
      proof: recipe.linkProof,
      operationReceipt: root.operationReceipt,
      componentBindings: root.componentBindings as never
    },
    postingEnvelope,
    receiptEnvelope
  );
  return recipe;
}

function assertIdentity(
  context: FinanceJournalPostingContext,
  authority: SaleCapturePostingAuthority,
  receipt: {
    operationId: string;
    sourceKey: FinanceJournalPostingContext["sourceKey"];
    occurredAt: string;
  },
  originalSaleId: string | null
): void {
  if (
    context.operationId !== receipt.operationId ||
    authority.operationId !== receipt.operationId ||
    context.sourceKey.kind !== "order" ||
    context.sourceKey.operation !== "sale_captured" ||
    context.sourceKey.sourceId !== authority.orderEconomics.orderId ||
    context.sourceKey.sourceId !== receipt.sourceKey.sourceId ||
    context.sourceKey.sourceId !== originalSaleId
  ) {
    fail("source_mismatch");
  }
  assertFinancePostingInstantEqual(context.occurredAt, receipt.occurredAt, "invalid_chronology");
}

function fail(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
