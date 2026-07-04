import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AstrologerProfileResponse } from "@elevenhouse/contracts";
import { SettingsPage } from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  useI18n: vi.fn(),
  useDocumentTitle: vi.fn(),
  useCurrentAstrologerProfileQuery: vi.fn(),
  useUpsertAstrologerProfileMutation: vi.fn(),
  settingsPageView: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery", () => ({
  useCurrentAstrologerProfileQuery: mocks.useCurrentAstrologerProfileQuery
}));

vi.mock("../../features/astrologer-profile/model/useUpsertAstrologerProfileMutation", () => ({
  useUpsertAstrologerProfileMutation: mocks.useUpsertAstrologerProfileMutation
}));

vi.mock("./SettingsPageView", () => ({
  SettingsPageView: mocks.settingsPageView
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settingsPageView.mockImplementation(() => null);
    mocks.useI18n.mockReturnValue({
      dictionary: {
        settings: {
          documentTitle: "ElevenHouse | Настройки",
          title: "Настройки"
        }
      },
      locale: "ru"
    });
    mocks.useCurrentAstrologerProfileQuery.mockReturnValue({
      data: { profile },
      isLoading: false,
      isError: false
    });
    mocks.useUpsertAstrologerProfileMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false
    });
  });

  it("loads profile data and passes page state to the settings view", () => {
    renderElement(<SettingsPage />);

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("ElevenHouse | Настройки");
    expect(getLatestMockProps(mocks.settingsPageView)).toEqual(
      expect.objectContaining({
        locale: "ru",
        profile,
        isLoading: false,
        isError: false,
        isSavingProfile: false
      })
    );
  });

  it("passes a saved status after the profile mutation succeeds", () => {
    mocks.useUpsertAstrologerProfileMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: true
    });

    renderElement(<SettingsPage />);

    expect(getLatestMockProps(mocks.settingsPageView)).toEqual(
      expect.objectContaining({
        saveStatus: "saved"
      })
    );
  });
});

function renderElement(element: unknown): void {
  if (Array.isArray(element)) {
    element.forEach(renderElement);
    return;
  }

  if (!isValidElement(element)) {
    return;
  }

  const typedElement = element as ReactElement<Record<string, unknown>>;

  if (typeof typedElement.type === "function") {
    const Component = typedElement.type as (props: Record<string, unknown>) => unknown;
    renderElement(Component(typedElement.props));
    return;
  }

  Children.forEach(typedElement.props.children, renderElement);
}

function getLatestMockProps(mock: { mock: { calls: unknown[][] } }): unknown {
  const lastCall = mock.mock.calls.at(-1);

  if (!lastCall?.[0]) {
    throw new Error("Expected mock to be called with props");
  }

  return lastCall[0];
}

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
