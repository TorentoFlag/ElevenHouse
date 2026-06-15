import { describe, expect, it } from "vitest";
import {
  authenticatedCustomerAccountResponseSchema,
  requestPasswordlessCodeRequestSchema,
  requestPasswordlessCodeResponseSchema,
  verifyPasswordlessCodeRequestSchema,
  verifyPasswordlessCodeResponseSchema
} from "./identity";

describe("requestPasswordlessCodeRequestSchema", () => {
  it("normalizes email code requests and accepts customer-facing roles", () => {
    expect(
      requestPasswordlessCodeRequestSchema.parse({
        channel: "email",
        identifier: "  CLIENT@example.COM ",
        roles: ["client", "astrologer"]
      })
    ).toEqual({
      channel: "email",
      identifier: "client@example.com",
      roles: ["client", "astrologer"]
    });
  });

  it("normalizes phone code requests to a compact E.164-like value", () => {
    expect(
      requestPasswordlessCodeRequestSchema.parse({
        channel: "phone",
        identifier: " +7 (999) 000-11-22 ",
        roles: ["client"]
      })
    ).toEqual({
      channel: "phone",
      identifier: "+79990001122",
      roles: ["client"]
    });
  });

  it("rejects internal roles", () => {
    expect(() =>
      requestPasswordlessCodeRequestSchema.parse({
        channel: "email",
        identifier: "client@example.com",
        roles: ["admin"]
      })
    ).toThrow();
  });
});

describe("requestPasswordlessCodeResponseSchema", () => {
  it("exposes challenge metadata without the plaintext code", () => {
    expect(
      requestPasswordlessCodeResponseSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email",
        maskedIdentifier: "c***@example.com",
        expiresAt: "2026-06-15T10:10:00.000Z",
        resendAvailableAt: "2026-06-15T10:01:00.000Z"
      })
    ).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "c***@example.com",
      expiresAt: "2026-06-15T10:10:00.000Z",
      resendAvailableAt: "2026-06-15T10:01:00.000Z"
    });
  });
});

describe("verifyPasswordlessCodeRequestSchema", () => {
  it("accepts a six-digit code", () => {
    expect(
      verifyPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456"
      })
    ).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456"
    });
  });

  it("rejects non-six-digit codes", () => {
    expect(() =>
      verifyPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "12345"
      })
    ).toThrow();
  });
});

describe("verifyPasswordlessCodeResponseSchema", () => {
  it("uses the authenticated account response shape", () => {
    expect(
      verifyPasswordlessCodeResponseSchema.parse({
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"]
        }
      })
    ).toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    });
  });
});

describe("authenticatedCustomerAccountResponseSchema", () => {
  it("exposes the authenticated account shape used by verify and me", () => {
    expect(
      authenticatedCustomerAccountResponseSchema.parse({
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client", "astrologer"]
        }
      })
    ).toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client", "astrologer"]
      }
    });
  });
});
