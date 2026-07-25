import { z } from "@elevenhouse/validation";
import { riskTierSchema } from "./finance-policies";
import { moneySchema } from "./money";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();

export const orderStatusValues = [
  "draft",
  "pending_payment",
  "paid",
  "fulfilled",
  "cancelled",
  "expired",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;
export const orderStatusSchema = z.enum(orderStatusValues);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderResponseSchema = z
  .object({
    id: uuidSchema,
    clientUserId: uuidSchema,
    astrologerUserId: uuidSchema,
    productId: uuidSchema,
    directLinkIntentId: uuidSchema.nullable(),
    bookingId: uuidSchema.nullable(),
    status: orderStatusSchema,
    grossAmount: moneySchema,
    platformFee: moneySchema,
    astrologerNetAmount: moneySchema,
    financePolicySnapshotId: uuidSchema,
    financePolicyRiskTier: riskTierSchema,
    financePolicyHoldDurationHours: z.number().int().min(0).max(24 * 180),
    financePolicyReserveBps: z.number().int().min(0).max(10_000),
    financePolicyReserveReleaseDelayDays: z.number().int().min(0).max(540),
    financePolicyPlatformFeeBps: z.number().int().min(0).max(10_000),
    financePolicyProviderSettlementRequired: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .superRefine((value, context) => {
    const sameCurrency =
      value.grossAmount.currency === value.platformFee.currency &&
      value.grossAmount.currency === value.astrologerNetAmount.currency;
    if (!sameCurrency) {
      context.addIssue({
        code: "custom",
        message: "Order money fields must use the same currency"
      });
      return;
    }

    if (
      value.grossAmount.amountMinor !==
      value.platformFee.amountMinor + value.astrologerNetAmount.amountMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Order gross amount must equal platform fee plus astrologer net amount"
      });
    }
  })
  .strict();
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const createOrderRequestSchema = z
  .object({
    astrologerUserId: uuidSchema,
    productId: uuidSchema,
    directLinkIntentId: uuidSchema.nullable().optional(),
    bookingId: uuidSchema.nullable().optional(),
    clientBirthDataId: uuidSchema.nullable().optional()
  })
  .strict()
  .transform((value) => ({
    ...value,
    directLinkIntentId: value.directLinkIntentId ?? null,
    bookingId: value.bookingId ?? null,
    clientBirthDataId: value.clientBirthDataId ?? null
  }));
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
