import type {
  AstrologerProfileResponse,
  GetAstrologerProfileResponse,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { getCurrentAstrologerProfile } from "./getCurrentAstrologerProfile";
import { upsertCurrentAstrologerProfile } from "./upsertCurrentAstrologerProfile";

const profile = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
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
} satisfies AstrologerProfileResponse;

describe("astrologer profile API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the current profile through the shared response contract", async () => {
    const response = { profile } satisfies GetAstrologerProfileResponse;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(getCurrentAstrologerProfile()).resolves.toEqual(response);

    expect(get).toHaveBeenCalledWith("/astrologer-profile/me");
  });

  it("upserts profile through a CSRF-protected contract-backed request", async () => {
    const body = {
      publicHandle: " Astro-Anna ",
      publicName: " Анна Вега ",
      headline: "",
      bio: " Описание практики ",
      timezone: " Europe/Moscow ",
      locale: " RU ",
      avatarMediaId: null,
      coverMediaId: "",
      consultationLanguages: [" Русский ", "English"],
      visibilityStatus: "published",
      professionalExperienceYears: 9,
      professionalSchool: " Психологическая астрология ",
      specializations: [" Натальная карта "],
      methods: [" Натальная астрология "],
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
    } satisfies UpsertAstrologerProfileRequest;
    const put = vi.spyOn(application.http, "put").mockResolvedValue(profile);

    await expect(upsertCurrentAstrologerProfile(body)).resolves.toEqual(profile);

    expect(put).toHaveBeenCalledWith(
      "/astrologer-profile/me",
      {
        publicHandle: "astro-anna",
        publicName: "Анна Вега",
        headline: null,
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
        }
      },
      { csrf: true }
    );
  });
});
