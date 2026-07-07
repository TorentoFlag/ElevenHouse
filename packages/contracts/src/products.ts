import { nonEmptyStringSchema, z } from "@elevenhouse/validation";
import {
  collectProductCreateInvariantIssues,
  collectProductModifierInvariantIssues,
  collectProductUpdateInvariantIssues,
  productAccessGrantValues,
  productAnalyticsStatusValues,
  productCurrencyValues,
  productDeliveryFormatValues,
  productExecutionModeValues,
  productMethodValues,
  productModifierKindValues,
  productParticipantModeValues,
  productPaymentModelValues,
  productRequiredClientDataValues,
  productStatusValues,
  productSubscriptionPeriodValues,
  productTypeValues,
  type ProductAccessGrantValue,
  type ProductDeliveryFormatValue,
  type ProductExecutionModeValue,
  type ProductMethodValue,
  type ProductParticipantModeValue,
  type ProductPaymentModelValue,
  type ProductRequiredClientDataValue,
  type ProductSubscriptionPeriodValue,
  type ProductTypeValue
} from "@elevenhouse/validation/products";
import { mediaAssetResponseSchema } from "./media";

const uuidSchema = z.string().uuid();
const optionalTrimmedStringSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();
const optionalNullableTrimmedStringSchema = z
  .union([
    z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value.length === 0 ? null : value)),
    z.null()
  ])
  .optional();
const optionalUuidSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .pipe(uuidSchema.optional())
  .optional();
const optionalNullableUuidSchema = z
  .union([
    z
      .string()
      .trim()
      .transform((value) => (value.length === 0 ? null : value))
      .pipe(uuidSchema.nullable()),
    z.null()
  ])
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
const optionalNullableUrlStringSchema = z
  .union([
    z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value.length === 0 ? null : value))
      .refine(
        (value) => {
          if (value === null) return true;
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Invalid URL" }
      ),
    z.null()
  ])
  .optional();
const nullableStringSchema = z.string().trim().max(500).nullable();
const optionalPositiveIntSchema = z.number().int().positive().optional();
const optionalNonNegativeIntSchema = z.number().int().min(0).optional();
const optionalNullablePositiveIntSchema = z.number().int().positive().nullable().optional();
const optionalNullableNonNegativeIntSchema = z.number().int().min(0).nullable().optional();
const orderSchema = z.number().int().min(0).max(100_000);

export const productStatusSchema = z.enum(productStatusValues);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productStatusFilterSchema = z.union([z.literal("all"), productStatusSchema]);
export type ProductStatusFilter = z.infer<typeof productStatusFilterSchema>;

export const productTypeSchema = z.enum(productTypeValues);
export type ProductType = z.infer<typeof productTypeSchema>;

export const productDeliveryFormatSchema = z.enum(productDeliveryFormatValues);
export type ProductDeliveryFormat = z.infer<typeof productDeliveryFormatSchema>;

export const productExecutionModeSchema = z.enum(productExecutionModeValues);
export type ProductExecutionMode = z.infer<typeof productExecutionModeSchema>;

export const productPaymentModelSchema = z.enum(productPaymentModelValues);
export type ProductPaymentModel = z.infer<typeof productPaymentModelSchema>;

export const productSubscriptionPeriodSchema = z.enum(productSubscriptionPeriodValues);
export type ProductSubscriptionPeriod = z.infer<typeof productSubscriptionPeriodSchema>;

export const productParticipantModeSchema = z.enum(productParticipantModeValues);
export type ProductParticipantMode = z.infer<typeof productParticipantModeSchema>;

export const productRequiredClientDataSchema = z.enum(productRequiredClientDataValues);
export type ProductRequiredClientData = z.infer<typeof productRequiredClientDataSchema>;

export const productMethodSchema = z.enum(productMethodValues);
export type ProductMethod = z.infer<typeof productMethodSchema>;

export const productAccessGrantSchema = z.enum(productAccessGrantValues);
export type ProductAccessGrant = z.infer<typeof productAccessGrantSchema>;

