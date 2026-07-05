import { describe, expect, it } from "vitest";
import {
  astrologerProfileResponseSchema,
  getAstrologerProfileResponseSchema,
  updateAstrologerProfileRequestSchema,
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

describe("astrologer profile contracts", () => {
  it("parses a persisted profile response", () => {
    expect(astrologerProfileResponseSchema.parse(validProfile)).toEqual(validProfile);
  });

  it("allows an absent current profile response", () => {
    expect(getAstrologerProfileResponseSchema.parse({ profile: null })).toEqual({
      profile: null
    });
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

  it("accepts partial update requests and nullable clearing", () => {
    expect(
      updateAstrologerProfileRequestSchema.parse({
        headline: null,
        bio: "",
        consultationLanguages: ["English"],
        visibilityStatus: "paused",
        socialLinks: { telegram: "", instagram: null, whatsapp: null, website: "" }
      })
    ).toEqual({
      headline: null,
      bio: null,
      consultationLanguages: ["English"],
      visibilityStatus: "paused",
      socialLinks: { telegram: null, instagram: null, whatsapp: null, website: null }
    });
  });

  it("rejects caller-controlled owner and protected workflow fields", () => {
    expect(() =>
      updateAstrologerProfileRequestSchema.parse({
        publicName: "Анна",
        ownerUserId: "11111111-1111-4111-8111-111111111111"
      })
    ).toThrow();

    expect(() =>
      updateAstrologerProfileRequestSchema.parse({
        publicName: "Анна",
        verificationStatus: "approved"
      })
    ).toThrow();
  });

  it("rejects malformed handles and duplicate consultation languages", () => {
    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validProfile,
        publicHandle: "-bad-handle"
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validProfile,
        consultationLanguages: ["Русский", "русский"]
      })
    ).toThrow();
  });

  it("rejects non-uuid profile media identifiers before they reach the profile API", () => {
    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validProfile,
        avatarMediaId: "avatar-1"
      })
    ).toThrow();

    expect(() =>
      upsertAstrologerProfileRequestSchema.parse({
        ...validProfile,
        coverMediaId: "cover-1"
      })
    ).toThrow();
  });
});
