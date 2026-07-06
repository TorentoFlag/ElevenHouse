import { describe, expect, it } from "vitest";
import {
  astrologerProfileResponseSchema,
  getAstrologerProfileResponseSchema,
  upsertAstrologerProfileRequestSchema
} from "./astrologer-profile";

const validProfile = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  publicHandle: "astro-anna",
  publicName: "Анна Вега",
  headline: "Натальная астрология и прогнозы",
  bio: "Помогаю читать карту без мистификации.",
  timezone: "Europe/Moscow",
  locale: "ru",
  avatarMediaId: "33333333-3333-4333-8333-333333333333",
  avatarMedia: {
    id: "33333333-3333-4333-8333-333333333333",
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    purpose: "profile_avatar",
    status: "ready",
    visibility: "public",
    originalFileName: "avatar.png",
    mimeType: "image/png",
    sizeBytes: 128000,
    width: 640,
    height: 640,
    altText: null,
    url: "https://cdn.example/profile/avatar.png",
    variants: [],
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z"
  },
  coverMediaId: "44444444-4444-4444-8444-444444444444",
  coverMedia: {
    id: "44444444-4444-4444-8444-444444444444",
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    purpose: "profile_cover",
    status: "ready",
    visibility: "public",
    originalFileName: "cover.png",
    mimeType: "image/png",
    sizeBytes: 512000,
    width: 1600,
    height: 600,
    altText: null,
    url: "https://cdn.example/profile/cover.png",
    variants: [],
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z"
  },
  consultationLanguages: ["Русский", "English"],
  visibilityStatus: "paused",
  professionalExperienceYears: 9,
  professionalSchool: "Психологическая астрология",
  specializations: ["Натальная карта", "Синастрия"],
  methods: ["Натальная астрология"],
  socialLinks: {
    telegram: "alisa_astro",
    instagram: "alisa.vega.astro",
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
} as const;

const validUpsertRequest = {
  publicHandle: validProfile.publicHandle,
  publicName: validProfile.publicName,
  headline: validProfile.headline,
  bio: validProfile.bio,
  timezone: validProfile.timezone,
  locale: validProfile.locale,
  avatarMediaId: validProfile.avatarMediaId,
  coverMediaId: validProfile.coverMediaId,
  consultationLanguages: validProfile.consultationLanguages,
  visibilityStatus: validProfile.visibilityStatus,
  professionalExperienceYears: validProfile.professionalExperienceYears,
  professionalSchool: validProfile.professionalSchool,
  specializations: validProfile.specializations,
  methods: validProfile.methods,
  socialLinks: validProfile.socialLinks,
  ownBirthData: validProfile.ownBirthData
} as const;

describe("astrologer profile contracts", () => {
  it("parses a persisted profile response", () => {
    expect(astrologerProfileResponseSchema.parse(validProfile)).toEqual(validProfile);
  });

  it("allows an absent current profile response", () => {
    expect(getAstrologerProfileResponseSchema.parse({ profile: null, integrityIssues: [] })).toEqual({
      profile: null,
      integrityIssues: []
    });
  });

  it("parses explicit profile media integrity issues on read responses", () => {
    const parsed = getAstrologerProfileResponseSchema.parse({
      profile: {
        ...validProfile,
        avatarMedia: null
      },
      integrityIssues: [
        {
          code: "avatar_media_unavailable",
          severity: "warning",
          field: "avatarMediaId",
          mediaId: validProfile.avatarMediaId,
          message: "Profile avatar media is missing, has wrong purpose or is not ready"
        }
      ]
    });

    expect(parsed.integrityIssues).toEqual([
      expect.objectContaining({
        code: "avatar_media_unavailable",
        field: "avatarMediaId",
        mediaId: validProfile.avatarMediaId
      })
    ]);
  });

  it("normalizes handles, optional strings and consultation languages on upsert", () => {
    expect(
      upsertAstrologerProfileRequestSchema.parse({
        publicHandle: "  Astro-Anna  ",
        publicName: "  Анна Вега  ",
        headline: "",
        bio: "  Работаю с натальными картами  ",
        timezone: "  Europe/Moscow  ",
        locale: " ru ",
        avatarMediaId: "",
        coverMediaId: " 44444444-4444-4444-8444-444444444444 ",
        consultationLanguages: [" Русский ", "English"],
        visibilityStatus: "published",
        professionalExperienceYears: 9,
        professionalSchool: "  Психологическая астрология  ",
        specializations: [" Натальная карта "],
        methods: [" Синастрия "],
        socialLinks: {
          telegram: " alisa_astro ",
          instagram: "",
          whatsapp: null,
          website: " alisavega.ru "
        },
        ownBirthData: {
          date: "1990-07-14",
          time: "08:30",
          place: " Санкт-Петербург ",
          showOnPublicPage: true
        }
      })
    ).toEqual({
      publicHandle: "astro-anna",
      publicName: "Анна Вега",
      headline: null,
      bio: "Работаю с натальными картами",
      timezone: "Europe/Moscow",
      locale: "ru",
      avatarMediaId: null,
      coverMediaId: "44444444-4444-4444-8444-444444444444",
      consultationLanguages: ["Русский", "English"],
      visibilityStatus: "published",
      professionalExperienceYears: 9,
      professionalSchool: "Психологическая астрология",
      specializations: ["Натальная карта"],
      methods: ["Синастрия"],
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
      }
    });
  });

  it("rejects caller-controlled owner and protected workflow fields", () => {
    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        ownerUserId: "11111111-1111-4111-8111-111111111111"
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        verificationStatus: "approved"
      })
    ).toThrow();
  });

  it("rejects malformed handles and duplicate consultation languages", () => {
    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        publicHandle: "-bad-handle"
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        consultationLanguages: ["Русский", "русский"]
      })
    ).toThrow();
  });

  it("rejects profile fields that would violate persisted profile constraints", () => {
    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        publicName: "A"
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        headline: "x".repeat(241)
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        bio: "x".repeat(4001)
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        professionalSchool: "x".repeat(501)
      })
    ).toThrow();
  });

  it("rejects non-uuid profile media identifiers before they reach the profile API", () => {
    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        avatarMediaId: "avatar-1"
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validUpsertRequest,
        coverMediaId: "cover-1"
      })
    ).toThrow();
  });
});
