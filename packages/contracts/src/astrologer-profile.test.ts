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
  avatarMediaId: "avatar-1",
  coverMediaId: "cover-1",
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
        coverMediaId: " cover-1 ",
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
      coverMediaId: "cover-1",
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
});
