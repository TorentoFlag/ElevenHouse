// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { I18nProvider } from "@elevenhouse/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstrologerNavigationDrawer } from "./AstrologerNavigationDrawer";

const http = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock("../../Application", () => ({ application: { http } }));

afterEach(cleanup);

describe("AstrologerNavigationDrawer", () => {
  beforeEach(() => {
    http.get.mockReset();
    http.get.mockImplementation(async (path: string) => {
      if (path === "/astrologer-profile/me") {
        return { profile: publishedProfile, integrityIssues: [] };
      }
      if (path === "/tariffs/entitlements") {
        return {
          products: { read: "allow", mutation: "allow" },
          funnels: { read: "allow", mutation: "allow" }
        };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
  });

  it("builds the personal-page link from the current published profile handle", async () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={createQueryClient()}>
          <I18nProvider
            dictionaries={astrologerCopyByLocale}
            initialLocale="en"
            storage={null}
            documentElement={null}
          >
            <AstrologerNavigationDrawer />
          </I18nProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const link = await screen.findByRole("link", { name: "Open astrologer personal page" });
    expect(link).toHaveAttribute("href", "https://client.elevenhouse.ai/a/test-78005553535");
    expect(screen.getByText("client.elevenhouse.ai/a/test-78005553535")).toBeVisible();
    expect(document.body).not.toHaveTextContent("alisa-vega");
    expect(document.body).not.toHaveTextContent("elevenhouse.app");
  });
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
}

const publishedProfile = {
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  publicHandle: "test-78005553535",
  publicName: "Ksenia",
  headline: null,
  bio: null,
  timezone: "Europe/Moscow",
  locale: "ru",
  avatarMediaId: null,
  avatarMedia: null,
  coverMediaId: null,
  coverMedia: null,
  consultationLanguages: ["ru"],
  visibilityStatus: "published",
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
  },
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z"
} as const;
