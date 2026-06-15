import type {
  AuthSessionAuthenticationStore,
  AuthenticatedSessionContext,
  CustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityRegistrationService } from "./identity-registration.service";
import { IdentityModule } from "./identity.module";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "./identity-auth.tokens";
import { CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK } from "./identity-registration.tokens";
import { Argon2PasswordHasher, type PasswordHasher } from "./identity-registration.handler";
import { IdentityCurrentSessionService } from "./identity-current-session.service";
import { PublicSessionTokenIssuer, SystemClock } from "./identity-session.service";

describe("IdentityModule", () => {
  it("wires the registration service to a real domain-backed handler provider", async () => {
    const registration: CustomerAccountRegistrationSessionUnitOfWork = {
      transact: async (operation) =>
        operation({
          createUser: vi.fn(async (input) => ({
            id: "8e14390f-3db1-4d1c-9344-55679c778427",
            status: input.status,
            createdAt: "2026-06-14T00:00:00.000Z",
            updatedAt: "2026-06-14T00:00:00.000Z"
          })),
          createAuthIdentity: vi.fn(async (input) => ({
            id: "identity_1",
            userId: input.userId,
            provider: input.provider,
            providerSubject: input.providerSubject,
            email: input.email,
            createdAt: "2026-06-14T00:00:00.000Z",
            updatedAt: "2026-06-14T00:00:00.000Z"
          })),
          assignRole: vi.fn(async (input) => ({
            id: `role_${input.role}`,
            userId: input.userId,
            role: input.role,
            assignedAt: "2026-06-14T00:00:00.000Z"
          })),
          createSession: vi.fn(async (input) => ({
            id: "session_1",
            status: "active",
            ...input
          })),
          recordSecurityEvent: vi.fn(async (input) => ({
            id: "event_1",
            ...input
          }))
        })
    };
    const passwordHasher: PasswordHasher = {
      hashPassword: vi.fn(async () => "argon2id$hash")
    };
    const authenticatedContext = {
      session: {
        id: "session_1",
        userId: "8e14390f-3db1-4d1c-9344-55679c778427",
        tokenHash: "hashed-session-token",
        status: "active",
        createdAt: "2026-06-14T10:00:00.000Z",
        expiresAt: "2026-06-21T10:00:00.000Z"
      },
      user: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        createdAt: "2026-06-14T10:00:00.000Z",
        updatedAt: "2026-06-14T10:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_client",
          userId: "8e14390f-3db1-4d1c-9344-55679c778427",
          role: "client",
          assignedAt: "2026-06-14T10:00:00.000Z"
        }
      ]
    } satisfies AuthenticatedSessionContext;
    const authSessionAuthenticationStore: AuthSessionAuthenticationStore = {
      findByTokenHash: vi.fn(async () => authenticatedContext)
    };
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: vi.fn((key: string) => {
          if (key === "publicApi.sessionTtlSeconds") {
            return 604800;
          }

          if (key === "publicApi.sessionCookieSecure") {
            return false;
          }

          throw new Error(`Unexpected config key: ${key}`);
        })
      })
      .overrideProvider(CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(registration)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(authSessionAuthenticationStore)
      .overrideProvider(Argon2PasswordHasher)
      .useValue(passwordHasher)
      .overrideProvider(PublicSessionTokenIssuer)
      .useValue({
        issueSessionToken: vi.fn(() => ({
          token: "raw-session-token",
          tokenHash: "hashed-session-token"
        }))
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => new Date("2026-06-14T10:00:00.000Z"))
      })
      .compile();

    const service = moduleRef.get(IdentityRegistrationService);
    const currentSessionService = moduleRef.get(IdentityCurrentSessionService);

    await expect(
      service.registerCustomerAccount({
        email: "client@example.com",
        password: "correct-horse-battery-staple",
        roles: ["client"]
      })
    ).resolves.toEqual({
      response: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"]
        }
      },
      session: {
        token: "raw-session-token",
        expiresAt: "2026-06-21T10:00:00.000Z"
      }
    });
    await expect(
      currentSessionService.resolveCurrentCustomerAccount({
        headers: {
          cookie: "__Host-elevenhouse_public_session=raw-session-token"
        }
      })
    ).resolves.toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    });

    await moduleRef.close();
  });
});
