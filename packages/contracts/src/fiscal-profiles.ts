/* eslint-disable no-control-regex -- identifiers are deliberately restricted to visible characters. */
import { z } from "@elevenhouse/validation";

export const fiscalTransactionCategorySchema = z.enum([
  "client_purchase",
  "platform_subscription"
]);
export type FiscalTransactionCategory = z.infer<typeof fiscalTransactionCategorySchema>;

export const arcPayFiscalVatRateSchema = z.enum([
  "no_vat",
  "vat0",
  "vat10",
  "vat110",
  "vat20",
  "vat120"
]);
export type ArcPayFiscalVatRate = z.infer<typeof arcPayFiscalVatRateSchema>;

const visibleIdentifierSchema = z.string().min(1).max(160).refine(
  (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
  "Fiscal profile identifier must be a trimmed visible identifier"
);
const positiveIntegerSchema = z.number().int().positive();
const accountingLabelSchema = z.string().trim().min(1).max(128);

const fiscalProfileTermsSchema = z.object({
  profileSeriesId: visibleIdentifierSchema,
  version: positiveIntegerSchema,
  transactionCategory: fiscalTransactionCategorySchema,
  currency: z.literal("RUB"),
  fiscalizationProvider: z.literal("arc_pay_embedded"),
  merchantTaxId: z.string().regex(/^(?:\d{10}|\d{12})$/),
  buyerContactRequirement: z.literal("email_or_phone"),
  lineTemplate: z.object({
    vatRate: arcPayFiscalVatRateSchema,
    paymentObject: accountingLabelSchema,
    paymentMethod: accountingLabelSchema,
    measure: accountingLabelSchema,
    itemCode: accountingLabelSchema
  }).strict()
}).strict();

export const adminFiscalProfileDraftRequestSchema = fiscalProfileTermsSchema;
export type AdminFiscalProfileDraftRequest = z.infer<typeof adminFiscalProfileDraftRequestSchema>;

export const adminFiscalProfileUpdateRequestSchema = fiscalProfileTermsSchema.extend({
  expectedDraftRevision: positiveIntegerSchema
}).strict();
export type AdminFiscalProfileUpdateRequest = z.infer<typeof adminFiscalProfileUpdateRequestSchema>;

export const adminFiscalProfilePublishRequestSchema = z.object({
  expectedDraftRevision: positiveIntegerSchema
}).strict();
export type AdminFiscalProfilePublishRequest = z.infer<typeof adminFiscalProfilePublishRequestSchema>;

export const adminFiscalProfileResponseSchema = fiscalProfileTermsSchema.extend({
  draftRevision: positiveIntegerSchema,
  lifecycle: z.enum(["draft", "published", "retired"]),
  canonicalDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/)
}).strict();
export type AdminFiscalProfileResponse = z.infer<typeof adminFiscalProfileResponseSchema>;

export const adminFiscalProfileListResponseSchema = z.object({
  profiles: z.array(adminFiscalProfileResponseSchema).max(500)
}).strict();
export type AdminFiscalProfileListResponse = z.infer<typeof adminFiscalProfileListResponseSchema>;
