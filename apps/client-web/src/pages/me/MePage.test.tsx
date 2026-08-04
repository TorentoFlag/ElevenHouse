// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ClientBirthDataResponse,
  ClientCabinetOverviewResponse,
  ClientDataConsentListResponse,
  ClientDataConsentLocale
} from "@elevenhouse/contracts";
import {
  canonicalChartAiConsentNotices,
  chartAiConsentNoticeSha256ByLocale,
  clientDataConsentListResponseSchema
} from "@elevenhouse/contracts";
import { I18nProvider, useI18n } from "@elevenhouse/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
import { MePage } from "./MePage";

const api = vi.hoisted(() => ({
  createClientBirthProfile: vi.fn(),
  getClientDataConsents: vi.fn<
    (locale: ClientDataConsentLocale) => Promise<ClientDataConsentListResponse>
  >(() => new Promise<ClientDataConsentListResponse>(() => undefined)),
  getClientCabinetOverview: vi.fn(),
  grantClientChartAiConsent: vi.fn(),
  revokeClientDataConsent: vi.fn(),
  searchClientBirthPlaces: vi.fn(),
  updateClientBirthProfile: vi.fn()
}));

vi.mock("../../features/client-profile/api/clientProfileApi", () => api);

vi.mock("../../features/client-profile/api/clientDataConsentApi", () => api);

describe("MePage birth profile submission", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("rejects edited free text before any profile mutation", async () => {
    api.getClientCabinetOverview.mockResolvedValue(overview());
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Мои данные" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Место рождения" }), {
      target: { value: "Москва вручную" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить основной профиль" }));

    expect(await screen.findByText("Выберите место рождения из найденных вариантов.")).toBeTruthy();
    expect(api.updateClientBirthProfile).not.toHaveBeenCalled();
    expect(api.createClientBirthProfile).not.toHaveBeenCalled();
  });

  it("preserves authoritative calculation fields when an unrelated label changes", async () => {
    const savedProfile = profile({ label: "Натальная карта" });
    api.getClientCabinetOverview.mockResolvedValue(overview());
    api.updateClientBirthProfile.mockResolvedValue(savedProfile);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Мои данные" }));
    fireEvent.change(screen.getByLabelText("Название"), {
      target: { value: "Натальная карта" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить основной профиль" }));

    await waitFor(() => expect(api.updateClientBirthProfile).toHaveBeenCalledTimes(1));
    expect(api.updateClientBirthProfile).toHaveBeenCalledWith("profile-1", {
      birthCity: "Москва",
      birthCountryCode: "RU",
      birthDate: "1990-03-14",
      birthLatitude: 55.7558,
      birthLongitude: 37.6173,
      birthPlaceText: "Москва, Россия",
      birthRegion: "Москва",
      birthTime: "08:25",
      birthTimeDstOccurrence: "first",
      birthTimePrecision: "approximate",
      birthTimezone: "Europe/Moscow",
      isPrimary: true,
      label: "Натальная карта"
    });
    expect(await screen.findByText("Сохранено")).toBeTruthy();
  });

  it("reloads the current locale after a consent mutation that overlaps a locale change", async () => {
    const astrologerUserId = "22222222-2222-4222-8222-222222222222";
    const grant = deferred<void>();
    let englishLoads = 0;
    api.getClientCabinetOverview.mockResolvedValue(
      overview({
        astrologers: [
          {
            astrologerUserId,
            publicHandle: "alice-vega",
            publicName: "Alice Vega",
            relationshipStatus: "active",
            firstLinkedAt: "2026-08-03T10:00:00.000Z",
            lastLinkedAt: "2026-08-03T10:00:00.000Z"
          }
        ]
      })
    );
    api.getClientDataConsents.mockImplementation(async (locale: "ru" | "en") => {
      if (locale === "ru") return consentResponse("ru", "missing");
      englishLoads += 1;
      return consentResponse("en", englishLoads === 1 ? "missing" : "granted");
    });
    api.grantClientChartAiConsent.mockReturnValue(grant.promise);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Мои данные" }));
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Разрешить AI-черновики" }));
    fireEvent.click(screen.getByRole("button", { name: "switch-en" }));
    await waitFor(() => expect(api.getClientDataConsents).toHaveBeenCalledWith("en"));

    grant.resolve();

    expect(
      await screen.findByText(clientCopyByLocale.en.chartAiConsent.states.granted)
    ).toBeTruthy();
    expect(api.getClientDataConsents).toHaveBeenLastCalledWith("en");
    expect(englishLoads).toBe(2);
  });
});

function renderPage() {
  return render(
    <I18nProvider
      browserLanguages={["ru"]}
      dictionaries={clientCopyByLocale}
      documentElement={null}
      initialLocale="ru"
      storage={null}
    >
      <LocaleControl />
      <MePage />
    </I18nProvider>
  );
}

function LocaleControl() {
  const { setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale("en")}>
      switch-en
    </button>
  );
}

function overview(
  overrides: Partial<ClientCabinetOverviewResponse> = {}
): ClientCabinetOverviewResponse {
  return {
    astrologers: [],
    birthProfiles: [profile()],
    summary: {
      activeSubscriptionCount: 0,
      availableMaterialCount: 0,
      directLinkOnly: true,
      unreadNotificationCount: 0,
      upcomingBookingCount: 0
    },
    ...overrides
  };
}

function consentResponse(
  locale: "ru" | "en",
  state: "missing" | "granted"
): ClientDataConsentListResponse {
  const hasConsent = state === "granted";
  return clientDataConsentListResponseSchema.parse({
    policy: {
      purpose: "external_chart_ai_interpretation",
      policyVersion: "chart-ai-external-processing.v1",
      processorCode: "openai"
    },
    notice: canonicalChartAiConsentNotices[locale],
    noticeSha256: chartAiConsentNoticeSha256ByLocale[locale],
    consents: [
      {
        astrologerUserId: "22222222-2222-4222-8222-222222222222",
        publicHandle: "alice-vega",
        publicName: "Alice Vega",
        relationshipStatus: "active",
        state,
        consentId: hasConsent ? "44444444-4444-4444-8444-444444444444" : null,
        noticeLocale: hasConsent ? locale : null,
        grantedAt: hasConsent ? "2026-08-03T12:00:00.000Z" : null,
        revokedAt: null
      }
    ]
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function profile(overrides: Partial<ClientBirthDataResponse> = {}): ClientBirthDataResponse {
  return {
    id: "profile-1",
    clientUserId: "11111111-1111-4111-8111-111111111111",
    label: "Я",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "approximate",
    birthPlaceText: "Москва, Россия",
    birthCountryCode: "RU",
    birthCity: "Москва",
    birthRegion: "Москва",
    birthTimezone: "Europe/Moscow",
    birthTimeDstOccurrence: "first",
    birthLatitude: 55.7558,
    birthLongitude: 37.6173,
    source: "client_profile",
    isPrimary: true,
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
    ...overrides
  };
}
