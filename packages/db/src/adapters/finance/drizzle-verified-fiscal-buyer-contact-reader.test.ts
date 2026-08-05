import { describe, expect, it } from "vitest";

import {
  VerifiedFiscalBuyerContactReaderPersistenceError,
  mapVerifiedFiscalBuyerContact
} from "./drizzle-verified-fiscal-buyer-contact-reader";

describe("Drizzle verified fiscal buyer-contact reader", () => {
  it("accepts only the client-owned contact with matching verification evidence", () => {
    expect(
      mapVerifiedFiscalBuyerContact(
        {
          userId: "11111111-1111-4111-8111-111111111111",
          email: "client@example.com",
          emailVerifiedAt: new Date("2026-08-04T12:00:00.000Z"),
          phoneNumber: null,
          phoneVerifiedAt: null
        } as never,
        "11111111-1111-4111-8111-111111111111",
        { kind: "email", value: "client@example.com" }
      )
    ).toEqual({ kind: "email", value: "client@example.com" });
  });

  it("fails closed for an unverified or nonmatching identity value", () => {
    expect(() =>
      mapVerifiedFiscalBuyerContact(
        {
          userId: "11111111-1111-4111-8111-111111111111",
          email: "client@example.com",
          emailVerifiedAt: null,
          phoneNumber: null,
          phoneVerifiedAt: null
        } as never,
        "11111111-1111-4111-8111-111111111111",
        { kind: "email", value: "client@example.com" }
      )
    ).toThrow(VerifiedFiscalBuyerContactReaderPersistenceError);
  });
});
