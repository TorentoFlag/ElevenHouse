import type { Money } from "../../money";
import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { assertPayableLotPostingBindingMatchesReceipt } from "./hold-payout-receipt-binding";
import type { UnverifiedPayableLotPostingAuthorityBinding } from "./hold-payout-posting-types";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";

type PayoutApprovalRequestExpectation = Readonly<{
  payoutRequestId: string;
  astrologerUserId: string;
  amount: Money;
  approvedAt: string;
  requestReceiptBinding: UnverifiedPayableLotPostingAuthorityBinding;
}>;

export function assertPayoutApprovalMatchesRequestReceipt(
  input: unknown,
  expected: PayoutApprovalRequestExpectation,
  postingEnvelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
): void {
  const fields = readExactDataRecord(input, ["operationReceipt", "componentBindings"]);
  const projection = projectUnverifiedReceiptLinkedPostingRows(
    {
      operationReceipt: fields.operationReceipt,
      componentBindings: fields.componentBindings
    },
    postingEnvelope,
    receiptEnvelope
  );
  const receipt = projection.receipt;
  assertPayableLotPostingBindingMatchesReceipt(expected.requestReceiptBinding, receipt);
  const requestAuthorityRefs = receipt.authorityRefs.filter(
    (authorityRef) => authorityRef.kind === "payout_request"
  );
  const requestAuthorityRef = requestAuthorityRefs[0];
  if (
    receipt.operationKind !== "payout_requested" ||
    receipt.sourceKey.kind !== "payout" ||
    receipt.sourceKey.operation !== "requested" ||
    receipt.sourceKey.sourceId !== expected.payoutRequestId ||
    receipt.astrologerUserId !== expected.astrologerUserId ||
    receipt.currency !== expected.amount.currency ||
    compareFinancePostingInstants(expected.approvedAt, receipt.occurredAt) < 0 ||
    receipt.authorityRefs.length !== 1 ||
    requestAuthorityRefs.length !== 1 ||
    requestAuthorityRef?.kind !== "payout_request" ||
    requestAuthorityRef.evidenceId !== null ||
    projection.rows.length === 0 ||
    projection.rows.some(
      (row) =>
        !("astrologerUserId" in row.entry.account) ||
        row.entry.account.astrologerUserId !== receipt.astrologerUserId ||
        row.entry.account.currency !== receipt.currency ||
        row.entry.amount.currency !== receipt.currency ||
        row.entry.links.payoutAllocationId === null ||
        (row.entry.side === "debit" && row.entry.account.code !== "astrologer_available") ||
        (row.entry.side === "credit" && row.entry.account.code !== "astrologer_payout_pending")
    )
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const debitedMinor = projection.rows.reduce(
    (sum, row) => sum + (row.entry.side === "debit" ? BigInt(row.entry.amount.amountMinor) : 0n),
    0n
  );
  const creditedMinor = projection.rows.reduce(
    (sum, row) => sum + (row.entry.side === "credit" ? BigInt(row.entry.amount.amountMinor) : 0n),
    0n
  );
  if (debitedMinor !== creditedMinor || debitedMinor !== BigInt(expected.amount.amountMinor)) {
    throw new FinancePostingIntegrityError("amount_mismatch");
  }
}
