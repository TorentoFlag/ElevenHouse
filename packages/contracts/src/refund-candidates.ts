import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });

export const refundCandidateStatusValues = [
  "submitted",
  "under_review",
  "rejected",
  "resolved"
] as const;
export const refundCandidateStatusSchema = z.enum(refundCandidateStatusValues);

export const submitClientRefundCandidateRequestSchema = z
  .object({
    statement: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      // eslint-disable-next-line no-control-regex -- Exact ASCII C0/DEL rejection is a persisted API contract.
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
        message: "Statement must not contain control characters"
      })
  })
  .strict();
export type SubmitClientRefundCandidateRequest = z.infer<
  typeof submitClientRefundCandidateRequestSchema
>;

/** Client-facing review state deliberately has no monetary or provider identifiers. */
export const clientRefundCandidateResponseSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    clientUserId: uuidSchema,
    statement: z.string().trim().min(1).max(2_000),
    status: refundCandidateStatusSchema,
    submittedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();
export type ClientRefundCandidateResponse = z.infer<typeof clientRefundCandidateResponseSchema>;

export const refundCandidateOrderParamsSchema = z.object({ orderId: uuidSchema }).strict();
export type RefundCandidateOrderParams = z.infer<typeof refundCandidateOrderParamsSchema>;
