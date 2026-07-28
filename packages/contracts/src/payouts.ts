import { z } from "@elevenhouse/validation";
import { moneySchema, nonZeroMoneySchema } from "./money";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();

export const payoutRequestStatusValues = [
  "requested",
  "under_review",
  "approved",
  "processing_manual",
  "processing_provider",
  "paid",
  "failed",
  "rejected",
  "cancelled"
] as const;
export const payoutRequestStatusSchema = z.enum(payoutRequestStatusValues);
export type PayoutRequestStatus = z.infer<typeof payoutRequestStatusSchema>;

export const adminPayoutQueueStatusFilterValues = [
  "open",
  "ready",
  "processing",
  "failed",
  "terminal",
  "all"
] as const;
export const adminPayoutQueueStatusFilterSchema = z.enum(adminPayoutQueueStatusFilterValues);
export type AdminPayoutQueueStatusFilter = z.infer<typeof adminPayoutQueueStatusFilterSchema>;

export const payoutMethodValues = ["manual_bank_transfer", "arc_pay_provider"] as const;
export const payoutMethodSchema = z.enum(payoutMethodValues);
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

export const payoutMethodResponseSchema = z
  .object({
    id: uuidSchema,
    astrologerUserId: uuidSchema,
    method: payoutMethodSchema,
    currency: moneySchema.shape.currency,
    displayName: z.string().min(1).max(160),
    isDefault: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();
export type PayoutMethodResponse = z.infer<typeof payoutMethodResponseSchema>;

export const payoutRequestResponseSchema = z
  .object({
    id: uuidSchema,
    astrologerUserId: uuidSchema,
    status: payoutRequestStatusSchema,
    amount: nonZeroMoneySchema,
    method: payoutMethodSchema,
    requestedAt: isoDateTimeSchema,
    reviewedAt: isoDateTimeSchema.nullable(),
    completedAt: isoDateTimeSchema.nullable(),
    adminUserId: uuidSchema.nullable(),
    adminNote: z.string().min(1).max(2_000).nullable(),
    failureReason: z.string().min(1).max(2_000).nullable(),
    externalReference: z.string().min(1).max(240).nullable(),
    transferredAt: isoDateTimeSchema.nullable(),
    providerPayoutId: z.string().min(1).max(160).nullable()
  })
  .superRefine((value, context) => {
    if (value.status === "paid") {
      if (!value.externalReference) {
        context.addIssue({
          code: "custom",
          message: "Paid payout requests must include an external transfer reference"
        });
      }

      if (!value.transferredAt) {
        context.addIssue({
          code: "custom",
          message: "Paid payout requests must include transfer timestamp"
        });
      }
    }

    if ((value.status === "failed" || value.status === "rejected") && !value.failureReason) {
      context.addIssue({
        code: "custom",
        message: "Failed or rejected payout requests must include a failure reason"
      });
    }
  })
  .strict();
export type PayoutRequestResponse = z.infer<typeof payoutRequestResponseSchema>;

export const adminPayoutRequestResponseSchema = payoutRequestResponseSchema
  .extend({
    blockedByChargeback: z.boolean()
  })
  .strict();
export type AdminPayoutRequestResponse = z.infer<typeof adminPayoutRequestResponseSchema>;

export const createPayoutRequestSchema = z
  .object({
    amount: nonZeroMoneySchema,
    method: payoutMethodSchema,
    idempotencyKey: z.string().min(1).max(160)
  })
  .strict();
export type CreatePayoutRequest = z.infer<typeof createPayoutRequestSchema>;

export const createManualBankTransferPayoutMethodSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    recipientName: z.string().trim().min(1).max(160),
    bankName: z.string().trim().min(1).max(160),
    accountNumberLast4: z
      .string()
      .trim()
      .regex(/^\d{4}$/),
    details: z.record(z.string().min(1).max(80), z.unknown()).optional(),
    idempotencyKey: z.string().min(1).max(160)
  })
  .strict();
export type CreateManualBankTransferPayoutMethod = z.infer<
  typeof createManualBankTransferPayoutMethodSchema
>;

export const astrologerFinanceOverviewResponseSchema = z
  .object({
    balance: z
      .object({
        astrologerUserId: uuidSchema,
        pending: moneySchema,
        available: moneySchema,
        reserved: moneySchema,
        payoutPending: moneySchema,
        negativeBalance: moneySchema,
        updatedAt: isoDateTimeSchema
      })
      .strict(),
    defaultPayoutMethod: payoutMethodResponseSchema.nullable(),
    recentPayoutRequests: z.array(payoutRequestResponseSchema),
    canRequestPayout: z.boolean(),
    minimumPayoutAmount: moneySchema,
    payoutRequestUnavailableReason: z
      .enum(["payout_method_required", "insufficient_available_balance"])
      .nullable()
  })
  .strict();
export type AstrologerFinanceOverviewResponse = z.infer<
  typeof astrologerFinanceOverviewResponseSchema
>;

export const adminPayoutStatusUpdateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("under_review"),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("approved"),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("processing_manual"),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("processing_provider"),
      adminNote: z.string().min(1).max(2_000).nullable().optional(),
      providerPayoutId: z.string().min(1).max(160).optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("paid"),
      externalReference: z.string().min(1).max(240),
      transferredAt: isoDateTimeSchema,
      adminNote: z.string().min(1).max(2_000).nullable().optional(),
      providerPayoutId: z.string().min(1).max(160).optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failureReason: z.string().min(1).max(2_000),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("rejected"),
      failureReason: z.string().min(1).max(2_000),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("cancelled"),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict()
]);
export type AdminPayoutStatusUpdate = z.infer<typeof adminPayoutStatusUpdateSchema>;

export const adminPayoutQueueSummarySchema = z
  .object({
    requestedCount: z.number().int().min(0),
    underReviewCount: z.number().int().min(0),
    processingCount: z.number().int().min(0),
    chargebackBlockedCount: z.number().int().min(0),
    readyToPayAmount: moneySchema,
    processingAmount: moneySchema,
    chargebackBlockedAmount: moneySchema
  })
  .strict();
export type AdminPayoutQueueSummary = z.infer<typeof adminPayoutQueueSummarySchema>;

export const adminPayoutQueueResponseSchema = z
  .object({
    summary: adminPayoutQueueSummarySchema,
    requests: z.array(adminPayoutRequestResponseSchema)
  })
  .strict();
export type AdminPayoutQueueResponse = z.infer<typeof adminPayoutQueueResponseSchema>;
