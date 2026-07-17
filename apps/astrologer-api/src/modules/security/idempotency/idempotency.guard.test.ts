import { BadRequestException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { IdempotencyGuard } from "./idempotency.guard";

function createContext(
  headers: Record<string, string | readonly string[] | undefined>
): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn(() => ({ getRequest: () => ({ headers }) }))
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
});
