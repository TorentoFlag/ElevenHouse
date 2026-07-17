import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  AstrologerProfileHandleConflictError,
  type MediaAsset,
  type MediaAssetStore,
  type AstrologerProfile,
  type AstrologerProfileStore
} from "@elevenhouse/domain";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { AstrologerProfileController } from "./astrologer-profile.controller";
import { AstrologerProfileService } from "./astrologer-profile.service";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const avatarMediaId = "33333333-3333-4333-8333-333333333333";
const coverMediaId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-07-03T00:00:00.000Z");

describe("AstrologerProfileService", () => {
  it("returns the current astrologer profile", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(service.getCurrentProfile(createAuthenticatedRequest())).resolves.toEqual({
      profile: {
        ...profile,
        avatarMedia: expect.objectContaining({
          id: avatarMediaId,
          purpose: "profile_avatar",
          url: `https://cdn.example/${ownerUserId}/profile_avatar/${avatarMediaId}/avatar.png`
        }),
        coverMedia: expect.objectContaining({
          id: coverMediaId,
          purpose: "profile_cover",
          url: `https://cdn.example/${ownerUserId}/profile_cover/${coverMediaId}/cover.png`
        })
      },
      integrityIssues: []
    });
    expect(store.findByOwnerUserId).toHaveBeenCalledWith({ ownerUserId });
  });

  it("surfaces profile media integrity issues without hiding the profile", async () => {
    const mediaStore = createMediaStore({
      findByOwnerAndId: vi.fn(async (input) => {
        if (input.mediaId === avatarMediaId) {
          return createMediaAsset("product_cover", avatarMediaId);
        }
        if (input.mediaId === coverMediaId) {
          return createMediaAsset(
            "profile_cover",
            coverMediaId,
            "cover.png",
            1600,
            600,
            "uploading"
          );
        }
        return null;
      })
    });
    const service = createService(createStore(), mediaStore);

    await expect(service.getCurrentProfile(createAuthenticatedRequest())).resolves.toEqual({
      profile: expect.objectContaining({
        publicHandle: "astro-anna",
        avatarMedia: null,
        coverMedia: null
      }),
      integrityIssues: [
        {
          code: "avatar_media_unavailable",
          severity: "warning",
          field: "avatarMediaId",
          mediaId: avatarMediaId,
          message: "Profile avatar media is missing, has wrong purpose or is not ready"
        },
        {
          code: "cover_media_unavailable",
          severity: "warning",
          field: "coverMediaId",
          mediaId: coverMediaId,
          message: "Profile cover media is missing, has wrong purpose or is not ready"
        }
      ]
    });
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
          consultationLanguages: [" Русский "],
          visibilityStatus: "published",
          professionalExperienceYears: 9,
          professionalSchool: "Психологическая астрология",
          specializations: ["Натальная карта"],
          methods: ["Натальная астрология"],
          socialLinks: {
            telegram: "alisa_astro",
            instagram: "",
            whatsapp: null,
            website: "alisavega.ru"
          },
          ownBirthData: {
            date: "1990-07-14",
            time: "08:30",
            place: "Санкт-Петербург",
            showOnPublicPage: true
          }
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

  it("rejects profile media that is not a ready asset for the current owner and purpose", async () => {
    const mediaStore = createMediaStore({
      findByOwnerAndId: vi.fn(async () => createMediaAsset("product_cover", coverMediaId))
    });
    const service = createService(createStore(), mediaStore);

    await expect(
      service.upsertCurrentProfile(
        {
          ...validBody(),
          coverMediaId
        },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(BadRequestException);

    expect(mediaStore.findByOwnerAndId).toHaveBeenCalledWith({
      ownerUserId,
      mediaId: coverMediaId
    });
  });

  it("rejects non-IANA profile timezones before persistence", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(
      service.upsertCurrentProfile(
        {
          ...validBody(),
          timezone: "UTC+3"
        },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(BadRequestException);
    expect(store.upsert).not.toHaveBeenCalled();
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
      Reflect.getMetadata(
        csrfRequiredMetadataKey,
        AstrologerProfileController.prototype.upsertCurrentProfile
      )
    ).toBe(true);
  });
});

function createService(
  store: AstrologerProfileStore,
  mediaStore: MediaAssetStore = createMediaStore()
): AstrologerProfileService {
  return new AstrologerProfileService(store, mediaStore, createPublicUrlResolver(), createClock());
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
    ...overrides
  };
}

function createMediaStore(overrides: Partial<MediaAssetStore> = {}): MediaAssetStore {
  return {
    createUploadingAsset: vi.fn(async () => raise("Unexpected media create call")),
    findByOwnerAndId: vi.fn(async (input) => {
      if (input.mediaId === avatarMediaId) {
        return createMediaAsset("profile_avatar", avatarMediaId, "avatar.png", 640, 640);
      }
      if (input.mediaId === coverMediaId) {
        return createMediaAsset("profile_cover", coverMediaId, "cover.png", 1600, 600);
      }
      return null;
    }),
    markReady: vi.fn(async () => raise("Unexpected media ready call")),
    markFailed: vi.fn(async () => raise("Unexpected media failed call")),
    ...overrides
  };
}

function createMediaAsset(
  purpose: MediaAsset["purpose"],
  id: string,
  fileName = "cover.png",
  width = 1600,
  height = 600,
  status: MediaAsset["status"] = "ready"
): MediaAsset {
  return {
    id,
    ownerUserId,
    purpose,
    status,
    visibility: "public",
    storageBucket: "elevenhouse-local-media",
    storageKey: `${ownerUserId}/${purpose}/${id}/${fileName}`,
    originalFileName: fileName,
    mimeType: "image/png",
    sizeBytes: 128000,
    checksumSha256: null,
    width,
    height,
    altText: null,
    failureReason: null,
    variants: [],
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z"
  };
}

function createPublicUrlResolver() {
  return {
    getPublicUrl: (input: { readonly storageKey: string }) =>
      `https://cdn.example/${input.storageKey}`
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
  avatarMediaId,
  coverMediaId,
  consultationLanguages: ["Русский"],
  visibilityStatus: "draft",
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
    consultationLanguages: ["Русский"],
    visibilityStatus: "draft",
    professionalExperienceYears: null,
    professionalSchool: null,
    specializations: [],
    methods: [],
    socialLinks: {
      telegram: null,
      instagram: null,
      whatsapp: null,
      website: null
    },
    ownBirthData: {
      date: null,
      time: null,
      place: null,
      showOnPublicPage: false
    }
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

function raise(message: string): never {
  throw new Error(message);
}
