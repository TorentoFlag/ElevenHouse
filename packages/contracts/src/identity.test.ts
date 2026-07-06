import { describe, expect, it } from "vitest";
import {
  authenticatedAstrologerAccountResponseSchema,
  authenticatedCustomerAccountResponseSchema,
  requestAstrologerPasswordlessCodeRequestSchema,
  requestPasswordlessCodeRequestSchema,
  requestPasswordlessCodeResponseSchema,
  verifyAstrologerRegistrationPasswordlessCodeRequestSchema,
  verifyAstrologerRegistrationPasswordlessCodeResponseSchema,
  verifyAstrologerPasswordlessCodeResponseSchema,
  verifyPasswordlessCodeRequestSchema,
  verifyPasswordlessCodeResponseSchema,
  verifyRegistrationPasswordlessCodeRequestSchema,
  verifyRegistrationPasswordlessCodeResponseSchema
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

  it("rejects unsupported channels", () => {
    expect(() =>
      requestPasswordlessCodeRequestSchema.parse({
        channel: "telegram",
        identifier: "client@example.com",
        roles: ["client"]
      })
    ).toThrow();
  });

  it("rejects invalid phone identifiers", () => {
    expect(() =>
      requestPasswordlessCodeRequestSchema.parse({
        channel: "phone",
        identifier: "555-0100",
        roles: ["client"]
      })
    ).toThrow();
  });
});

describe("requestAstrologerPasswordlessCodeRequestSchema", () => {
  it("normalizes email requests without exposing role selection to the caller", () => {
    expect(
      requestAstrologerPasswordlessCodeRequestSchema.parse({
        channel: "email",
        identifier: "  ASTROLOGER@example.COM "
      })
    ).toEqual({
      channel: "email",
      identifier: "astrologer@example.com"
    });
  });

  it("rejects caller-controlled roles", () => {
    expect(() =>
      requestAstrologerPasswordlessCodeRequestSchema.parse({
        channel: "email",
        identifier: "astrologer@example.com",
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

  it("rejects non-uuid challenge ids", () => {
    expect(() =>
      verifyPasswordlessCodeRequestSchema.parse({
        challengeId: "challenge_1",
        code: "123456"
      })
    ).toThrow();
  });

  it("rejects alphanumeric codes", () => {
    expect(() =>
      verifyPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "12A456"
      })
    ).toThrow();
  });

  it("accepts optional client join intent token during public login verification", () => {
    expect(
      verifyPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        clientJoinIntentToken: "join_1234567890abcdef"
      })
    ).toMatchObject({ clientJoinIntentToken: "join_1234567890abcdef" });
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

describe("verifyRegistrationPasswordlessCodeRequestSchema", () => {
  it("normalizes public passwordless registration requests", () => {
    expect(
      verifyRegistrationPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: " Анна ",
        roles: ["client"]
      })
    ).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      displayName: "Анна",
      roles: ["client"]
    });
  });

  it("rejects internal roles in public registration requests", () => {
    expect(() =>
      verifyRegistrationPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Анна",
        roles: ["admin"]
      })
    ).toThrow();
  });

  it("rejects astrologer self-assignment in public registration requests", () => {
    expect(() =>
      verifyRegistrationPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Анна",
        roles: ["astrologer"]
      })
    ).toThrow();
  });

  it("accepts optional client join intent token during public registration verification", () => {
    expect(
      verifyRegistrationPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Марина",
        roles: ["client"],
        clientJoinIntentToken: "join_1234567890abcdef"
      })
    ).toMatchObject({ roles: ["client"], clientJoinIntentToken: "join_1234567890abcdef" });
  });
});

describe("verifyRegistrationPasswordlessCodeResponseSchema", () => {
  it("returns a registered account with a display name", () => {
    expect(
      verifyRegistrationPasswordlessCodeResponseSchema.parse({
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"],
          displayName: "Анна"
        }
      })
    ).toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"],
        displayName: "Анна"
      }
    });
  });
});

describe("verifyAstrologerRegistrationPasswordlessCodeRequestSchema", () => {
  it("normalizes astrologer passwordless registration requests", () => {
    expect(
      verifyAstrologerRegistrationPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: " Астролог Анна "
      })
    ).toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      displayName: "Астролог Анна"
    });
  });

  it("rejects caller-controlled roles", () => {
    expect(() =>
      verifyAstrologerRegistrationPasswordlessCodeRequestSchema.parse({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Астролог Анна",
        roles: ["admin"]
      })
    ).toThrow();
  });
});

describe("verifyAstrologerRegistrationPasswordlessCodeResponseSchema", () => {
  it("returns a registered astrologer account with a display name", () => {
    expect(
      verifyAstrologerRegistrationPasswordlessCodeResponseSchema.parse({
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["astrologer"],
          displayName: "Астролог Анна"
        }
      })
    ).toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["astrologer"],
        displayName: "Астролог Анна"
      }
    });
  });

  it("requires the registered account to have the astrologer role", () => {
    expect(() =>
      verifyAstrologerRegistrationPasswordlessCodeResponseSchema.parse({
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"],
          displayName: "Астролог Анна"
        }
      })
    ).toThrow();
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

describe("authenticatedAstrologerAccountResponseSchema", () => {
  it("requires the astrologer role", () => {
    expect(
      authenticatedAstrologerAccountResponseSchema.parse({
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

    expect(() =>
      verifyAstrologerPasswordlessCodeResponseSchema.parse({
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"]
        }
      })
    ).toThrow();
  });
});
