import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime();
const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const noteTextSchema = z
  .string()
  .max(10_000)
  .refine((value) => value.trim().length > 0, "Matrix note text is required");

export const matrixNoteIdParamSchema = z
  .object({ calculationId: uuidSchema, noteId: uuidSchema })
  .strict();
export type MatrixNoteIdParam = z.infer<typeof matrixNoteIdParamSchema>;

export const createMatrixNoteRequestSchema = z
  .object({ text: noteTextSchema, expectedResultChecksum: sha256DigestSchema })
  .strict();
export type CreateMatrixNoteRequest = z.infer<typeof createMatrixNoteRequestSchema>;

export const updateMatrixNoteRequestSchema = createMatrixNoteRequestSchema;
export type UpdateMatrixNoteRequest = z.infer<typeof updateMatrixNoteRequestSchema>;

export const matrixNoteSchema = z
  .object({
    id: uuidSchema,
    calculationId: uuidSchema,
    text: z.string().min(1).max(10_000),
    resultChecksum: sha256DigestSchema,
    stale: z.boolean(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  })
  .strict();
export type MatrixNote = z.infer<typeof matrixNoteSchema>;

export const matrixNoteResponseSchema = z
  .object({ note: matrixNoteSchema, currentResultChecksum: sha256DigestSchema })
  .strict();
export type MatrixNoteResponse = z.infer<typeof matrixNoteResponseSchema>;

export const matrixNotesResponseSchema = z
  .object({ notes: z.array(matrixNoteSchema), currentResultChecksum: sha256DigestSchema })
  .strict();
export type MatrixNotesResponse = z.infer<typeof matrixNotesResponseSchema>;

export const matrixInterpretationLocaleSchema = z.enum(["ru", "en"]);
export type MatrixInterpretationLocale = z.infer<typeof matrixInterpretationLocaleSchema>;

export const matrixInterpretationContextSchema = z.enum([
  "portrait",
  "talent",
  "karmic",
  "relationship",
  "money",
  "lineage",
  "purpose",
  "energy",
  "compatibility",
  "forecast"
]);
export type MatrixInterpretationContext = z.infer<typeof matrixInterpretationContextSchema>;

export const matrixInterpretationQuerySchema = z
  .object({
    locale: matrixInterpretationLocaleSchema,
    arcana: z.coerce.number().int().min(1).max(22),
    context: matrixInterpretationContextSchema
  })
  .strict();
export type MatrixInterpretationQuery = z.infer<typeof matrixInterpretationQuerySchema>;

export const matrixInterpretationEntrySchema = z
  .object({
    catalogRevision: z.literal(1),
    locale: matrixInterpretationLocaleSchema,
    arcana: z.number().int().min(1).max(22),
    context: matrixInterpretationContextSchema,
    title: z.string().trim().min(1).max(200),
    constructive: z.string().trim().min(1).max(2_000),
    shadow: z.string().trim().min(1).max(2_000),
    reflectionQuestions: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
    practicalRecommendations: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
    reportSummary: z.string().trim().min(1).max(1_000)
  })
  .strict();
export type MatrixInterpretationEntry = z.infer<typeof matrixInterpretationEntrySchema>;

export const matrixInterpretationResponseSchema = z
  .object({ entry: matrixInterpretationEntrySchema })
  .strict();
export type MatrixInterpretationResponse = z.infer<typeof matrixInterpretationResponseSchema>;
