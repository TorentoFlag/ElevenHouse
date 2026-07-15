import { z } from "@elevenhouse/validation";
import { calculationPdfDownloadResponseSchema, calculationPdfJobSchema } from "./calculation-pdf";

const uuidSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime();
const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sectionTextSchema = z
  .string()
  .max(5_000)
  .refine((value) => value.trim().length > 0, "Report section is required");
const listItemSchema = z
  .string()
  .max(500)
  .refine((value) => value.trim().length > 0, "Report list item is required");

export const matrixReportLocaleSchema = z.enum(["ru", "en"]);
export type MatrixReportLocale = z.infer<typeof matrixReportLocaleSchema>;

export const matrixReportStatusSchema = z.enum(["draft", "ready"]);
export type MatrixReportStatus = z.infer<typeof matrixReportStatusSchema>;

export const matrixReportContentSchema = z
  .object({
    overview: sectionTextSchema,
    corePortrait: sectionTextSchema,
    strengthsAndTalents: sectionTextSchema,
    growthAreas: sectionTextSchema,
    moneyAndRealization: sectionTextSchema,
    relationships: sectionTextSchema,
    lineageThemes: sectionTextSchema,
    purposes: sectionTextSchema,
    yearProjection: sectionTextSchema.nullable(),
    reflectionQuestions: z.array(listItemSchema).min(1).max(12),
    practicalSteps: z.array(listItemSchema).min(1).max(12),
    disclaimer: sectionTextSchema.max(1_000)
  })
  .strict();
export type MatrixReportContent = z.infer<typeof matrixReportContentSchema>;

export const matrixReportSchema = z
  .object({
    id: uuidSchema,
    calculationId: uuidSchema,
    source: z.enum(["manual", "ai"]),
    status: matrixReportStatusSchema,
    locale: matrixReportLocaleSchema,
    content: matrixReportContentSchema,
    plainText: z.string().trim().min(1).max(50_000),
    resultChecksum: checksumSchema,
    stale: z.boolean(),
    revision: z.number().int().min(1),
    modelId: z.string().trim().min(1).max(200).nullable(),
    promptVersion: z.string().trim().min(1).max(200).nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  })
  .strict();
export type MatrixReport = z.infer<typeof matrixReportSchema>;

export const matrixReportResponseSchema = z
  .object({ report: matrixReportSchema.nullable(), currentResultChecksum: checksumSchema })
  .strict();
export type MatrixReportResponse = z.infer<typeof matrixReportResponseSchema>;

export const saveMatrixReportRequestSchema = z
  .object({
    locale: matrixReportLocaleSchema,
    status: matrixReportStatusSchema,
    content: matrixReportContentSchema,
    expectedResultChecksum: checksumSchema
  })
  .strict();
export type SaveMatrixReportRequest = z.infer<typeof saveMatrixReportRequestSchema>;

export const generateMatrixReportAiDraftRequestSchema = z
  .object({
    locale: matrixReportLocaleSchema,
    noteIds: z
      .array(uuidSchema)
      .max(20)
      .refine((values) => new Set(values).size === values.length, "Note ids must be unique"),
    projectionYear: z.number().int().min(1900).max(2200).nullable(),
    expectedResultChecksum: checksumSchema
  })
  .strict();
export type GenerateMatrixReportAiDraftRequest = z.infer<
  typeof generateMatrixReportAiDraftRequestSchema
>;

export const enqueueMatrixPdfRequestSchema = z
  .object({ expectedResultChecksum: checksumSchema })
  .strict();
export type EnqueueMatrixPdfRequest = z.infer<typeof enqueueMatrixPdfRequestSchema>;

export const matrixPdfJobIdParamSchema = z
  .object({ calculationId: uuidSchema, jobId: uuidSchema })
  .strict();
export type MatrixPdfJobIdParam = z.infer<typeof matrixPdfJobIdParamSchema>;

export const matrixPdfJobSchema = z
  .object({
    ...calculationPdfJobSchema.shape,
    reportId: uuidSchema,
    reportRevision: z.number().int().min(1)
  })
  .strict();
export type MatrixPdfJob = z.infer<typeof matrixPdfJobSchema>;

export const matrixPdfJobResponseSchema = z
  .object({ job: matrixPdfJobSchema.nullable(), currentResultChecksum: checksumSchema })
  .strict();
export type MatrixPdfJobResponse = z.infer<typeof matrixPdfJobResponseSchema>;

export const matrixPdfDownloadResponseSchema = calculationPdfDownloadResponseSchema;
export type MatrixPdfDownloadResponse = z.infer<typeof matrixPdfDownloadResponseSchema>;
