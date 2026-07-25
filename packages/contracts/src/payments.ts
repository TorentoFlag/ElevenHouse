import { z } from "@elevenhouse/validation";
import { moneySchema } from "./money";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Expected an HTTPS URL"
  });
const providerMetadataSchema = z.record(z.string().min(1).max(80), z.unknown());

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
    successUrl: httpsUrlSchema,
    failureUrl: httpsUrlSchema,
    cancelUrl: httpsUrlSchema
  })
  .strict();
export type CreateCheckoutRequest = z.infer<typeof createCheckoutRequestSchema>;

export const checkoutResponseSchema = z
  .object({
    paymentAttemptId: uuidSchema,
    provider: financePaymentProviderSchema,
    environment: paymentProviderEnvironmentSchema,
    checkoutUrl: z.string().url(),
    providerCheckoutId: z.string().min(1).max(160)
  })
  .strict();
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
