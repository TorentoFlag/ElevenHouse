import { z } from "@elevenhouse/validation";
import { moneySchema, nonZeroMoneySchema, rubCurrencySchema } from "./money";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const ledgerMetadataSchema = z.record(z.string().min(1).max(80), z.unknown());

export const walletBalanceBucketValues = [
  "pending",
  "available",
  "reserved",
  "payout_pending",
  "negative_balance"
] as const;
export const walletBalanceBucketSchema = z.enum(walletBalanceBucketValues);
export type WalletBalanceBucket = z.infer<typeof walletBalanceBucketSchema>;

export const ledgerAccountTypeValues = [
  "platform_clearing",
  "platform_revenue",
  "provider_fees",
  "astrologer_pending",
  "astrologer_available",
  "astrologer_reserved",
  "astrologer_payout_pending",
  "astrologer_negative_balance",
  "payout_clearing"
] as const;
export const ledgerAccountTypeSchema = z.enum(ledgerAccountTypeValues);
export type LedgerAccountType = z.infer<typeof ledgerAccountTypeSchema>;

export const ledgerEntrySideValues = ["debit", "credit"] as const;
export const ledgerEntrySideSchema = z.enum(ledgerEntrySideValues);
export type LedgerEntrySide = z.infer<typeof ledgerEntrySideSchema>;

export const ledgerOperationTypeValues = [
  "sale_captured",
  "platform_fee_recorded",
  "provider_fee_recorded",
  "hold_created",
  "funds_released",
  "reserve_created",
  "reserve_released",
  "payout_reserved",
  "payout_paid",
  "payout_failed",
  "refund_recorded",
  "chargeback_recorded",
  "manual_adjustment"
] as const;
export const ledgerOperationTypeSchema = z.enum(ledgerOperationTypeValues);
export type LedgerOperationType = z.infer<typeof ledgerOperationTypeSchema>;

export const financeOperationKindValues = ["sale", "payout", "refund", "adjustment"] as const;
export const financeOperationKindSchema = z.enum(financeOperationKindValues);
export type FinanceOperationKind = z.infer<typeof financeOperationKindSchema>;

export const financeOperationDirectionValues = ["inflow", "outflow", "neutral"] as const;
export const financeOperationDirectionSchema = z.enum(financeOperationDirectionValues);
export type FinanceOperationDirection = z.infer<typeof financeOperationDirectionSchema>;

export const ledgerEntrySchema = z
  .object({
    id: uuidSchema,
    ledgerAccountId: uuidSchema,
    accountType: ledgerAccountTypeSchema,
    astrologerUserId: uuidSchema.nullable(),
    balanceBucket: walletBalanceBucketSchema.nullable(),
    side: ledgerEntrySideSchema,
    amount: nonZeroMoneySchema,
    metadata: ledgerMetadataSchema
  })
  .strict();
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerTransactionSchema = z
  .object({
    id: uuidSchema,
    operationType: ledgerOperationTypeSchema,
    orderId: uuidSchema.nullable(),
    payoutRequestId: uuidSchema.nullable(),
    occurredAt: isoDateTimeSchema,
    postedAt: isoDateTimeSchema,
    metadata: ledgerMetadataSchema,
    entries: z.array(ledgerEntrySchema).min(2).max(32)
  })
  .superRefine((value, context) => {
    const totalsByCurrency = new Map<string, { debit: number; credit: number }>();
    for (const entry of value.entries) {
      const totals = totalsByCurrency.get(entry.amount.currency) ?? { debit: 0, credit: 0 };
      totals[entry.side] += entry.amount.amountMinor;
      totalsByCurrency.set(entry.amount.currency, totals);
    }

    for (const [currency, totals] of totalsByCurrency) {
      if (totals.debit !== totals.credit) {
        context.addIssue({
          code: "custom",
          message: `Ledger transaction must balance for ${currency}`
        });
      }
    }
  })
  .strict();
export type LedgerTransaction = z.infer<typeof ledgerTransactionSchema>;

export const walletBalanceResponseSchema = z
  .object({
    astrologerUserId: uuidSchema,
    pending: moneySchema,
    available: moneySchema,
    reserved: moneySchema,
    payoutPending: moneySchema,
    negativeBalance: moneySchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();
export type WalletBalanceResponse = z.infer<typeof walletBalanceResponseSchema>;

export const ledgerOperationListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(240).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    operationType: ledgerOperationTypeSchema.optional(),
    balanceBucket: walletBalanceBucketSchema.optional()
  })
  .strict();
export type LedgerOperationListQuery = z.infer<typeof ledgerOperationListQuerySchema>;

export const ledgerOperationAmountBreakdownSchema = z
  .object({
    grossAmountMinor: z.number().int().safe().nullable(),
    platformFeeAmountMinor: z.number().int().safe().nullable(),
    netAmountMinor: z.number().int().safe(),
    currency: rubCurrencySchema
  })
  .strict();
export type LedgerOperationAmountBreakdown = z.infer<typeof ledgerOperationAmountBreakdownSchema>;

export const ledgerOperationSchema = z
  .object({
    id: uuidSchema,
    operationType: ledgerOperationTypeSchema,
    kind: financeOperationKindSchema,
    direction: financeOperationDirectionSchema,
    amount: moneySchema,
    signedAmountMinor: z.number().int().safe(),
    amountBreakdown: ledgerOperationAmountBreakdownSchema.nullable(),
    balanceBucket: walletBalanceBucketSchema.nullable(),
    orderId: uuidSchema.nullable(),
    payoutRequestId: uuidSchema.nullable(),
    occurredAt: isoDateTimeSchema,
    postedAt: isoDateTimeSchema,
    metadata: ledgerMetadataSchema
  })
  .strict();
export type LedgerOperation = z.infer<typeof ledgerOperationSchema>;

export const ledgerOperationListResponseSchema = z
  .object({
    operations: z.array(ledgerOperationSchema).max(100),
    nextCursor: z.string().min(1).max(240).nullable()
  })
  .strict();
export type LedgerOperationListResponse = z.infer<typeof ledgerOperationListResponseSchema>;
