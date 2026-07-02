import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const optionalTrimmedStringSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();
const optionalUrlStringSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? undefined : value))
  .refine(
    (value) => {
      if (value === undefined) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid URL" }
  )
  .optional();
const nullableStringSchema = z.string().trim().max(500).nullable();
const optionalPositiveIntSchema = z.number().int().positive().optional();
const optionalNonNegativeIntSchema = z.number().int().min(0).optional();
const orderSchema = z.number().int().min(0).max(100_000);

export const productStatusSchema = z.enum(["draft", "active", "archived"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productStatusFilterSchema = z.union([z.literal("all"), productStatusSchema]);
export type ProductStatusFilter = z.infer<typeof productStatusFilterSchema>;

export const productTypeSchema = z.enum([
  "single",
  "pack",
  "async",
  "sub",
  "mini",
  "course",
  "custom"
]);
export type ProductType = z.infer<typeof productTypeSchema>;

export const productDeliveryFormatSchema = z.enum([
  "video",
  "audio",
  "chat",
  "text",
  "file",
  "channel"
]);
export type ProductDeliveryFormat = z.infer<typeof productDeliveryFormatSchema>;

export const productExecutionModeSchema = z.enum(["live", "async", "instant"]);
export type ProductExecutionMode = z.infer<typeof productExecutionModeSchema>;

export const productPaymentModelSchema = z.enum(["once", "pack", "sub", "free"]);
export type ProductPaymentModel = z.infer<typeof productPaymentModelSchema>;

export const productSubscriptionPeriodSchema = z.enum(["week", "month", "year"]);
export type ProductSubscriptionPeriod = z.infer<typeof productSubscriptionPeriodSchema>;

export const productParticipantModeSchema = z.enum(["solo", "group", "gift"]);
export type ProductParticipantMode = z.infer<typeof productParticipantModeSchema>;

export const productRequiredClientDataSchema = z.enum([
  "chart1",
  "cities",
  "chart2",
  "question",
  "event"
]);
export type ProductRequiredClientData = z.infer<typeof productRequiredClientDataSchema>;

export const productMethodSchema = z.enum([
  "natal",
  "forecast",
  "synastry",
  "child",
  "numerology",
  "matrix",
  "humandesign"
]);
export type ProductMethod = z.infer<typeof productMethodSchema>;

export const productAccessGrantSchema = z.enum([
  "content",
  "channel",
  "records",
  "course",
  "community",
  "journal"
]);
export type ProductAccessGrant = z.infer<typeof productAccessGrantSchema>;

export const productModifierKindSchema = z.enum(["fixed", "percent", "free"]);
export type ProductModifierKind = z.infer<typeof productModifierKindSchema>;

export const productCurrencySchema = z.enum(["RUB"]);
export type ProductCurrency = z.infer<typeof productCurrencySchema>;

export const productIncludedItemRequestSchema = z
  .object({
    text: nonEmptyStringSchema.max(300),
    icon: nonEmptyStringSchema.max(40),
    order: orderSchema
  })
  .strict();
export type ProductIncludedItemRequest = z.infer<typeof productIncludedItemRequestSchema>;

export const productModifierRequestSchema = z
  .object({
    label: nonEmptyStringSchema.max(200),
    priceMinor: z.number().int().min(0),
    kind: productModifierKindSchema,
    isEnabled: z.boolean(),
    createsArtifact: z.boolean(),
    order: orderSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "free" && value.priceMinor !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceMinor"],
        message: "Free modifiers must have zero price"
      });
    }
  });
export type ProductModifierRequest = z.infer<typeof productModifierRequestSchema>;

const productPayloadFields = {
  type: productTypeSchema,
  title: nonEmptyStringSchema.max(200),
  subtitle: optionalTrimmedStringSchema,
  priceMinor: z.number().int().min(0),
  currency: productCurrencySchema,
  coverMediaId: optionalTrimmedStringSchema,
  introVideoUrl: optionalUrlStringSchema,
  executionMode: productExecutionModeSchema,
  paymentModel: productPaymentModelSchema,
  durationMinutes: optionalPositiveIntSchema,
  durationLabel: optionalTrimmedStringSchema,
  slaLabel: optionalTrimmedStringSchema,
  packageSessionCount: optionalPositiveIntSchema,
  packageDiscountPercent: z.number().int().min(0).max(100).optional(),
  subscriptionPeriod: productSubscriptionPeriodSchema.optional(),
  trialDays: optionalNonNegativeIntSchema,
  participantMode: productParticipantModeSchema,
  groupSize: optionalPositiveIntSchema,
  deliveryFormats: z.array(productDeliveryFormatSchema).min(1).max(6),
  requiredClientData: z.array(productRequiredClientDataSchema).max(10),
  methods: z.array(productMethodSchema).max(10),
  accessGrants: z.array(productAccessGrantSchema).max(10),
  includedItems: z.array(productIncludedItemRequestSchema).max(30),
  modifiers: z.array(productModifierRequestSchema).max(30)
};

