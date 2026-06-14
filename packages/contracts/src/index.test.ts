import { describe, expect, it } from "vitest";
import {
  healthResponseSchema,
  registerCustomerAccountRequestSchema,
  registerCustomerAccountResponseSchema
} from "./index";

describe("healthResponseSchema", () => {
  it("accepts health responses with ISO timestamps", () => {
    expect(
      healthResponseSchema.parse({
        service: "public-api",
        status: "ok",
        timestamp: "2026-06-09T00:00:00.000Z"
      })
    ).toEqual({
      service: "public-api",
      status: "ok",
      timestamp: "2026-06-09T00:00:00.000Z"
    });
  });
});

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
