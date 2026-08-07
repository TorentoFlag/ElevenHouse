import { z } from "@elevenhouse/validation";
import { moneySchema } from "./money";
import { walletBalanceResponseSchema } from "./wallet";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Expected an HTTPS URL"
  });
const providerMetadataSchema = z.record(z.string().min(1).max(80), z.unknown());
const fiscalBuyerContactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("email"),
    value: z.string().trim().min(1).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  }).strict(),
  z.object({
    kind: z.literal("phone"),
    value: z.string().regex(/^\+[1-9]\d{1,14}$/)
  }).strict()
]);

export const financePaymentProviderValues = ["arc_pay"] as const;
export const financePaymentProviderSchema = z.enum(financePaymentProviderValues);
export type FinancePaymentProvider = z.infer<typeof financePaymentProviderSchema>;

export const paymentProviderEnvironmentValues = ["sandbox", "live"] as const;
export const paymentProviderEnvironmentSchema = z.enum(paymentProviderEnvironmentValues);
export type PaymentProviderEnvironment = z.infer<typeof paymentProviderEnvironmentSchema>;

export const paymentAttemptStatusValues = [
  "created",
  "checkout_opened",
  "pending",
  "authorized",
  "captured",
  "settled",
  "failed",
  "declined",
  "timeout",
  "expired",
  "voided",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;
export const paymentAttemptStatusSchema = z.enum(paymentAttemptStatusValues);
export type PaymentAttemptStatus = z.infer<typeof paymentAttemptStatusSchema>;

export const paymentProviderEventTypeValues = [
  "payment.created",
  "payment.checkout_opened",
  "payment.pending",
  "payment.pending_3ds",
  "payment.authorized",
  "payment.processing",
  "payment.captured",
  "payment.settled",
  "payment.failed",
  "payment.declined",
  "payment.timeout",
  "payment.expired",
  "payment.voided",
  "payment.refunded",
  "payment.partially_refunded",
  "payment.chargeback",
  "settlement.cleared",
  "reconciliation.exception"
] as const;
export const paymentProviderEventTypeSchema = z.enum(paymentProviderEventTypeValues);
export type PaymentProviderEventType = z.infer<typeof paymentProviderEventTypeSchema>;

export const paymentAttemptResponseSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    provider: financePaymentProviderSchema,
    environment: paymentProviderEnvironmentSchema,
    status: paymentAttemptStatusSchema,
    amount: moneySchema,
    providerPaymentId: z.string().min(1).max(160).nullable(),
    providerCheckoutId: z.string().min(1).max(160).nullable(),
    idempotencyKey: z.string().min(1).max(160),
    metadata: providerMetadataSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();
export type PaymentAttemptResponse = z.infer<typeof paymentAttemptResponseSchema>;

export const paymentProviderEventSchema = z
  .object({
    id: uuidSchema,
    provider: financePaymentProviderSchema,
    environment: paymentProviderEnvironmentSchema,
    providerWebhookId: z.string().min(1).max(160),
    providerPaymentId: z.string().min(1).max(160).nullable(),
    type: paymentProviderEventTypeSchema,
    occurredAt: isoDateTimeSchema,
    receivedAt: isoDateTimeSchema,
    payload: providerMetadataSchema
  })
  .strict();
export type PaymentProviderEvent = z.infer<typeof paymentProviderEventSchema>;

export const createCheckoutRequestSchema = z
  .object({
    orderId: uuidSchema,
    /** Required only when the active checkout configuration creates a fiscal receipt. */
    buyerContact: fiscalBuyerContactSchema.optional(),
    successUrl: httpsUrlSchema,
    failureUrl: httpsUrlSchema,
    cancelUrl: httpsUrlSchema
  })
  .strict();
export type CreateCheckoutRequest = z.infer<typeof createCheckoutRequestSchema>;

/** Accepted async preparation; the HPP URL is deliberately never a persisted checkout response. */
export const checkoutPreparationResponseSchema = z
  .object({
    checkoutPreparationId: z.string().trim().min(1).max(160),
    state: z.literal("checkout_requested")
  })
  .strict();
export type CheckoutPreparationResponse = z.infer<typeof checkoutPreparationResponseSchema>;

export const checkoutPreparationStateValues = [
  "checkout_requested",
  "checkout_ready",
  "provider_session_unknown",
  "failed"
] as const;
export const checkoutPreparationStateSchema = z.enum(checkoutPreparationStateValues);
export type CheckoutPreparationState = z.infer<typeof checkoutPreparationStateSchema>;

/** Public owner-scoped status: it deliberately carries no provider checkout URL or ID. */
export const checkoutPreparationStateResponseSchema = z
  .object({
    checkoutPreparationId: z.string().trim().min(1).max(160),
    state: checkoutPreparationStateSchema
  })
  .strict();
export type CheckoutPreparationStateResponse = z.infer<
  typeof checkoutPreparationStateResponseSchema
>;

export const adminPaymentReversalCaseTypeValues = ["refund", "chargeback"] as const;
export const adminPaymentReversalCaseTypeSchema = z.enum(adminPaymentReversalCaseTypeValues);
export type AdminPaymentReversalCaseType = z.infer<typeof adminPaymentReversalCaseTypeSchema>;

export const adminPaymentReversalCaseSeverityValues = ["info", "attention", "critical"] as const;
export const adminPaymentReversalCaseSeveritySchema = z.enum(
  adminPaymentReversalCaseSeverityValues
);
export type AdminPaymentReversalCaseSeverity = z.infer<
  typeof adminPaymentReversalCaseSeveritySchema
>;

export const adminPaymentReversalCaseReviewResolutionValues = [
  "ledger_verified",
  "provider_follow_up_required",
  "evidence_sent"
] as const;
export const adminPaymentReversalCaseReviewResolutionSchema = z.enum(
  adminPaymentReversalCaseReviewResolutionValues
);
export type AdminPaymentReversalCaseReviewResolution = z.infer<
  typeof adminPaymentReversalCaseReviewResolutionSchema
>;

export const adminPaymentReversalCaseReviewSchema = z
  .object({
    resolution: adminPaymentReversalCaseReviewResolutionSchema,
    adminNote: z.string().trim().min(1).max(2_000),
    reviewedByUserId: uuidSchema.nullable(),
    reviewedAt: isoDateTimeSchema
  })
  .strict();
export type AdminPaymentReversalCaseReview = z.infer<typeof adminPaymentReversalCaseReviewSchema>;

export const adminPaymentReversalCaseReviewRequestSchema = z
  .object({
    resolution: adminPaymentReversalCaseReviewResolutionSchema,
    adminNote: z.string().trim().min(1).max(2_000)
  })
  .strict();
export type AdminPaymentReversalCaseReviewRequest = z.infer<
  typeof adminPaymentReversalCaseReviewRequestSchema
>;

export const adminPaymentReversalCaseSchema = z
  .object({
    id: uuidSchema,
    type: adminPaymentReversalCaseTypeSchema,
    severity: adminPaymentReversalCaseSeveritySchema,
    provider: financePaymentProviderSchema,
    environment: paymentProviderEnvironmentSchema,
    providerWebhookId: z.string().min(1).max(160),
    providerPaymentId: z.string().min(1).max(160).nullable(),
    providerRefundId: z.string().min(1).max(160).nullable(),
    paymentAttemptId: uuidSchema,
    orderId: uuidSchema,
    clientUserId: uuidSchema,
    astrologerUserId: uuidSchema,
    orderStatus: z.enum(["partially_refunded", "refunded", "chargeback"]),
    paymentAttemptStatus: paymentAttemptStatusSchema,
    amount: moneySchema,
    refundStatus: z.enum(["requested", "processing", "succeeded", "failed"]).nullable(),
    ledgerOperationType: z.enum(["refund_recorded", "chargeback_recorded"]).nullable(),
    ledgerTransactionId: uuidSchema.nullable(),
    review: adminPaymentReversalCaseReviewSchema.nullable(),
    walletBalance: walletBalanceResponseSchema.nullable(),
    occurredAt: isoDateTimeSchema,
    receivedAt: isoDateTimeSchema
  })
  .superRefine((value, context) => {
    if (value.type === "chargeback" && value.providerRefundId !== null) {
      context.addIssue({
        code: "custom",
        path: ["providerRefundId"],
        message: "Chargeback cases must not carry a refund id"
      });
    }
    if (value.type === "refund" && !value.providerRefundId) {
      context.addIssue({
        code: "custom",
        path: ["providerRefundId"],
        message: "Refund cases must carry a provider refund id"
      });
    }
    if (value.type === "chargeback" && value.orderStatus !== "chargeback") {
      context.addIssue({
        code: "custom",
        path: ["orderStatus"],
        message: "Chargeback cases must point to chargeback orders"
      });
    }
  })
  .strict();
export type AdminPaymentReversalCase = z.infer<typeof adminPaymentReversalCaseSchema>;

export const adminPaymentReversalQueueSummarySchema = z
  .object({
    refundCount: z.number().int().min(0),
    chargebackCount: z.number().int().min(0),
    criticalCount: z.number().int().min(0),
    totalAmount: moneySchema,
    negativeBalanceAmount: moneySchema
  })
  .strict();
export type AdminPaymentReversalQueueSummary = z.infer<
  typeof adminPaymentReversalQueueSummarySchema
>;

export const adminPaymentReversalQueueResponseSchema = z
  .object({
    summary: adminPaymentReversalQueueSummarySchema,
    cases: z.array(adminPaymentReversalCaseSchema)
  })
  .strict();
export type AdminPaymentReversalQueueResponse = z.infer<
  typeof adminPaymentReversalQueueResponseSchema
>;
