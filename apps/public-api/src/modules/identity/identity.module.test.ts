import type {
  AccountRegistrationUnitOfWork,
  AuthSessionCreationUnitOfWork
} from "@elevenhouse/domain";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityRegistrationService } from "./identity-registration.service";
import { IdentityModule } from "./identity.module";
import {
  ACCOUNT_REGISTRATION_UNIT_OF_WORK,
  AUTH_SESSION_CREATION_UNIT_OF_WORK
} from "./identity-registration.tokens";
import { Argon2PasswordHasher, type PasswordHasher } from "./identity-registration.handler";
import { PublicSessionTokenIssuer, SystemClock } from "./identity-session.service";

describe("IdentityModule", () => {
  it("wires the registration service to a real domain-backed handler provider", async () => {
    const accountRegistration: AccountRegistrationUnitOfWork = {
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
          }))
        })
    };
    const passwordHasher: PasswordHasher = {
      hashPassword: vi.fn(async () => "argon2id$hash")
    };
    const authSessionCreation: AuthSessionCreationUnitOfWork = {
      transact: async (operation) =>
        operation({
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
      .overrideProvider(ACCOUNT_REGISTRATION_UNIT_OF_WORK)
      .useValue(accountRegistration)
      .overrideProvider(AUTH_SESSION_CREATION_UNIT_OF_WORK)
      .useValue(authSessionCreation)
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

    await moduleRef.close();
  });
});
