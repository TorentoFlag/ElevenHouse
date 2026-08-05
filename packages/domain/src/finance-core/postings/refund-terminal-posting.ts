import type { FinanceJournalEntryInput, FinanceJournalEntryLinks } from "../journal";
import { createFinanceLedgerAccountRef } from "../ledger-chart";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { digestValue } from "../source-lot-operation-receipt-core";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import {
  allocationAuthorityRef,
  assertRefundPostingIdentityChronology,
  createReceiptBoundRefundRecipe,
  readRefundPostingIdentity
} from "./refund-posting-builder-common";
import { projectRefundCumulativeTerminalPosition } from "./refund-cumulative-position";
import { readRefundPostingAllocationContext } from "./refund-posting-allocation-context";
import {
  assertRefundTerminalEvidenceMatchesAllocation,
  readUnverifiedRefundTerminalEvidenceBinding
} from "./refund-posting-evidence";
import { readRefundTerminalAuthority } from "./refund-posting-evidence-codec";
import { projectStandardRefundReceipt } from "./refund-posting-receipt-mapping";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import { readAndAssertRefundOriginalPlatformJournals } from "./refund-original-platform-journal";

export function buildRefundConfirmedPosting(
  input: unknown,
  postingEnvelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
) {
  return buildTerminal(input, "confirmed", postingEnvelope, receiptEnvelope);
}

export function buildRefundFailedPosting(
  input: unknown,
  postingEnvelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
) {
  return buildTerminal(input, "failed", postingEnvelope, receiptEnvelope);
}

