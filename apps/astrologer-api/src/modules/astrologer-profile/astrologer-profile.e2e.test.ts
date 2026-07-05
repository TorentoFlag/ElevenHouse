import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import { getAstrologerProfileResponseSchema } from "@elevenhouse/contracts";
import type {
  AstrologerProfile,
  AstrologerProfileStore,
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../identity/auth/identity-auth.tokens";
import { IdentityModule } from "../identity/identity.module";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "../identity/passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "../identity/passwordless/identity-passwordless.tokens";
import { ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK } from "../identity/registration/identity-registration.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerProfileModule } from "./astrologer-profile.module";
import { ASTROLOGER_PROFILE_STORE } from "./astrologer-profile.tokens";

const now = new Date("2026-07-03T00:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("astrologer profile HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let profileStore: AstrologerProfileStore;

  beforeEach(async () => {
    profileStore = createProfileStore();
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise("Unexpected passwordless auth unit of work call")
    };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise("Unexpected auth session revocation unit of work call")
    };
    const astrologerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise("Unexpected astrologer registration unit of work call")
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, AstrologerProfileModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: defaultPasswordlessRateLimits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(createAuthStore())
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(authSessionRevocation)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(astrologerRegistration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(defaultPasswordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({
        eval: vi.fn(async () => 0),
        quit: vi.fn(async () => undefined)
      })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({
        generateCode: vi.fn(() => "123456")
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => now)
      })
      .overrideProvider(ASTROLOGER_PROFILE_STORE)
      .useValue(profileStore)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("registers current profile reads behind astrologer authentication", async () => {
    const unauthenticatedResponse = await fetch(`${baseUrl}/astrologer-profile/me`);
    const authenticatedResponse = await getJson("/astrologer-profile/me");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(authenticatedResponse.status).toBe(200);
    getAstrologerProfileResponseSchema.parse(authenticatedResponse.body);
    expect(authenticatedResponse.body).toEqual({
      profile: {
        ...profile,
        avatarMedia: null,
        coverMedia: null
      }
    });
    expect(profileStore.findByOwnerUserId).toHaveBeenCalledWith({ ownerUserId });
  });

  async function getJson(path: string): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
    });

    return readJsonResponse(response);
  }
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, unknown>;
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);

  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) => {
      if (candidateTokenHash !== tokenHash) {
        return null;
      }

      return {
        session: {
          id: "8624104d-6f9b-4983-958e-9dbec6f0473c",
          userId: ownerUserId,
          tokenHash,
          status: "active" as const,
          createdAt: "2026-07-03T00:00:00.000Z",
          expiresAt: "2026-07-09T00:00:00.000Z"
        },
        user: {
          id: ownerUserId,
          status: "active" as const,
          createdAt: "2026-07-03T00:00:00.000Z",
          updatedAt: "2026-07-03T00:00:00.000Z"
        },
        roleAssignments: [
          {
            id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
            userId: ownerUserId,
            role: "astrologer" as const,
            assignedAt: "2026-07-03T00:00:00.000Z"
          }
        ]
      };
    })
  };
}

function createProfileStore(): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => profile),
    upsert: vi.fn(async () => raise("Unexpected profile upsert call")),
    update: vi.fn(async () => raise("Unexpected profile update call"))
  };
}

const profile: AstrologerProfile = {
  ownerUserId,
  publicHandle: "astro-anna",
  publicName: "Анна Вега",
  headline: "Натальная астрология",
  bio: "Описание практики",
  timezone: "Europe/Moscow",
  locale: "ru",
  avatarMediaId: null,
  coverMediaId: null,
  consultationLanguages: ["Русский", "English"],
  visibilityStatus: "published",
  professionalExperienceYears: 9,
  professionalSchool: "Психологическая астрология",
  specializations: ["Натальная карта"],
  methods: ["Натальная астрология"],
  socialLinks: {
    telegram: "alisa_astro",
    instagram: null,
    whatsapp: null,
    website: "alisavega.ru"
  },
  ownBirthData: {
    date: "1990-07-14",
    time: "08:30",
    place: "Санкт-Петербург",
    showOnPublicPage: true
  },
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z"
};

function raise(message: string): never {
  throw new Error(message);
}
