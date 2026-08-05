import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const candidateStatusSchema = z.enum(["submitted", "under_review", "rejected", "resolved"]);

export const adminRefundCandidateReviewRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    action: z.enum(["claimed", "rejected"]),
    note: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      // eslint-disable-next-line no-control-regex -- Exact ASCII C0/DEL rejection is a persisted API contract.
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
        message: "Review note must not contain control characters"
      })
  })
  .strict();
export type AdminRefundCandidateReviewRequest = z.infer<
  typeof adminRefundCandidateReviewRequestSchema
>;

export const adminRefundCandidateParamsSchema = z.object({ candidateId: uuidSchema }).strict();
export type AdminRefundCandidateParams = z.infer<typeof adminRefundCandidateParamsSchema>;

export const adminRefundCandidateListQuerySchema = z
  .object({
    status: candidateStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();
export type AdminRefundCandidateListQuery = z.infer<typeof adminRefundCandidateListQuerySchema>;

const adminRefundCandidateSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    clientUserId: uuidSchema,
    statement: z.string().trim().min(1).max(2_000),
    status: candidateStatusSchema,
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    submittedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const adminRefundCandidateListResponseSchema = z
  .object({ candidates: z.array(adminRefundCandidateSchema).max(100) })
  .strict();
export type AdminRefundCandidateListResponse = z.infer<
  typeof adminRefundCandidateListResponseSchema
>;

const adminRefundCandidateReviewSchema = z
  .object({
    id: uuidSchema,
    candidateId: uuidSchema,
    candidateVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    actorUserId: uuidSchema,
    action: z.enum(["claimed", "rejected"]),
    note: z.string().trim().min(1).max(2_000),
    reviewedAt: isoDateTimeSchema
  })
  .strict();

/** A review receipt is not an approval, refund or verified provider result. */
export const adminRefundCandidateReviewResponseSchema = z
  .object({ candidate: adminRefundCandidateSchema, review: adminRefundCandidateReviewSchema })
  .strict();
export type AdminRefundCandidateReviewResponse = z.infer<
  typeof adminRefundCandidateReviewResponseSchema
>;
