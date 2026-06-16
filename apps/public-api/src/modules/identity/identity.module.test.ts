import type {
  AuthSessionAuthenticationStore,
  AuthenticatedSessionContext,
  PasswordlessAuthStore,
  PasswordlessAuthUnitOfWork
} from "@elevenhouse/domain";
import { hashPasswordlessCode } from "@elevenhouse/domain";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityPasswordlessService } from "./identity-passwordless.service";
import { IdentityModule } from "./identity.module";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "./identity-auth.tokens";
import { AUTH_CODE_DELIVERY, PASSWORDLESS_AUTH_UNIT_OF_WORK } from "./identity-passwordless.tokens";
import { PUBLIC_AUTH_CODE_GENERATOR } from "./identity-passwordless.handler";
import { IdentityCurrentSessionService } from "./identity-current-session.service";
import { PublicSessionTokenIssuer, SystemClock } from "./identity-session.service";

describe("IdentityModule", () => {
  it("wires passwordless auth to domain-backed providers and keeps session resolution working", async () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    const store: PasswordlessAuthStore = {
      createChallenge: vi.fn(async (input) => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        ...input,
        status: "pending",
        attempts: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      })),
      recordDelivery: vi.fn(async (input) => ({
        id: "delivery_1",
        createdAt: now.toISOString(),
        ...input
      })),
      cancelChallenge: vi.fn(async () => undefined),
      findChallengeById: vi.fn(async () => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "email" as const,
        identifier: "client@example.com",
        identifierNormalized: "client@example.com",
        codeHash: hashPasswordlessCode({
          secret: "test-secret",
          channel: "email",
          identifierNormalized: "client@example.com",
          code: "123456"
        }),
        requestedRoles: ["client"] as const,
        status: "pending" as const,
        attempts: 0,
        maxAttempts: 5,
        expiresAt: "2026-06-16T10:10:00.000Z",
        resendAvailableAt: "2026-06-16T10:01:00.000Z",
        createdAt: "2026-06-16T10:00:00.000Z",
        updatedAt: "2026-06-16T10:00:00.000Z"
      })),
      incrementChallengeAttempts: vi.fn(async () => undefined),
      consumeChallenge: vi.fn(async () => undefined),
      findAuthIdentityByProviderSubject: vi.fn(async () => null),
      createUser: vi.fn(async (input) => ({
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: input.status,
        createdAt: "2026-06-16T10:00:00.000Z",
        updatedAt: "2026-06-16T10:00:00.000Z"
      })),
      createAuthIdentity: vi.fn(async (input) => ({
        id: "identity_1",
        userId: input.userId,
        provider: input.provider,
        providerSubject: input.providerSubject,
        email: input.email,
        emailVerifiedAt: input.emailVerifiedAt,
        createdAt: "2026-06-16T10:00:00.000Z",
        updatedAt: "2026-06-16T10:00:00.000Z"
      })),
      assignRole: vi.fn(async (input) => ({
        id: `role_${input.role}`,
        userId: input.userId,
        role: input.role,
        assignedAt: "2026-06-16T10:00:00.000Z"
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
    };
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async (operation) =>
        operation(store)
    };
    const delivery = {
      deliverAuthCode: vi.fn(async () => ({
        provider: "dev",
        status: "sent" as const,
        providerMessageId: "dev-message-1"
      }))
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

          if (key === "publicApi.passwordlessCodeSecret") {
            return "test-secret";
          }

          if (key === "publicApi.passwordlessCodeTtlSeconds") {
            return 600;
          }

          if (key === "publicApi.passwordlessResendCooldownSeconds") {
            return 60;
          }

          if (key === "publicApi.passwordlessMaxAttempts") {
            return 5;
          }

          if (key === "publicApi.sessionCookieSecure") {
            return false;
          }

          if (key === "publicApi.sessionCookieName") {
            return "elevenhouse_public_session";
          }

          throw new Error(`Unexpected config key: ${key}`);
        })
      })
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_CODE_DELIVERY)
      .useValue(delivery)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(authSessionAuthenticationStore)
      .overrideProvider(PUBLIC_AUTH_CODE_GENERATOR)
      .useValue({
        generateCode: vi.fn(() => "123456")
      })
      .overrideProvider(PublicSessionTokenIssuer)
      .useValue({
        issueSessionToken: vi.fn(() => ({
          token: "raw-session-token",
          tokenHash: "hashed-session-token"
        }))
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => new Date("2026-06-16T10:00:00.000Z"))
      })
      .compile();

    const service = moduleRef.get(IdentityPasswordlessService);
    const currentSessionService = moduleRef.get(IdentityCurrentSessionService);

    await expect(
      service.requestCode({
        channel: "email",
        identifier: "client@example.com",
        roles: ["client"]
      })
    ).resolves.toEqual({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "c***@example.com",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
    await expect(
      service.verifyCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456"
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
        expiresAt: "2026-06-23T10:00:00.000Z"
      }
    });
    expect(delivery.deliverAuthCode).toHaveBeenCalled();
    await expect(
      currentSessionService.resolveCurrentCustomerAccount({
        headers: {
          cookie: "elevenhouse_public_session=raw-session-token"
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
