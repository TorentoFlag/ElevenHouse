import { z } from "@elevenhouse/validation";

const identifier = z.string().trim().min(1).max(200);
const uuid = z.string().uuid();
const request = z.object({ outcomeWebhookEventId: identifier, resolution: z.enum(["won", "lost"]) }).strict();

export const adminChargebackResolutionAuthorizationRequestSchema = request;
export type AdminChargebackResolutionAuthorizationRequest = z.infer<typeof request>;
export const adminChargebackResolutionExecuteRequestSchema = request.extend({ authorizationId: uuid }).strict();
export type AdminChargebackResolutionExecuteRequest = z.infer<typeof adminChargebackResolutionExecuteRequestSchema>;
export const adminChargebackResolutionResponseSchema = z.object({ chargebackCaseId: identifier, resolution: z.enum(["won_reversed", "lost_after_paid_platform_loss"]), status: z.literal("resolved") }).strict();
export type AdminChargebackResolutionResponse = z.infer<typeof adminChargebackResolutionResponseSchema>;
