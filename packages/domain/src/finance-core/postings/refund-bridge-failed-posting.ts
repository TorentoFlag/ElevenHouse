import type { FinanceJournalEntryInput } from "../journal";
import { createFinanceLedgerAccountRef } from "../ledger-chart";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import {
  createReceiptBoundRefundRecipe,
  readRefundPostingIdentity
} from "./refund-posting-builder-common";
import {
  matchBridgeAuthority,
  readBridgeFailedAuthority,
  readConfirmedBridgeContext
} from "./refund-posting-bridge-common";
import { projectRefundBridgeFailedReceipt } from "./refund-posting-bridge-receipt";
import { readPayoutNoTransferAuthority } from "./payout-source-authority-codec";

export function buildRefundBridgePayoutFailedPosting(
  input: unknown,
  postingEnvelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
) {
  const fields = readExactDataRecord(input, [
    "allocation",
    "resolvedPriorAllocation",
    "resolvedCumulativePosition",
    "fundingTransitionBinding",
    "confirmedTerminalAuthority",
    "confirmedEvidenceBinding",
    "bridgeAuthority",
    "payoutOutcomeAuthority",
    "operationReceipt",
    "postingIdentity"
  ]);
  const context = readConfirmedBridgeContext(
    {
      allocation: fields.allocation,
      resolvedPriorAllocation: fields.resolvedPriorAllocation,
      resolvedCumulativePosition: fields.resolvedCumulativePosition,
      fundingTransitionBinding: fields.fundingTransitionBinding,
      confirmedTerminalAuthority: fields.confirmedTerminalAuthority,
      confirmedEvidenceBinding: fields.confirmedEvidenceBinding
    },
    postingEnvelope
  );
  const authority = readBridgeFailedAuthority(fields.bridgeAuthority);
  const payoutOutcomeAuthority = readPayoutNoTransferAuthority(fields.payoutOutcomeAuthority);
  if (!sameCanonicalFinancePostingValue(authority.payoutOutcomeAuthority, payoutOutcomeAuthority)) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const component = matchBridgeAuthority(authority, context);
  const projection = projectRefundBridgeFailedReceipt({
    operationReceipt: fields.operationReceipt,
    allocation: context.allocation,
    component,
    authority,
    postingEnvelope,
    receiptEnvelope
  });
  const extraEntry: FinanceJournalEntryInput = Object.freeze({
    account: createFinanceLedgerAccountRef({
      code: "payout_inflight_refund_bridge",
      refundId: context.allocation.refundId,
      payoutRequestId: component.payoutRequestId,
      currency: "RUB"
    }),
    side: "credit",
    amount: component.amount,
    links: Object.freeze({
      originalSaleId: context.allocation.orderId,
      componentId: component.componentId,
      payableLotId: component.payableLotId,
      payoutAllocationId: component.payoutAllocationId
    })
  });
  const recipe = createReceiptBoundRefundRecipe({
    projection,
    allocation: context.allocation,
    identity: readRefundPostingIdentity(fields.postingIdentity),
    extraEntries: [extraEntry],
    postingEnvelope,
    receiptEnvelope
  });
  return Object.freeze({
    kind: "refund_journal" as const,
    operation: "bridge_payout_failed" as const,
    fundingDisposition: "bridge_closed_pre_transfer" as const,
    recipe,
    operationReceiptRef: projection.sourceEvidenceRef,
    confirmedEvidenceBinding: context.binding,
    componentBindings: projection.componentBindings,
    fundingTransitionBinding: context.fundingTransitionBinding,
    cumulativePositionDecision: context.cumulativePositionDecision
  });
}
