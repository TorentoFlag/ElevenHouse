/* eslint-disable no-control-regex -- Contract validation intentionally rejects ASCII control characters. */
import { z } from "@elevenhouse/validation";

const seriesId = z.string().min(1).max(160).refine(
  (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
  "Disclosure series ID must be a trimmed visible identifier"
);
const version = z.number().int().positive();
const locale = z.enum(["ru", "en"]);
const body = z.string().trim().min(1).max(50_000);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const draftTerms = z.object({ disclosureSeriesId: seriesId, version, locale, body }).strict();

export const adminSavedCardDisclosureDraftRequestSchema = draftTerms;
export const adminSavedCardDisclosureUpdateRequestSchema = draftTerms.extend({ expectedDraftRevision: version }).strict();
export const adminSavedCardDisclosurePublishRequestSchema = z.object({ expectedDraftRevision: version }).strict();

export const adminSavedCardDisclosureResponseSchema = draftTerms.extend({
  draftRevision: version,
  lifecycle: z.enum(["draft", "published", "retired"]),
  canonicalDigest: digest
}).strict();
export type AdminSavedCardDisclosureResponse = z.infer<typeof adminSavedCardDisclosureResponseSchema>;

export const adminSavedCardDisclosureListResponseSchema = z.object({
  disclosures: z.array(adminSavedCardDisclosureResponseSchema).max(1_000)
}).strict();
export type AdminSavedCardDisclosureListResponse = z.infer<typeof adminSavedCardDisclosureListResponseSchema>;
