import { z } from "@elevenhouse/validation";

const uuidSchema = z.string().uuid();
const minorAmountSchema = z.string().regex(/^[1-9][0-9]*$/).max(38);

export const adminOnlineWalletRefundCandidateParamsSchema = z
  .object({ candidateId: uuidSchema })
  .strict();
export type AdminOnlineWalletRefundCandidateParams = z.infer<
  typeof adminOnlineWalletRefundCandidateParamsSchema
>;

/** The amount is the sole money field an administrator can decide; all payment facts are server-derived. */
export const adminOnlineWalletRefundAuthorizationRequestSchema = z
  .object({ refundAmountMinor: minorAmountSchema })
  .strict();
export type AdminOnlineWalletRefundAuthorizationRequest = z.infer<
  typeof adminOnlineWalletRefundAuthorizationRequestSchema
>;

export const adminOnlineWalletRefundApprovalRequestSchema =
  adminOnlineWalletRefundAuthorizationRequestSchema
    .extend({ authorizationId: uuidSchema })
    .strict();
export type AdminOnlineWalletRefundApprovalRequest = z.infer<
  typeof adminOnlineWalletRefundApprovalRequestSchema
>;

export const adminOnlineWalletRefundApprovalResponseSchema = z
  .object({
    refundCaseId: z.string().trim().min(1).max(200),
    walletId: uuidSchema,
    walletRevision: z.string().regex(/^[1-9][0-9]*$/),
    providerOperationIntentId: uuidSchema,
    status: z.literal("approved")
  })
  .strict();
export type AdminOnlineWalletRefundApprovalResponse = z.infer<
  typeof adminOnlineWalletRefundApprovalResponseSchema
>;
