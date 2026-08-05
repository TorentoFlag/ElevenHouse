import { z } from "@elevenhouse/validation";
import type { FinanceAuthorizationCanonicalPayload } from "./finance-authorization";
import { moneySchema, nonZeroMoneySchema } from "./money";
import { platformTariffBillingCycleSchema } from "./platform-tariffs";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const financeDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/**
 * A reference to a proof that has already been sealed in the finance private-object store.
 * This is deliberately a verified artifact identity, never an uploaded blob, data URL, or
 * arbitrary proof text supplied on the paid-status command.
 */
export const payoutPaidProofArtifactSchema = z
  .object({
    artifactId: z.string().trim().min(1).max(160),
    sha256Digest: financeDigestSchema,
    byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
  })
  .strict();
export type PayoutPaidProofArtifact = z.infer<typeof payoutPaidProofArtifactSchema>;

/**
 * Trusted identity returned only after the admin API has sealed a bank document in the private
 * finance store and registered it against the configured ElevenHouse cash pool.
 */
export const payoutBankEvidenceUploadResponseSchema = payoutPaidProofArtifactSchema
  .extend({
    contentType: z.enum(["application/pdf", "image/png", "image/jpeg"])
  })
  .strict();
export type PayoutBankEvidenceUploadResponse = z.infer<
  typeof payoutBankEvidenceUploadResponseSchema
>;

export const payoutRequestStatusValues = [
  "requested",
  "under_review",
  "approved",
  "processing_manual",
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

export const payoutMethodValues = ["manual_bank_transfer"] as const;
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
    version: z.number().int().positive()
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
    destinationKind: z.enum(["bank_card", "bank_account"]),
    recipientName: z.string().trim().min(1).max(160),
    bankName: z.string().trim().min(1).max(160),
    /** Full card/account value is sealed before persistence and is never returned by the API. */
    destinationValue: z.string().trim().min(8).max(128),
    idempotencyKey: z.string().min(1).max(160)
  })
  .strict();
export type CreateManualBankTransferPayoutMethod = z.infer<
  typeof createManualBankTransferPayoutMethodSchema
>;

export const astrologerFinancePeriodSummarySchema = z
  .object({
    periodStart: isoDateTimeSchema,
    periodEndExclusive: isoDateTimeSchema,
    grossSalesAmount: moneySchema,
    platformFeeAmount: moneySchema,
    netSalesAmount: moneySchema,
    refundsAmount: moneySchema,
    payoutsAmount: moneySchema,
    saleCount: z.number().int().min(0),
    refundCount: z.number().int().min(0),
    payoutCount: z.number().int().min(0),
    recurringRevenueAmount: moneySchema.nullable(),
    recurringRevenueUnavailableReason: z.enum(["client_subscriptions_not_implemented"]).nullable()
  })
  .strict();
export type AstrologerFinancePeriodSummary = z.infer<typeof astrologerFinancePeriodSummarySchema>;

/**
 * The financial dashboard presents the exact tariff version chosen by the
 * astrologer. It must never infer a fallback tariff or read mutable catalog
 * terms when a subscription snapshot exists.
 */
export const astrologerFinanceCurrentTariffSchema = z
  .object({
    tariffSeriesId: z.string().min(1).max(160),
    tariffVersion: z.number().int().positive(),
    name: z.string().min(1).max(120),
    price: moneySchema,
    commissionBps: z.number().int().min(0).max(10_000),
    billingCycle: platformTariffBillingCycleSchema,
    state: z.enum([
      "incomplete_setup",
      "awaiting_initial_payment",
      "active",
      "past_due",
      "cancelled",
      "expired"
    ]),
    startsAt: isoDateTimeSchema.nullable(),
    endsAt: isoDateTimeSchema.nullable()
  })
  .strict();
export type AstrologerFinanceCurrentTariff = z.infer<typeof astrologerFinanceCurrentTariffSchema>;

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
      .nullable(),
    periodSummary: astrologerFinancePeriodSummarySchema,
    currentTariff: astrologerFinanceCurrentTariffSchema.nullable()
  })
  .strict();
export type AstrologerFinanceOverviewResponse = z.infer<
  typeof astrologerFinanceOverviewResponseSchema
>;

export const adminPayoutStatusUpdateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("under_review"),
      expectedVersion: z.number().int().positive(),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("approved"),
      expectedVersion: z.number().int().positive(),
      authorizationId: uuidSchema,
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("processing_manual"),
      expectedVersion: z.number().int().positive(),
      authorizationId: uuidSchema,
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("paid"),
      expectedVersion: z.number().int().positive(),
      authorizationId: uuidSchema,
      externalReference: z.string().min(1).max(240),
      transferredAt: isoDateTimeSchema,
      proofArtifact: payoutPaidProofArtifactSchema,
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      expectedVersion: z.number().int().positive(),
      failureReason: z.string().min(1).max(2_000),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("rejected"),
      expectedVersion: z.number().int().positive(),
      failureReason: z.string().min(1).max(2_000),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict(),
  z
    .object({
      status: z.literal("cancelled"),
      expectedVersion: z.number().int().positive(),
      adminNote: z.string().min(1).max(2_000).nullable().optional()
    })
    .strict()
]);
export type AdminPayoutStatusUpdate = z.infer<typeof adminPayoutStatusUpdateSchema>;

/**
 * The mutable business fields that are signed before the server has issued an authorization ID.
 * `authorizationId` is deliberately excluded: it is the result of this ceremony, not its input.
 */
export type PayoutStatusAuthorizationInput =
  | Omit<Extract<AdminPayoutStatusUpdate, { readonly status: "approved" }>, "authorizationId">
  | Omit<
      Extract<AdminPayoutStatusUpdate, { readonly status: "processing_manual" }>,
      "authorizationId"
    >
  | Omit<Extract<AdminPayoutStatusUpdate, { readonly status: "paid" }>, "authorizationId">;

/**
 * Canonical public payload for the WebAuthn ceremony that protects an
 * irreversible payout transition. The aggregate ID and expected version are
 * bound separately by the authorization protocol; every mutable command field
 * is included here so the verified grant cannot be replayed for altered
 * instructions.
 */
export function createPayoutStatusAuthorizationPayload(
  update: PayoutStatusAuthorizationInput
): FinanceAuthorizationCanonicalPayload {
  switch (update.status) {
    case "approved":
    case "processing_manual":
      return {
        status: update.status,
        adminNote: update.adminNote ?? null
      } as const;
    case "paid":
      return {
        status: update.status,
        externalReference: update.externalReference,
        transferredAt: update.transferredAt,
        proofArtifact: update.proofArtifact,
        adminNote: update.adminNote ?? null
      } as const;
  }
}

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
