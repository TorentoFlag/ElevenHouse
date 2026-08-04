// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ClientBirthDataResponse,
  ClientCabinetOverviewResponse
} from "@elevenhouse/contracts";
import { I18nProvider, useI18n } from "@elevenhouse/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientCopyByLocale } from "../../common/i18n/clientCopy";
import { MePage } from "./MePage";

const api = vi.hoisted(() => ({
  createClientBirthProfile: vi.fn(),
  getClientCabinetOverview: vi.fn(),
  searchClientBirthPlaces: vi.fn(),
  updateClientBirthProfile: vi.fn()
}));

vi.mock("../../features/client-profile/api/clientProfileApi", () => api);

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
