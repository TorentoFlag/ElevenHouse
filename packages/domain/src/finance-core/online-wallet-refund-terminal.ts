import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";

export type OnlineWalletRefundPendingConsumption = Readonly<{
  refundPendingAllocationId: string;
  rootLotId: string;
  amountMinor: number;
}>;

/** Builds the only successful terminal posting for an already-reserved V2 refund case. */
export function createOnlineWalletRefundPendingConfirmedJournal(input: Readonly<{
  refundCaseId: string;
  orderId: string;
  providerAccountId: string;
  astrologerUserId: string;
  occurredAt: string;
  postedAt: string;
  commissionReversalMinor: number;
  grossAmountMinor: number;
  consumptions: readonly OnlineWalletRefundPendingConsumption[];
}>): FinanceJournalTransaction {
  if (!identifier(input.refundCaseId) || !identifier(input.orderId) || !identifier(input.providerAccountId) || !identifier(input.astrologerUserId) || !minor(input.commissionReversalMinor) || !positive(input.grossAmountMinor) || input.consumptions.length === 0) throw new OnlineWalletRefundTerminalIntegrityError();
  const seen = new Set<string>();
  const payable = input.consumptions.reduce((total, item) => {
    if (!identifier(item.refundPendingAllocationId) || !identifier(item.rootLotId) || !positive(item.amountMinor) || seen.has(item.refundPendingAllocationId)) throw new OnlineWalletRefundTerminalIntegrityError();
    seen.add(item.refundPendingAllocationId); return total + item.amountMinor;
  }, 0);
  if (payable + input.commissionReversalMinor !== input.grossAmountMinor) throw new OnlineWalletRefundTerminalIntegrityError();
  const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
  return createFinanceJournalTransaction({
    id: `online-wallet-refund:${input.refundCaseId}`,
    sourceKey: { kind: "refund", sourceId: input.refundCaseId, operation: "confirmed" },
    occurredAt: input.occurredAt, postedAt: input.postedAt, reversesTransactionId: null,
    entries: [
      ...(input.commissionReversalMinor > 0 ? [{ account: { code: "platform_commission_revenue" as const, currency: "RUB" as const }, side: "debit" as const, amount: money(input.commissionReversalMinor), links: links(null, null) }] : []),
      ...input.consumptions.map((item) => ({ account: { code: "astrologer_refund_pending" as const, astrologerUserId: input.astrologerUserId, currency: "RUB" as const }, side: "debit" as const, amount: money(item.amountMinor), links: links(item.rootLotId, item.refundPendingAllocationId) })),
      { account: { code: "arc_provider_clearing" as const, arcProviderAccountId: input.providerAccountId, currency: "RUB" as const }, side: "credit" as const, amount: money(input.grossAmountMinor), links: links(null, null) }
    ]
  });
}

export class OnlineWalletRefundTerminalIntegrityError extends Error { readonly code = "online_wallet_refund_terminal_integrity_error" as const; constructor() { super("Online-wallet refund terminal posting is invalid"); this.name = "OnlineWalletRefundTerminalIntegrityError"; } }
function links(componentId: string | null, payableLotId: string | null) { return Object.freeze({ originalSaleId: null, componentId, payableLotId, payoutAllocationId: null }); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value; }
function minor(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function positive(value: unknown): value is number { return minor(value) && value > 0; }