function buildTerminal(
  input: unknown,
  operation: "confirmed" | "failed",
  postingEnvelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
) {
  const fields = readExactDataRecord(input, [
    "allocation",
    "resolvedPriorAllocation",
    "resolvedCumulativePosition",
    "fundingTransitionBinding",
    "terminalAuthority",
    "terminalEvidenceBinding",
    "operationReceipt",
    ...(operation === "confirmed" ? (["originalPlatformJournals"] as const) : []),
    "postingIdentity"
  ]);
  const { allocation, resolvedCumulativePosition, fundingTransitionBinding } =
    readRefundPostingAllocationContext(
      {
        allocation: fields.allocation,
        resolvedPriorAllocation: fields.resolvedPriorAllocation,
        resolvedCumulativePosition: fields.resolvedCumulativePosition,
        fundingTransitionBinding: fields.fundingTransitionBinding
      },
      postingEnvelope
    );
  assertRefundTerminalEvidenceMatchesAllocation(
    {
      allocation,
      binding: fields.terminalEvidenceBinding,
      terminalAuthority: fields.terminalAuthority
    },
    postingEnvelope
  );
  const terminalAuthority = readRefundTerminalAuthority(fields.terminalAuthority);
  const terminalEvidenceBinding = readUnverifiedRefundTerminalEvidenceBinding(
    fields.terminalEvidenceBinding,
    postingEnvelope
  );
  const expectedKind = operation === "confirmed" ? "refund_confirmed" : "refund_failed";
  if (terminalAuthority.kind !== expectedKind || fundingTransitionBinding.operation !== operation) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const cumulativePositionDecision = projectRefundCumulativeTerminalPosition(
    allocation,
    resolvedCumulativePosition,
    terminalAuthority
  );
  const occurredAt =
    terminalAuthority.kind === "refund_confirmed"
      ? terminalAuthority.confirmedAt
      : terminalAuthority.failedAt;
  const originalPlatformJournals =
    operation === "confirmed"
      ? readAndAssertRefundOriginalPlatformJournals(
          fields.originalPlatformJournals,
          allocation,
          occurredAt,
          postingEnvelope
        )
      : null;
  const projection = projectStandardRefundReceipt({
    operationReceipt: fields.operationReceipt,
    allocation,
    operation,
    expectedAuthority: {
      kind: expectedKind,
      authorityId: terminalAuthority.authorityId,
      version: terminalAuthority.version,
      evidenceId: terminalAuthority.canonicalEvidenceId,
      canonicalDigest: digestValue(terminalAuthority)
    },
    expectedOccurredAt: occurredAt,
    postingEnvelope,
    receiptEnvelope
  });
  if (
    terminalEvidenceBinding.operationReceiptRef.evidenceId !== projection.receipt.receiptId ||
    terminalEvidenceBinding.operationReceiptRef.canonicalDigest !==
      projection.receipt.canonicalDigest
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const identity = readRefundPostingIdentity(fields.postingIdentity);
  assertRefundPostingIdentityChronology(identity, projection.receipt.occurredAt);
  if (operation === "failed" && projection.rows.length === 0) {
    return Object.freeze({
      kind: "refund_state_only" as const,
      operation,
      authorizationStatus: "unverified" as const,
      atomicityStatus: "unverified" as const,
      reason: "no_payable_lot_reclassification" as const,
      fundingDisposition: "released" as const,
      fundingTransitionBinding,
      cumulativePositionDecision,
      allocationAuthorityRef: allocationAuthorityRef(allocation),
      operationReceiptRef: projection.sourceEvidenceRef,
      operationSnapshotRef: projection.operationSnapshotRef,
      terminalEvidenceBinding,
      componentBindings: projection.componentBindings
    });
  }
  const extraEntries =
    operation === "confirmed" ? confirmedEconomicEntries(allocation) : Object.freeze([]);
  const recipe = createReceiptBoundRefundRecipe({
    projection,
    allocation,
    identity,
    extraEntries,
    postingEnvelope,
    receiptEnvelope
  });
  return Object.freeze({
    kind: "refund_journal" as const,
    operation,
    fundingDisposition: operation === "confirmed" ? ("consumed" as const) : ("released" as const),
    fundingTransitionBinding,
    cumulativePositionDecision,
    recipe,
    operationReceiptRef: projection.sourceEvidenceRef,
    terminalEvidenceBinding,
    componentBindings: projection.componentBindings,
    ...(originalPlatformJournals === null ? {} : { originalPlatformJournals })
  });
}

function confirmedEconomicEntries(
  allocation: RefundPostingAllocationAuthorityV1
): readonly FinanceJournalEntryInput[] {
  const entries: FinanceJournalEntryInput[] = [];
  for (const row of allocation.alreadyPaidComponents) {
    entries.push(
      debit(
        row.treatment.accountCode === "astrologer_recovery_receivable"
          ? createFinanceLedgerAccountRef({
              code: row.treatment.accountCode,
              astrologerUserId: allocation.astrologerUserId,
              currency: "RUB"
            })
          : createFinanceLedgerAccountRef({ code: row.treatment.accountCode, currency: "RUB" }),
        row.amount,
        links(allocation.orderId, row.componentId, row.payableLotId, row.payoutAllocationId)
      )
    );
  }
  for (const row of allocation.inFlightPayoutComponents) {
    entries.push(
      debit(
        createFinanceLedgerAccountRef({
          code: "payout_inflight_refund_bridge",
          refundId: allocation.refundId,
          payoutRequestId: row.payoutRequestId,
          currency: "RUB"
        }),
        row.amount,
        links(allocation.orderId, row.componentId, row.payableLotId, row.payoutAllocationId)
      )
    );
  }
  for (const row of allocation.platformCommissionComponents) {
    entries.push(
      debit(
        createFinanceLedgerAccountRef({ code: row.sourceAccountCode, currency: "RUB" }),
        row.amount,
        links(allocation.orderId, row.componentId, null, null)
      )
    );
  }
  entries.push({
    account: createFinanceLedgerAccountRef({
      code: "arc_provider_clearing",
      arcProviderAccountId: allocation.providerAccount.providerAccountId,
      currency: "RUB"
    }),
    side: "credit",
    amount: allocation.refundAmount,
    links: links(allocation.orderId, allocation.providerClearingComponentId, null, null)
  });
  return Object.freeze(entries);
}

function debit(
  account: FinanceJournalEntryInput["account"],
  amount: FinanceJournalEntryInput["amount"],
  entryLinks: FinanceJournalEntryLinks
): FinanceJournalEntryInput {
  return Object.freeze({ account, side: "debit", amount, links: entryLinks });
}

function links(
  originalSaleId: string,
  componentId: string,
  payableLotId: string | null,
  payoutAllocationId: string | null
): FinanceJournalEntryLinks {
  return Object.freeze({ originalSaleId, componentId, payableLotId, payoutAllocationId });
}
