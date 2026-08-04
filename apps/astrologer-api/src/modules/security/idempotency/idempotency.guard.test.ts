import { BadRequestException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { IdempotencyGuard } from "./idempotency.guard";

function createContext(
  headers: Record<string, string | readonly string[] | undefined>,
  requestOverrides: {
    readonly headersDistinct?: Record<string, readonly string[] | undefined>;
    readonly rawHeaders?: readonly string[];
  } = {}
): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn(() => ({ getRequest: () => ({ headers, ...requestOverrides }) }))
  } as unknown as ExecutionContext;
}

function reflector(requirement: { scope: string } | undefined): Reflector {
  return {
    getAllAndOverride: vi.fn(() => requirement)
  } as unknown as Reflector;
}

describe("IdempotencyGuard", () => {
  it("does not require a key on routes without idempotency metadata", () => {
    expect(new IdempotencyGuard(reflector(undefined)).canActivate(createContext({}))).toBe(true);
  });

  it.each([
    "booking-create:owner-1:request-1",
    ["booking-create:owner-1:request-1"] as const,
    "  booking-create:owner-1:request-1  "
  ])("accepts the supported Idempotency-Key header shape", (value) => {
    expect(
      new IdempotencyGuard(reflector({ scope: "bookings.manual.create" })).canActivate(
        createContext({ "idempotency-key": value })
      )
    ).toBe(true);
  });

  it.each([undefined, "", "short", "contains spaces", "x".repeat(129)])(
    "rejects a missing or invalid Idempotency-Key header",
    (value) => {
      expect(() =>
        new IdempotencyGuard(reflector({ scope: "bookings.manual.create" })).canActivate(
          createContext({ "idempotency-key": value })
        )
      ).toThrow(BadRequestException);
    }
  );

  it.each([
    ["same value twice", ["booking-create:request-1", "booking-create:request-1"]],
    ["different values", ["booking-create:request-1", "booking-create:request-2"]]
  ])("rejects duplicate Idempotency-Key field lines: %s", (_label, values) => {
    expect(() =>
      new IdempotencyGuard(reflector({ scope: "bookings.manual.create" })).canActivate(
        createContext(
          { "idempotency-key": values[0] },
          { headersDistinct: { "idempotency-key": values } }
        )
      )
    ).toThrow(BadRequestException);
  });

  it("rejects duplicates from rawHeaders when headersDistinct is unavailable", () => {
    expect(() =>
      new IdempotencyGuard(reflector({ scope: "bookings.manual.create" })).canActivate(
        createContext(
          { "idempotency-key": "booking-create:request-1" },
          {
            rawHeaders: [
              "Idempotency-Key",
              "booking-create:request-1",
              "idempotency-key",
              "booking-create:request-2"
            ]
          }
        )
      )
    ).toThrow(BadRequestException);
  });

  it("rejects a multi-value framework header representation", () => {
    expect(() =>
      new IdempotencyGuard(reflector({ scope: "bookings.manual.create" })).canActivate(
        createContext({
          "idempotency-key": ["booking-create:request-1", "booking-create:request-2"]
        })
      )
    ).toThrow(BadRequestException);
  });
});
