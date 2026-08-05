import { z } from "@elevenhouse/validation";
import {
  productCurrencySchema,
  productDeliveryFormatSchema,
  productExecutionModeSchema,
  productIncludedItemRequestSchema,
  productPaymentModelSchema,
  productTypeSchema
} from "./products";

const uuidSchema = z.string().uuid();

/**
 * Client purchase reads are deliberately owner-scoped. They are never a public catalogue,
 * search result, or a way to enumerate another astrologer's products.
 */
export const clientPurchaseOptionSchema = z
  .object({
    id: uuidSchema,
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().max(500).nullable(),
    type: productTypeSchema,
    executionMode: productExecutionModeSchema,
    paymentModel: productPaymentModelSchema,
    priceMinor: z.number().int().positive(),
    currency: productCurrencySchema,
    durationMinutes: z.number().int().positive().nullable(),
    durationLabel: z.string().trim().max(500).nullable(),
    slaLabel: z.string().trim().max(500).nullable(),
    deliveryFormats: z.array(productDeliveryFormatSchema).min(1).max(6),
    includedItems: z.array(productIncludedItemRequestSchema).max(30)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.paymentModel !== "once" && value.paymentModel !== "pack") {
      context.addIssue({
        code: "custom",
        path: ["paymentModel"],
        message: "Client purchase options must be one-time or package products"
      });
    }
    if (value.executionMode === "live" && value.durationMinutes === null) {
      context.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "Live purchase options require a duration"
      });
    }
  });
export type ClientPurchaseOption = z.infer<typeof clientPurchaseOptionSchema>;

export const clientPurchaseOptionsResponseSchema = z
  .object({
    astrologerUserId: uuidSchema,
    products: z.array(clientPurchaseOptionSchema).max(200)
  })
  .strict();
export type ClientPurchaseOptionsResponse = z.infer<typeof clientPurchaseOptionsResponseSchema>;

export const clientPurchaseAstrologerParamsSchema = z
  .object({ astrologerUserId: uuidSchema })
  .strict();
export type ClientPurchaseAstrologerParams = z.infer<typeof clientPurchaseAstrologerParamsSchema>;
