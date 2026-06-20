import { describe, expect, it } from "vitest";
import { getIdentityRequestContext } from "./identity-http-context";

describe("getIdentityRequestContext", () => {
  it("uses the framework-resolved request ip and user agent", () => {
    expect(
      getIdentityRequestContext({
        ip: "203.0.113.10",
        headers: {
          "user-agent": "ElevenHouse-Test/1.0"
        },
        socket: {
          remoteAddress: "10.0.0.2"
        }
      })
    ).toEqual({
      ipAddress: "203.0.113.10",
      userAgent: "ElevenHouse-Test/1.0"
    });
  });

  it("does not trust caller supplied x-forwarded-for headers directly", () => {
    expect(
      getIdentityRequestContext({
        headers: {
          "x-forwarded-for": "198.51.100.99"
        },
        socket: {
          remoteAddress: "10.0.0.2"
        }
      })
    ).toEqual({
      ipAddress: "10.0.0.2"
    });
  });
});
