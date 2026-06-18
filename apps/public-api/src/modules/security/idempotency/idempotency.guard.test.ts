import { BadRequestException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { IdempotencyGuard } from "./idempotency.guard";

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn(() => ({
      getRequest: () => ({ headers })
    }))
  } as unknown as ExecutionContext;
}

describe("IdempotencyGuard", () => {
  it("allows routes without idempotency metadata", () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => undefined)
    } as unknown as Reflector;

    expect(new IdempotencyGuard(reflector).canActivate(createContext({}))).toBe(true);
  });

  it("requires a valid Idempotency-Key when metadata is present", () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => ({ scope: "orders.create" }))
    } as unknown as Reflector;

    expect(
      new IdempotencyGuard(reflector).canActivate(
        createContext({
          "idempotency-key": "order-create:client-1:request-1"
        })
      )
    ).toBe(true);
  });

  it("rejects missing idempotency keys when metadata is present", () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => ({ scope: "orders.create" }))
    } as unknown as Reflector;

    expect(() => new IdempotencyGuard(reflector).canActivate(createContext({}))).toThrow(
      BadRequestException
    );
  });
});
