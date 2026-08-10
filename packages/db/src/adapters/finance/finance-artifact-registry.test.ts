import { describe, expect, it } from "vitest";

import { isFinanceArtifactAccessAllowed } from "./finance-artifact-registry";

describe("isFinanceArtifactAccessAllowed", () => {
  it("allows astrologer billing to deliver a saved-card 3DS provider response", () => {
    expect(
      isFinanceArtifactAccessAllowed({
        serviceIdentity: "astrologer_billing",
        purpose: "saved_card_customer_action_delivery",
        artifactClass: "provider_response"
      })
    ).toBe(true);
  });

  it("does not grant astrologer billing access to provider requests", () => {
    expect(
      isFinanceArtifactAccessAllowed({
        serviceIdentity: "astrologer_billing",
        purpose: "saved_card_customer_action_delivery",
        artifactClass: "provider_request"
      })
    ).toBe(false);
  });
});
