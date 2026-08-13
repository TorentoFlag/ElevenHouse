import { describe, expect, it } from "vitest";
import { authSecurityEventTypeValues, normalizeAuthSecurityEventInput } from "./auth-security-event";

describe("authSecurityEventTypeValues", () => {
  it("lists supported auth security event types", () => {
    expect(authSecurityEventTypeValues).toEqual([
      "registration_succeeded",
      "login_succeeded",
      "login_failed",
      "logout_succeeded",
      "session_revoked",
      "refresh_succeeded",
      "refresh_token_reuse_detected"
    ]);
  });
});

describe("normalizeAuthSecurityEventInput", () => {
  it("normalizes optional event context and metadata", () => {
    expect(
      normalizeAuthSecurityEventInput({
        eventType: "registration_succeeded",
        occurredAt: new Date("2026-06-14T10:00:00.000Z"),
        userId: "user_1",
        sessionId: "session_1",
        ipAddress: "  127.0.0.1  ",
        userAgent: "  Mozilla/5.0  ",
        metadata: {
          surface: "public-api"
        }
      })
    ).toEqual({
      eventType: "registration_succeeded",
      occurredAt: "2026-06-14T10:00:00.000Z",
      userId: "user_1",
      sessionId: "session_1",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      metadata: {
        surface: "public-api"
      }
    });
  });
});
