import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { CsrfGuard } from "./csrf.guard";
import type { PublicCsrfTokenService } from "./public-csrf-token.service";

function createContext(
  headers: Record<string, string | undefined>,
  currentMobileSessionId?: string
): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn(() => ({
      getRequest: () => ({ headers, currentMobileSessionId })
    }))
  } as unknown as ExecutionContext;
}

function createGuard(input: {
  readonly csrfRequired: boolean | undefined;
  readonly assertValidRequest?: PublicCsrfTokenService["assertValidRequest"];
}): CsrfGuard {
  return new CsrfGuard(
    {
      getAllAndOverride: vi.fn(() => input.csrfRequired)
    } as unknown as Reflector,
    {
      assertValidRequest: input.assertValidRequest ?? vi.fn()
    } as unknown as PublicCsrfTokenService,
    {
      getOrThrow: vi.fn((key: string) => {
        if (key === "publicApi.sessionCookieName") {
          return "elevenhouse_public_session";
        }

        throw new Error(`Unexpected config key: ${key}`);
      })
    } as unknown as ConfigService,
    {
      now: vi.fn(() => new Date("2026-06-16T10:00:00.000Z"))
    }
  );
}

describe("CsrfGuard", () => {
  it("allows routes without CSRF metadata", () => {
    const guard = createGuard({ csrfRequired: undefined });

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it("requires a public session cookie when CSRF metadata is present", () => {
    const guard = createGuard({ csrfRequired: true });

    expect(() => guard.canActivate(createContext({}))).toThrow(UnauthorizedException);
  });

  it("allows a mobile bearer session without a CSRF cookie", () => {
    const assertValidRequest = vi.fn();
    const guard = createGuard({ csrfRequired: true, assertValidRequest });

    expect(guard.canActivate(createContext({}, "mobile-session-id"))).toBe(true);
    expect(assertValidRequest).not.toHaveBeenCalled();
  });

  it("delegates CSRF validation when a session cookie is present", () => {
    const assertValidRequest = vi.fn();
    const guard = createGuard({ csrfRequired: true, assertValidRequest });
    const context = createContext({
      cookie: "elevenhouse_public_session=raw-session-token"
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(assertValidRequest).toHaveBeenCalledWith({
      request: {
        headers: {
          cookie: "elevenhouse_public_session=raw-session-token"
        }
      },
      sessionToken: "raw-session-token",
      now: new Date("2026-06-16T10:00:00.000Z")
    });
  });
});
