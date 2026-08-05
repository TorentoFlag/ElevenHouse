import { describe, expect, it } from "vitest";

import { matchesVerifiedSavedCardConsentBuyerContact } from "./drizzle-saved-card-setup-initiation-uow";

describe("saved-card setup buyer-contact persistence guard", () => {
  const ownerUserId = "11111111-1111-4111-8111-111111111111";

  it("accepts only the selected verified identity of the consent owner", () => {
    expect(matchesVerifiedSavedCardConsentBuyerContact({
      userId: ownerUserId,
      email: "Billing@Example.com",
      emailVerifiedAt: new Date("2026-08-04T12:00:00.000Z"),
      phoneNumber: "+79990000000",
      phoneVerifiedAt: new Date("2026-08-04T12:00:00.000Z")
    }, ownerUserId, { kind: "email", value: "billing@example.com" })).toBe(true);

    expect(matchesVerifiedSavedCardConsentBuyerContact({
      userId: ownerUserId,
      email: "billing@example.com",
      emailVerifiedAt: null,
      phoneNumber: "+79990000000",
      phoneVerifiedAt: new Date("2026-08-04T12:00:00.000Z")
    }, ownerUserId, { kind: "email", value: "billing@example.com" })).toBe(false);

    expect(matchesVerifiedSavedCardConsentBuyerContact({
      userId: "22222222-2222-4222-8222-222222222222",
      email: "billing@example.com",
      emailVerifiedAt: new Date("2026-08-04T12:00:00.000Z"),
      phoneNumber: "+79990000000",
      phoneVerifiedAt: new Date("2026-08-04T12:00:00.000Z")
    }, ownerUserId, { kind: "phone", value: "+79990000000" })).toBe(false);
  });
});
