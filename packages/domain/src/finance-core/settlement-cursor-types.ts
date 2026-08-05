import type { ProviderAccountIdentityBinding } from "./provider-account-binding";

export const financeSettlementStreamValues = ["settlement_ledger", "settlement_payouts"] as const;
export type FinanceSettlementStream = (typeof financeSettlementStreamValues)[number];

export type FinanceSettlementCursorKey = Readonly<{
  providerAccount: ProviderAccountIdentityBinding;
  stream: FinanceSettlementStream;
}>;

export type FinanceSettlementCursorWindow = Readonly<{
  startAt: string;
  endAt: string;
  nextPageCursor: string | null;
  checkpointedPageCount: number;
  maxPageCount: number;
}>;

export type FinanceSettlementCursorLease = Readonly<{
  ownerId: string;
  token: string;
  fencingToken: number;
  claimedAt: string;
  expiresAt: string;
}>;

export type FinanceSettlementCursor = Readonly<{
  key: FinanceSettlementCursorKey;
  serializedKey: string;
  initialBackfillStart: string;
  overlapSeconds: number;
  highWaterMark: string;
  activeWindow: FinanceSettlementCursorWindow | null;
  lease: FinanceSettlementCursorLease | null;
  fencingToken: number;
  windowGeneration: number;
  version: number;
  updatedAt: string;
}>;

export type SettlementCursorLeaseCredential = Readonly<{
  leaseOwnerId: string;
  leaseToken: string;
  fencingToken: number;
}>;

export type SettlementCursorPageFetchPlan = Readonly<{
  cursorKey: FinanceSettlementCursorKey;
  expectedCursorVersion: number;
  fencingToken: number;
  checkpointKey: SettlementPageCheckpointKey;
  windowStart: string;
  windowEnd: string;
  pageCursor: string | null;
}>;

export type SettlementPageCheckpointKey = Readonly<{
  cursorKey: FinanceSettlementCursorKey;
  windowGeneration: number;
  providerPageCursor: string | null;
}>;

export type ProviderSettlementEntryKey = Readonly<{
  providerAccount: ProviderAccountIdentityBinding;
  providerEntryId: string;
}>;

export type ProviderSettlementPayoutKey = Readonly<{
  providerAccount: ProviderAccountIdentityBinding;
  providerPayoutId: string;
}>;

export type LosslessSettlementEntry = Readonly<{
  key: ProviderSettlementEntryKey;
  amountMinor: string;
  currency: string;
  direction: string;
  entryType: string;
  referenceType: string;
  referenceId: string;
  feeAmountMinor: string | null;
  balanceAfterMinor: string | null;
  occurredAt: string | null;
  organizationId: string | null;
  terminalId: string | null;
  bankTerminalId: string | null;
  bankCode: string | null;
  bankRrn: string | null;
  bankAuthCode: string | null;
  bankInternalReference: string | null;
  settlementStatus: string | null;
  rawPayloadDigest: string;
}>;

/** ArcPay merchant payout history is provider settlement data, never an astrologer payout. */
export type LosslessSettlementPayout = Readonly<{
  key: ProviderSettlementPayoutKey;
  amountMinor: string;
  currency: string;
  status: string;
  payoutMethod: string | null;
  bankCode: string | null;
  bankTerminalId: string | null;
  providerBankPayoutId: string | null;
  bankPayoutStatus: string | null;
  initiatedAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  rawPayloadDigest: string;
}>;

export class FinanceSettlementCursorIntegrityError extends Error {
  readonly code = "finance_settlement_cursor_integrity_error";

  constructor() {
    super("Finance settlement cursor violates restart, lease, or provider-scope invariants");
    this.name = "FinanceSettlementCursorIntegrityError";
  }
}
