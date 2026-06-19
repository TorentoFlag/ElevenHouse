import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { CsrfGuard } from "./csrf.guard";
import type { OpsCsrfTokenService } from "./ops-csrf-token.service";

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn(() => ({
      getRequest: () => ({ headers })
    }))
  } as unknown as ExecutionContext;
}

function createGuard(input: {
  readonly csrfRequired: boolean | undefined;
  readonly assertValidRequest?: OpsCsrfTokenService["assertValidRequest"];
}): CsrfGuard {
  return new CsrfGuard(
    {
      getAllAndOverride: vi.fn(() => input.csrfRequired)
    } as unknown as Reflector,
    {
      assertValidRequest: input.assertValidRequest ?? vi.fn()
    } as unknown as OpsCsrfTokenService,
    {
      getOrThrow: vi.fn((key: string) => {
        if (key === "opsApi.sessionCookieName") {
          return "elevenhouse_ops_session";
        }

        throw new Error(`Unexpected config key: ${key}`);
      })
    } as unknown as ConfigService
  );
}

describe("CsrfGuard", () => {
  it("allows routes without CSRF metadata", () => {
    const guard = createGuard({ csrfRequired: undefined });

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it("requires an ops session cookie when CSRF metadata is present", () => {
    const guard = createGuard({ csrfRequired: true });

    expect(() => guard.canActivate(createContext({}))).toThrow(UnauthorizedException);
  });

  it("delegates CSRF validation when a session cookie is present", () => {
    const assertValidRequest = vi.fn();
    const guard = createGuard({ csrfRequired: true, assertValidRequest });
    const context = createContext({
      cookie: "elevenhouse_ops_session=raw-session-token"
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(assertValidRequest).toHaveBeenCalledWith({
      request: {
        headers: {
          cookie: "elevenhouse_ops_session=raw-session-token"
        }
      },
      sessionToken: "raw-session-token"
    });
  });
});
