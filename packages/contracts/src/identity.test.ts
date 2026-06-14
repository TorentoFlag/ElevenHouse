import { describe, expect, it } from "vitest";
import {
  authenticatedCustomerAccountResponseSchema,
  loginCustomerAccountRequestSchema,
  registerCustomerAccountRequestSchema,
  registerCustomerAccountResponseSchema
} from "./identity";

describe("registerCustomerAccountRequestSchema", () => {
  it("accepts email/password registration for customer-facing roles", () => {
    expect(
      registerCustomerAccountRequestSchema.parse({
        email: "  CLIENT@example.COM ",
        password: "correct-horse-battery-staple",
        roles: ["client", "astrologer"]
      })
    ).toEqual({
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client", "astrologer"]
    });
  });

  it("rejects internal platform roles", () => {
    expect(() =>
      registerCustomerAccountRequestSchema.parse({
        email: "client@example.com",
        password: "correct-horse-battery-staple",
        roles: ["admin"]
      })
    ).toThrow();
  });

  it("accepts passwords with the product minimum length", () => {
    expect(
      registerCustomerAccountRequestSchema.parse({
        email: "client@example.com",
        password: "12345678",
        roles: ["client"]
      })
    ).toEqual({
      email: "client@example.com",
      password: "12345678",
      roles: ["client"]
    });
  });

  it("rejects passwords shorter than the product minimum length", () => {
    expect(() =>
      registerCustomerAccountRequestSchema.parse({
        email: "client@example.com",
        password: "1234567",
        roles: ["client"]
      })
    ).toThrow();
  });
});

describe("registerCustomerAccountResponseSchema", () => {
  it("exposes the registered account id, status and customer-facing roles", () => {
    expect(
      registerCustomerAccountResponseSchema.parse({
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

describe("loginCustomerAccountRequestSchema", () => {
  it("normalizes an email/password login request", () => {
    expect(
      loginCustomerAccountRequestSchema.parse({
        email: "  CLIENT@example.COM ",
        password: "correct-horse-battery-staple"
      })
    ).toEqual({
      email: "client@example.com",
      password: "correct-horse-battery-staple"
    });
  });
});

describe("authenticatedCustomerAccountResponseSchema", () => {
  it("exposes the authenticated account shape used by register, login and me", () => {
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