export const productModifierKindSchema = z.enum(productModifierKindValues);
export type ProductModifierKind = z.infer<typeof productModifierKindSchema>;

export const productCurrencySchema = z.enum(productCurrencyValues);
export type ProductCurrency = z.infer<typeof productCurrencySchema>;

export const productAnalyticsStatusSchema = z.enum(productAnalyticsStatusValues);
export type ProductAnalyticsStatus = z.infer<typeof productAnalyticsStatusSchema>;

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
    addProductInvariantIssues(collectProductModifierInvariantIssues(value), ctx);
  });
export type ProductModifierRequest = z.infer<typeof productModifierRequestSchema>;

const productPayloadFields = {
  type: productTypeSchema,
  title: nonEmptyStringSchema.max(200),
  subtitle: optionalTrimmedStringSchema,
  priceMinor: z.number().int().min(0),
  currency: productCurrencySchema,
  coverMediaId: optionalUuidSchema,
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

const updateProductPayloadFields = {
  ...productPayloadFields,
  subtitle: optionalNullableTrimmedStringSchema,
  coverMediaId: optionalNullableUuidSchema,
  introVideoUrl: optionalNullableUrlStringSchema,
  durationMinutes: optionalNullablePositiveIntSchema,
  durationLabel: optionalNullableTrimmedStringSchema,
  slaLabel: optionalNullableTrimmedStringSchema,
  packageSessionCount: optionalNullablePositiveIntSchema,
  packageDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
  subscriptionPeriod: productSubscriptionPeriodSchema.nullable().optional(),
  trialDays: optionalNullableNonNegativeIntSchema,
  groupSize: optionalNullablePositiveIntSchema
};

const addProductPayloadIssues = (
  value: {
    readonly type?: ProductTypeValue;
    readonly executionMode?: ProductExecutionModeValue;
    readonly paymentModel?: ProductPaymentModelValue;
    readonly packageSessionCount?: number | null;
    readonly subscriptionPeriod?: ProductSubscriptionPeriodValue | null;
    readonly participantMode?: ProductParticipantModeValue;
    readonly groupSize?: number | null;
    readonly priceMinor?: number;
    readonly deliveryFormats?: readonly ProductDeliveryFormatValue[];
    readonly requiredClientData?: readonly ProductRequiredClientDataValue[];
    readonly methods?: readonly ProductMethodValue[];
    readonly accessGrants?: readonly ProductAccessGrantValue[];
  },
  ctx: z.RefinementCtx
) => {
  addProductInvariantIssues(collectProductCreateInvariantIssues(value), ctx);
};

const addProductUpdateIssues = (
  value: {
    readonly deliveryFormats?: readonly ProductDeliveryFormatValue[];
    readonly requiredClientData?: readonly ProductRequiredClientDataValue[];
    readonly methods?: readonly ProductMethodValue[];
    readonly accessGrants?: readonly ProductAccessGrantValue[];
  },
  ctx: z.RefinementCtx
) => {
  addProductInvariantIssues(collectProductUpdateInvariantIssues(value), ctx);
};

const addProductInvariantIssues = (
  issues: ReturnType<typeof collectProductCreateInvariantIssues>,
  ctx: z.RefinementCtx
) => {
  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...issue.path],
      message: issue.message
    });
  }
};

export const createProductRequestSchema = z
  .object(productPayloadFields)
  .strict()
  .superRefine(addProductPayloadIssues);
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z
  .object(updateProductPayloadFields)
  .partial()
  .strict()
  .superRefine(addProductUpdateIssues);
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export const duplicateProductRequestSchema = z
  .object({
    title: nonEmptyStringSchema.max(200).optional()
  })
  .strict();
export type DuplicateProductRequest = z.infer<typeof duplicateProductRequestSchema>;

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
  status: productAnalyticsStatusSchema.optional(),
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
    coverMediaId: uuidSchema.nullable(),
    coverMedia: mediaAssetResponseSchema.nullable(),
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
  analyticsStatus: productAnalyticsStatusSchema.optional(),
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
