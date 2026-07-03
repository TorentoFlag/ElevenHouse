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
  consultationLanguages: ["ru", "en"],
  isPublicPageEnabled: false,
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
        consultationLanguages: [" RU ", "en"],
        isPublicPageEnabled: true
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
      consultationLanguages: ["ru", "en"],
      isPublicPageEnabled: true
    });
  });

  it("accepts partial update requests and nullable clearing", () => {
    expect(
      updateAstrologerProfileRequestSchema.parse({
        headline: null,
        bio: "",
        consultationLanguages: ["en"]
      })
    ).toEqual({
      headline: null,
      bio: null,
      consultationLanguages: ["en"]
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
        consultationLanguages: ["ru", "RU"]
      })
    ).toThrow();
  });
});
