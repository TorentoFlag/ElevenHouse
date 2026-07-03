import {
  BadRequestException,
  ConflictException,
  UnauthorizedException
} from "@nestjs/common";
import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  AstrologerProfileHandleConflictError,
  type AstrologerProfile,
  type AstrologerProfileStore
} from "@elevenhouse/domain";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { AstrologerProfileController } from "./astrologer-profile.controller";
import { AstrologerProfileService } from "./astrologer-profile.service";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const now = new Date("2026-07-03T00:00:00.000Z");

describe("AstrologerProfileService", () => {
  it("returns the current astrologer profile", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(service.getCurrentProfile(createAuthenticatedRequest())).resolves.toEqual({
      profile
    });
    expect(store.findByOwnerUserId).toHaveBeenCalledWith({ ownerUserId });
  });

  it("upserts profile data for the authenticated astrologer", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(
      service.upsertCurrentProfile(
        {
          publicHandle: " Astro-Anna ",
          publicName: " Анна Вега ",
          headline: "",
          bio: "  Описание  ",
          timezone: " Europe/Moscow ",
          locale: " RU ",
          avatarMediaId: null,
          coverMediaId: "",
          consultationLanguages: [" RU "],
          isPublicPageEnabled: true
        },
        createAuthenticatedRequest()
      )
    ).resolves.toMatchObject({
      publicHandle: "astro-anna",
      publicName: "Анна Вега"
    });

    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        publicHandle: "astro-anna",
        now: "2026-07-03T00:00:00.000Z"
      })
    );
  });

  it("maps invalid bodies, unauthenticated requests and handle conflicts", async () => {
    const service = createService(
      createStore({
        upsert: vi.fn(async () => {
          throw new AstrologerProfileHandleConflictError("astro-anna");
        })
      })
    );

    await expect(
      service.upsertCurrentProfile({ publicName: "" }, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
    await expect(service.getCurrentProfile({ headers: {} })).rejects.toThrow(UnauthorizedException);
    await expect(
      service.upsertCurrentProfile(validBody(), createAuthenticatedRequest())
    ).rejects.toThrow(ConflictException);
  });
});

describe("AstrologerProfileController", () => {
  it("marks profile mutation as CSRF-protected", () => {
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, AstrologerProfileController.prototype.upsertCurrentProfile)
    ).toBe(true);
  });
});

function createService(store: AstrologerProfileStore): AstrologerProfileService {
  return new AstrologerProfileService(store, createClock());
}

function createClock(): SystemClock {
  return {
    now: () => now
  };
}

function createStore(overrides: Partial<AstrologerProfileStore> = {}): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => profile),
    upsert: vi.fn(async (input) => {
      const { now: timestamp, ...profileInput } = input;
      return {
        ...profile,
        ...profileInput,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }),
    update: vi.fn(async (input) => ({
      ...profile,
      ...input.patch,
      ownerUserId: input.ownerUserId,
      updatedAt: input.now
    })),
    ...overrides
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
  consultationLanguages: ["ru"],
  isPublicPageEnabled: false,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z"
};

function validBody(): Record<string, unknown> {
  return {
    publicHandle: "astro-anna",
    publicName: "Анна Вега",
    headline: null,
    bio: null,
    timezone: "Europe/Moscow",
    locale: "ru",
    avatarMediaId: null,
    coverMediaId: null,
    consultationLanguages: ["ru"],
    isPublicPageEnabled: false
  };
}

function createAuthenticatedRequest(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}
