import type { AstrologerProfileResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { toAstrologerHeaderProfileModel } from "./astrologerHeaderProfileModel";

const now = new Date("2026-01-15T12:00:00.000Z");

describe("toAstrologerHeaderProfileModel", () => {
  it("builds header display data from the current astrologer profile and verification state", () => {
    expect(
      toAstrologerHeaderProfileModel({
        copy: astrologerCopyByLocale.ru.appShell.header,
        locale: "ru-RU",
        now,
        profile,
        profileStatus: "success",
        verificationStatus: "approved"
      })
    ).toEqual({
      avatarInitials: "АВ",
      avatarUrl: "https://cdn.example/profile/avatar.png",
      displayName: "Анна Вега",
      isLoading: false,
      isVerified: true,
      timezoneLabel: "GMT+3 · Europe/Moscow"
    });
  });

  it("uses explicit non-person fallback copy while the profile request is pending", () => {
    expect(
      toAstrologerHeaderProfileModel({
        copy: astrologerCopyByLocale.ru.appShell.header,
        locale: "ru-RU",
        now,
        profile: null,
        profileStatus: "pending",
        verificationStatus: "none"
      })
    ).toMatchObject({
      avatarInitials: "EH",
      displayName: "Загрузка профиля",
      isLoading: true,
      isVerified: false,
      timezoneLabel: "Данные профиля загружаются"
    });
  });

  it("does not show a fake verified badge when verification is still pending", () => {
    expect(
      toAstrologerHeaderProfileModel({
        copy: astrologerCopyByLocale.ru.appShell.header,
        locale: "ru-RU",
        now,
        profile,
        profileStatus: "success",
        verificationStatus: "pending"
      }).isVerified
    ).toBe(false);
  });
});

const profile = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  publicHandle: "astro-anna",
  publicName: "Анна Вега",
  headline: "Натальная астрология",
  bio: "Описание практики",
  timezone: "Europe/Moscow",
  locale: "ru",
  avatarMediaId: "22222222-2222-4222-8222-222222222222",
  avatarMedia: {
    id: "22222222-2222-4222-8222-222222222222",
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    purpose: "profile_avatar",
    status: "ready",
    visibility: "public",
    url: "https://cdn.example/profile/avatar.png",
    originalFileName: "avatar.png",
    mimeType: "image/png",
    sizeBytes: 1200,
    width: 160,
    height: 160,
    altText: null,
    variants: [],
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T10:00:00.000Z"
  },
  coverMediaId: null,
  coverMedia: null,
  consultationLanguages: ["Русский"],
  visibilityStatus: "published",
  professionalExperienceYears: 9,
  professionalSchool: "Психологическая астрология",
  specializations: ["Натальная карта"],
  methods: ["Натальная астрология"],
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
  },
  createdAt: "2026-01-15T10:00:00.000Z",
  updatedAt: "2026-01-15T10:00:00.000Z"
} satisfies AstrologerProfileResponse;
