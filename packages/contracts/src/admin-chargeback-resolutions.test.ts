import { describe, expect, it } from "vitest";
import {
  adminChargebackResolutionAuthorizationRequestSchema,
  adminChargebackResolutionExecuteRequestSchema,
  adminChargebackResolutionResponseSchema
} from "./admin-chargeback-resolutions";

describe("admin chargeback resolution contracts", () => {
  it("accepts only an explicit terminal choice bound to one saved event", () => {
    expect(adminChargebackResolutionAuthorizationRequestSchema.parse({ outcomeWebhookEventId: "arc-outcome-1", resolution: "won" })).toEqual({ outcomeWebhookEventId: "arc-outcome-1", resolution: "won" });
    expect(adminChargebackResolutionExecuteRequestSchema.parse({ outcomeWebhookEventId: "arc-outcome-1", resolution: "lost", authorizationId: "11111111-1111-4111-8111-111111111111" }).resolution).toBe("lost");
    expect(() => adminChargebackResolutionAuthorizationRequestSchema.parse({ outcomeWebhookEventId: "arc-outcome-1", resolution: "unknown" })).toThrow();
    expect(adminChargebackResolutionResponseSchema.parse({ chargebackCaseId: "case-1", resolution: "won_reversed", status: "resolved" }).status).toBe("resolved");
  });
});
