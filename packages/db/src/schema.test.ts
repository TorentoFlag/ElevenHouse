import { platformRoles } from "@elevenhouse/auth";
import { describe, expect, it } from "vitest";
import {
  databasePlatformRoleValues,
  identityProviderValues,
  userStatusValues
} from "./schema";

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
});
