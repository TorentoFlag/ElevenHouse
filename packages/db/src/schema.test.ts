import { platformRoles } from "@elevenhouse/auth";
import { describe, expect, it } from "vitest";
import {
  authChallengeDeliveries,
  authChallengeDeliveryStatusValues,
  authChallenges,
  authChallengeStatusValues,
  authSecurityEventTypeValues,
  authSessionStatusValues,
  databasePlatformRoleValues,
  identityProviderValues,
  userStatusValues
} from "./schema/index";

describe("database account schema constants", () => {
  it("keeps database role checks aligned with the application role model", () => {
    expect(databasePlatformRoleValues).toEqual(platformRoles);
  });

  it("allows the launch identity providers", () => {
    expect(identityProviderValues).toEqual(["email", "phone", "telegram", "google", "apple"]);
  });

  it("keeps account statuses explicit", () => {
    expect(userStatusValues).toEqual(["active", "suspended", "deleted"]);
  });

  it("keeps auth session statuses explicit", () => {
    expect(authSessionStatusValues).toEqual(["active", "revoked"]);
  });

  it("keeps auth challenge statuses explicit", () => {
    expect(authChallengeStatusValues).toEqual(["pending", "consumed", "cancelled"]);
  });

  it("keeps auth challenge delivery statuses explicit", () => {
    expect(authChallengeDeliveryStatusValues).toEqual(["queued", "sent", "failed"]);
  });

  it("exports passwordless auth challenge tables", () => {
    expect(authChallenges).toBeDefined();
    expect(authChallengeDeliveries).toBeDefined();
  });

  it("keeps auth security event types explicit", () => {
    expect(authSecurityEventTypeValues).toEqual([
      "registration_succeeded",
      "login_succeeded",
      "login_failed",
      "logout_succeeded",
      "session_revoked"
    ]);
  });
});
