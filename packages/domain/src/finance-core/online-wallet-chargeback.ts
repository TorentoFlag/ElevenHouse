import { createFinanceJournalTransaction, type FinanceJournalTransaction } from "./journal";

export class OnlineWalletChargebackIntegrityError extends Error {
  readonly code = "online_wallet_chargeback_integrity_error";

  constructor() {
    super("Online wallet chargeback journal input is invalid");
    this.name = "OnlineWalletChargebackIntegrityError";
  }
}

/**
 * Creates the V2 provisional principal loss when ArcPay reports a chargeback.  The provider has
 * withdrawn this principal, but its commercial allocation is not known yet: it remains in the
 * dedicated chargeback suspense account.  In particular this operation does not reverse revenue,
 * consume an astrologer's payable, create a debtor balance, or rewrite an in-flight payout.
 *
 * The provider fee is deliberately absent. It is an ElevenHouse expense only when separately
 * evidenced, and a later win/loss resolution is a separate source operation.
 */
export function createOnlineWalletChargebackConfirmedJournal(input: Readonly<{
  chargebackCaseId: string;
  orderId: string;
  providerAccountId: string;
  occurredAt: string;
  postedAt: string;
  grossPrincipalMinor: number;
}>): FinanceJournalTransaction {
  identifier(input.chargebackCaseId);
  identifier(input.orderId);
  identifier(input.providerAccountId);
  positiveMinor(input.grossPrincipalMinor);

  const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
  return createFinanceJournalTransaction({
    id: `online-wallet-chargeback:${input.chargebackCaseId}`,
    sourceKey: { kind: "chargeback", sourceId: input.chargebackCaseId, operation: "confirmed" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries: [
      {
        account: {
          code: "chargeback_principal_suspense" as const,
          arcProviderAccountId: input.providerAccountId,
          currency: "RUB" as const
        },
        side: "debit" as const,
        amount: money(input.grossPrincipalMinor),
        links: Object.freeze({
          originalSaleId: input.orderId,
          componentId: null,
          payableLotId: null,
          payoutAllocationId: null
        })
      },
      {
        account: {
          code: "arc_provider_clearing" as const,
          arcProviderAccountId: input.providerAccountId,
          currency: "RUB" as const
        },
        side: "credit" as const,
        amount: money(input.grossPrincipalMinor),
        links: emptyLinks()
      }
    ]
  });
}

/**
 * The provider has reversed its provisional debit. This is intentionally a pure provider
 * reversal: the original payable source was frozen, never consumed, so a won dispute must not
 * invent a wallet movement or a new astrologer balance.
 */
export function createOnlineWalletChargebackWonJournal(input: Readonly<{
  chargebackCaseId: string;
  orderId: string;
  providerAccountId: string;
  occurredAt: string;
  postedAt: string;
  grossPrincipalMinor: number;
}>): FinanceJournalTransaction {
  identifier(input.chargebackCaseId);
  identifier(input.orderId);
  identifier(input.providerAccountId);
  positiveMinor(input.grossPrincipalMinor);
  const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
  return createFinanceJournalTransaction({
    id: `online-wallet-chargeback-won:${input.chargebackCaseId}`,
    sourceKey: { kind: "chargeback", sourceId: input.chargebackCaseId, operation: "won" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries: [
      {
        account: { code: "arc_provider_clearing" as const, arcProviderAccountId: input.providerAccountId, currency: "RUB" as const },
        side: "debit" as const,
        amount: money(input.grossPrincipalMinor),
        links: emptyLinks()
      },
      {
        account: { code: "chargeback_principal_suspense" as const, arcProviderAccountId: input.providerAccountId, currency: "RUB" as const },
        side: "credit" as const,
        amount: money(input.grossPrincipalMinor),
        links: { ...emptyLinks(), originalSaleId: input.orderId }
      }
    ]
  });
}

/**
 * A terminal loss can be charged to ElevenHouse only after the persistence boundary has proved
 * that no unconsumed V2 payable source remains. This covers the important already-paid payout
 * case without silently re-taking money from an astrologer.
 */
export function createOnlineWalletChargebackPlatformLossJournal(input: Readonly<{
  chargebackCaseId: string;
  orderId: string;
  providerAccountId: string;
  occurredAt: string;
  postedAt: string;
  grossPrincipalMinor: number;
}>): FinanceJournalTransaction {
  identifier(input.chargebackCaseId);
  identifier(input.orderId);
  identifier(input.providerAccountId);
  positiveMinor(input.grossPrincipalMinor);
  const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
  const links = Object.freeze({ originalSaleId: input.orderId, componentId: null, payableLotId: null, payoutAllocationId: null });
  return createFinanceJournalTransaction({
    id: `online-wallet-chargeback-loss:${input.chargebackCaseId}`,
    sourceKey: { kind: "chargeback", sourceId: input.chargebackCaseId, operation: "principal_allocated" },
    occurredAt: input.occurredAt,
    postedAt: input.postedAt,
    reversesTransactionId: null,
    entries: [
      {
        account: { code: "platform_chargeback_loss" as const, currency: "RUB" as const },
        side: "debit" as const,
        amount: money(input.grossPrincipalMinor),
        links
      },
      {
        account: { code: "chargeback_principal_suspense" as const, arcProviderAccountId: input.providerAccountId, currency: "RUB" as const },
        side: "credit" as const,
        amount: money(input.grossPrincipalMinor),
        links
      }
    ]
  });
}

function emptyLinks() {
  return Object.freeze({
    originalSaleId: null,
    componentId: null,
    payableLotId: null,
    payoutAllocationId: null
  });
}

function identifier(value: string): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 200
  ) {
    throw new OnlineWalletChargebackIntegrityError();
  }
}

function positiveMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new OnlineWalletChargebackIntegrityError();
}
