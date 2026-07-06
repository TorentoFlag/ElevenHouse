import { mediaMimeTypeSchema } from "./media";
import { nonEmptyStringSchema, z } from "@elevenhouse/validation";

const uuidSchema = z.string().trim().uuid();
const dateTimeSchema = z.string().datetime({ offset: true });

export const verificationApplicationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "revoked"
]);
export type VerificationApplicationStatus = z.infer<typeof verificationApplicationStatusSchema>;

export const astrologerVerificationStatusSchema = z.enum([
  "none",
  "pending",
  "approved",
  "rejected",
  "revoked"
]);
export type AstrologerVerificationStatus = z.infer<typeof astrologerVerificationStatusSchema>;

export const verificationDocumentKindSchema = z.enum(["identity", "qualification"]);
export type VerificationDocumentKind = z.infer<typeof verificationDocumentKindSchema>;

export const verificationDocumentResponseSchema = z
  .object({
    id: uuidSchema,
    applicationId: uuidSchema,
    kind: verificationDocumentKindSchema,
    mediaId: uuidSchema,
    originalFileName: nonEmptyStringSchema.max(255),
    mimeType: mediaMimeTypeSchema,
    sizeBytes: z.number().int().positive(),
    createdAt: dateTimeSchema
  })
  .strict();
export type VerificationDocumentResponse = z.infer<typeof verificationDocumentResponseSchema>;

export const verificationApplicationResponseSchema = z
  .object({
    id: uuidSchema,
    ownerUserId: uuidSchema,
    status: verificationApplicationStatusSchema,
    rejectionReason: z.string().trim().min(1).max(1000).nullable(),
    submittedAt: dateTimeSchema,
    reviewedAt: dateTimeSchema.nullable(),
    documents: z.array(verificationDocumentResponseSchema).max(6),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "rejected" && !value.rejectionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectionReason"],
        message: "Rejected verification applications require a rejection reason"
      });
    }
    if (value.status !== "pending" && !value.reviewedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewedAt"],
        message: "Reviewed verification applications require reviewedAt"
      });
    }
  });
export type VerificationApplicationResponse = z.infer<
  typeof verificationApplicationResponseSchema
>;

export const verificationRequirementsResponseSchema = z
  .object({
    maxQualificationDocuments: z.literal(5),
    allowedMimeTypes: z.array(mediaMimeTypeSchema).min(1).max(10),
    maxSizeBytes: z.number().int().positive()
  })
  .strict();
export type VerificationRequirementsResponse = z.infer<
  typeof verificationRequirementsResponseSchema
>;

export const getAstrologerVerificationResponseSchema = z
  .object({
    status: astrologerVerificationStatusSchema,
    application: verificationApplicationResponseSchema.nullable(),
    requirements: verificationRequirementsResponseSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "none" && value.application) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["application"],
        message: "No verification status cannot include an application"
      });
    }
    if (value.application && value.status !== value.application.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Verification status must match the latest application status"
      });
    }
  });
export type GetAstrologerVerificationResponse = z.infer<
  typeof getAstrologerVerificationResponseSchema
>;

const qualificationDocumentIdsSchema = z
  .array(uuidSchema)
  .min(1)
  .max(5)
  .superRefine((values, ctx) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Qualification document ids must be unique"
      });
    }
  });

export const submitAstrologerVerificationRequestSchema = z
  .object({
    identityDocumentMediaId: uuidSchema,
    qualificationDocumentMediaIds: qualificationDocumentIdsSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.qualificationDocumentMediaIds.includes(value.identityDocumentMediaId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qualificationDocumentMediaIds"],
        message: "Identity document cannot also be a qualification document"
      });
    }
  });
export type SubmitAstrologerVerificationRequest = z.infer<
  typeof submitAstrologerVerificationRequestSchema
>;