const addProductPayloadIssues = (
  value: {
    readonly paymentModel?: ProductPaymentModel;
    readonly packageSessionCount?: number | null;
    readonly subscriptionPeriod?: ProductSubscriptionPeriod | null;
    readonly participantMode?: ProductParticipantMode;
    readonly groupSize?: number | null;
    readonly priceMinor?: number;
  },
  ctx: z.RefinementCtx
) => {
  if (value.paymentModel === "pack" && !value.packageSessionCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["packageSessionCount"],
      message: "Package products require packageSessionCount"
    });
  }

  if (value.paymentModel === "sub" && !value.subscriptionPeriod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subscriptionPeriod"],
      message: "Subscription products require subscriptionPeriod"
    });
  }

  if (value.participantMode === "group" && !value.groupSize) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["groupSize"],
      message: "Group products require groupSize"
    });
  }

  if (value.paymentModel === "free" && value.priceMinor !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["priceMinor"],
      message: "Free products must have zero price"
    });
  }
};

const productPayloadBaseSchema = z
  .object(productPayloadFields)
  .strict()
  .superRefine(addProductPayloadIssues);

export const createProductRequestSchema = productPayloadBaseSchema.extend({
  status: productStatusSchema.default("draft")
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z
  .object(productPayloadFields)
  .partial()
  .strict();
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export const productIdParamSchema = z.object({ productId: uuidSchema }).strict();
export type ProductIdParam = z.infer<typeof productIdParamSchema>;

export const listProductsQuerySchema = z
  .object({
    status: productStatusFilterSchema.default("all"),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
  })
  .strict();
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const productLifetimeAnalyticsResponseSchema = z.object({
  salesCount: z.number().int().min(0),
  grossRevenueMinor: z.number().int().min(0),
  currency: productCurrencySchema,
  averageRating: z.number().min(1).max(5).nullable(),
  reviewsCount: z.number().int().min(0)
});
export type ProductLifetimeAnalyticsResponse = z.infer<
  typeof productLifetimeAnalyticsResponseSchema
>;

export const productIncludedItemResponseSchema = productIncludedItemRequestSchema.extend({
  id: uuidSchema
});
export type ProductIncludedItemResponse = z.infer<typeof productIncludedItemResponseSchema>;

export const productModifierResponseSchema = productModifierRequestSchema.extend({
  id: uuidSchema
});
export type ProductModifierResponse = z.infer<typeof productModifierResponseSchema>;

export const productResponseSchema = z
  .object({
    ...productPayloadFields,
    id: uuidSchema,
    ownerUserId: uuidSchema,
    status: productStatusSchema,
    subtitle: nullableStringSchema,
    coverMediaId: nullableStringSchema,
    introVideoUrl: nullableStringSchema,
    durationMinutes: z.number().int().positive().nullable(),
    durationLabel: nullableStringSchema,
    slaLabel: nullableStringSchema,
    packageSessionCount: z.number().int().positive().nullable(),
    packageDiscountPercent: z.number().int().min(0).max(100).nullable(),
    subscriptionPeriod: productSubscriptionPeriodSchema.nullable(),
    trialDays: z.number().int().min(0).nullable(),
    groupSize: z.number().int().positive().nullable(),
    includedItems: z.array(productIncludedItemResponseSchema),
    modifiers: z.array(productModifierResponseSchema),
    analytics: productLifetimeAnalyticsResponseSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict()
  .superRefine(addProductPayloadIssues);
export type ProductResponse = z.infer<typeof productResponseSchema>;

export const listProductsResponseSchema = z.object({
  products: z.array(productResponseSchema),
  total: z.number().int().min(0),
  counts: z.object({
    all: z.number().int().min(0),
    active: z.number().int().min(0),
    draft: z.number().int().min(0),
    archived: z.number().int().min(0)
  })
});
export type ListProductsResponse = z.infer<typeof listProductsResponseSchema>;

export const productSummaryResponseSchema = z.object({
  total: z.number().int().min(0),
  active: z.number().int().min(0),
  draft: z.number().int().min(0),
  archived: z.number().int().min(0),
  totalSalesCount: z.number().int().min(0),
  grossRevenueMinor: z.number().int().min(0),
  currency: productCurrencySchema,
  bestseller: z
    .object({
      productId: uuidSchema,
      title: nonEmptyStringSchema,
      salesCount: z.number().int().min(0)
    })
    .nullable()
});
export type ProductSummaryResponse = z.infer<typeof productSummaryResponseSchema>;
