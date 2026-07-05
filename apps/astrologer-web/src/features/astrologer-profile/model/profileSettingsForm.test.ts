import type { AstrologerProfileResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  createProfileSettingsDraft,
  createUpsertAstrologerProfileRequest,
  getProfileSettingsDraftValidationMessage,
  isProfileSettingsDraftDirty
} from "./profileSettingsForm";

describe("profileSettingsForm", () => {
  it("creates an edit draft from the backend-supported profile screen fields", () => {
    const draft = createProfileSettingsDraft(profile, "ru");

    expect(draft).toEqual({
      publicHandle: "astro-anna",
      publicName: "Анна Вега",
      headline: "Натальная астрология",
      bio: "Описание практики",
      timezone: "Europe/Moscow",
      locale: "ru",
      avatarMediaId: "",
      coverMediaId: "44444444-4444-4444-8444-444444444444",
      consultationLanguages: ["Русский", "English"],
      visibilityStatus: "published",
      professionalExperienceYears: 9,
      professionalSchool: "Психологическая астрология",
      specializations: ["Натальная карта"],
      methods: ["Натальная астрология"],
      socialLinks: {
        telegram: "alisa_astro",
        instagram: "",
        whatsapp: "",
        website: "alisavega.ru"
      },
      ownBirthData: {
        date: "1990-07-14",
        time: "08:30",
        place: "Санкт-Петербург",
        showOnPublicPage: true
      }
    });
    expect(draft).not.toHaveProperty("billing");
    expect(draft).not.toHaveProperty("verification");
    expect(draft).not.toHaveProperty("loyalty");
  });

  it("creates an empty create draft without mock profile identity", () => {
    expect(createProfileSettingsDraft(null, "en")).toEqual({
      publicHandle: "",
      publicName: "",
      headline: "",
      bio: "",
      timezone: "UTC",
      locale: "en",
      avatarMediaId: "",
      coverMediaId: "",
      consultationLanguages: ["English"],
      visibilityStatus: "draft",
      professionalExperienceYears: null,
      professionalSchool: "",
      specializations: [],
      methods: [],
      socialLinks: {
        telegram: "",
        instagram: "",
        whatsapp: "",
        website: ""
      },
      ownBirthData: {
        date: "",
        time: "",
        place: "",
        showOnPublicPage: false
      }
    });
  });

  it("normalizes the edit draft into the backend upsert contract", () => {
    expect(
      createUpsertAstrologerProfileRequest({
        publicHandle: " Astro-Anna ",
        publicName: " Анна Вега ",
        headline: "",
        bio: " Описание практики ",
        timezone: " Europe/Moscow ",
        locale: " RU ",
        avatarMediaId: "",
        coverMediaId: " 44444444-4444-4444-8444-444444444444 ",
        consultationLanguages: [" Русский ", "English"],
        visibilityStatus: "published",
        professionalExperienceYears: 9,
        professionalSchool: " Психологическая астрология ",
        specializations: [" Натальная карта "],
        methods: [" Натальная астрология "],
        socialLinks: {
          telegram: " alisa_astro ",
          instagram: "",
          whatsapp: "",
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
      bio: "Описание практики",
      timezone: "Europe/Moscow",
      locale: "ru",
      avatarMediaId: null,
      coverMediaId: "44444444-4444-4444-8444-444444444444",
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
      }
    });
  });

  it("reports form readiness before submitting to the backend contract", () => {
    const draft = createProfileSettingsDraft(profile, "ru");

    expect(getProfileSettingsDraftValidationMessage(draft)).toBeNull();
    expect(
      getProfileSettingsDraftValidationMessage({
        ...draft,
        publicHandle: "-bad"
      })
    ).toBe("Укажите корректную короткую ссылку");
    expect(
      getProfileSettingsDraftValidationMessage({
        ...draft,
        consultationLanguages: []
      })
    ).toBe("Выберите хотя бы один язык консультаций");
  });

  it("tracks whether the editable profile changed from the last loaded backend state", () => {
    const draft = createProfileSettingsDraft(profile, "ru");

    expect(isProfileSettingsDraftDirty(draft, draft)).toBe(false);
    expect(isProfileSettingsDraftDirty(draft, { ...draft, publicName: "Анна Стар" })).toBe(true);
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
  avatarMediaId: null,
  coverMediaId: "44444444-4444-4444-8444-444444444444",
  avatarMedia: null,
  coverMedia: null,
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
} satisfies AstrologerProfileResponse;
