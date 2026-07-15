import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime();
const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const calculationPdfLocaleSchema = z.enum(["ru", "en"]);
export type CalculationPdfLocale = z.infer<typeof calculationPdfLocaleSchema>;

export const calculationPdfJobStatusSchema = z.enum(["queued", "processing", "ready", "failed"]);
export type CalculationPdfJobStatus = z.infer<typeof calculationPdfJobStatusSchema>;

export const requestCalculationPdfSchema = z
  .object({
    expectedResultChecksum: checksumSchema,
    locale: calculationPdfLocaleSchema
  })
  .strict();
export type RequestCalculationPdf = z.infer<typeof requestCalculationPdfSchema>;

export const calculationPdfLatestQuerySchema = z
  .object({ locale: calculationPdfLocaleSchema })
  .strict();
export type CalculationPdfLatestQuery = z.infer<typeof calculationPdfLatestQuerySchema>;

export const calculationPdfJobSchema = z
  .object({
    id: uuidSchema,
    calculationId: uuidSchema,
    resultChecksum: checksumSchema,
    locale: calculationPdfLocaleSchema,
    status: calculationPdfJobStatusSchema,
    artifactId: uuidSchema.nullable(),
    mediaAssetId: uuidSchema.nullable(),
    failureReason: z.string().trim().min(1).max(500).nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  })
  .strict();
export type CalculationPdfJob = z.infer<typeof calculationPdfJobSchema>;

export const calculationPdfJobResponseSchema = z
  .object({ job: calculationPdfJobSchema.nullable(), currentResultChecksum: checksumSchema })
  .strict();
export type CalculationPdfJobResponse = z.infer<typeof calculationPdfJobResponseSchema>;

export const calculationPdfJobIdParamSchema = z
  .object({ calculationId: uuidSchema, jobId: uuidSchema })
  .strict();
export type CalculationPdfJobIdParam = z.infer<typeof calculationPdfJobIdParamSchema>;

export const calculationPdfDownloadResponseSchema = z
  .object({ url: z.string().url(), expiresAt: dateTimeSchema })
  .strict();
export type CalculationPdfDownloadResponse = z.infer<typeof calculationPdfDownloadResponseSchema>;
