import { BadRequestException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { adminIdempotencyRequiredMetadataKey } from "../route-policy/route-security-policy";
import { AdminIdempotencyGuard } from "./admin-idempotency.guard";

describe("AdminIdempotencyGuard", () => {
  it("requires exactly one valid Idempotency-Key on protected admin mutations", () => {
    const guard = new AdminIdempotencyGuard(reflector(true));

    expect(() => guard.canActivate(context({ headers: {} }))).toThrow(BadRequestException);
    expect(() =>
      guard.canActivate(context({ headersDistinct: { "idempotency-key": ["a", "b"] } }))
    ).toThrow(BadRequestException);
    expect(
      guard.canActivate(context({ headers: { "idempotency-key": "admin-tariff-1" } }))
    ).toBe(true);
  });

  it("receives Reflector from Nest DI for a protected HTTP mutation", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminIdempotencyGuard,
        { provide: Reflector, useValue: reflector(true) }
      ]
    }).compile();
    try {
      const guard = moduleRef.get(AdminIdempotencyGuard);
      expect(
        guard.canActivate(context({ headers: { "idempotency-key": "admin-tariff-1" } }))
      ).toBe(true);
    } finally {
      await moduleRef.close();
    }
  });
});

function reflector(required: boolean) {
  return {
    getAllAndOverride: (key: string) => key === adminIdempotencyRequiredMetadataKey && required
  } as unknown as ConstructorParameters<typeof AdminIdempotencyGuard>[0];
}

function context(request: Record<string, unknown>) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as Parameters<AdminIdempotencyGuard["canActivate"]>[0];
}
