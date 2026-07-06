import { renderToStaticMarkup } from "react-dom/server";
import type { AstrologerProfileResponse } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

describe("ProfileSettingsForm", () => {
  it("exposes page visibility as one radio group", () => {
    const markup = renderToStaticMarkup(
      <ProfileSettingsForm locale="ru" profile={profile} isSaving={false} onSave={vi.fn()} />
    );

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="Видимость страницы"');
    expect(markup).toContain('role="radio"');
    expect(markup).toContain('aria-checked="true"');
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
  avatarMedia: null,
  coverMediaId: null,
  coverMedia: null,
  consultationLanguages: ["Русский"],
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
