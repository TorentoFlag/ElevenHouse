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
  getClientCabinetOverview: vi.fn(),
  searchClientBirthPlaces: vi.fn(),
  upsertClientBirthData: vi.fn()
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
    fireEvent.click(screen.getByRole("button", { name: "Сохранить данные" }));

    expect(await screen.findByText("Выберите место рождения из найденных вариантов.")).toBeTruthy();
    expect(api.upsertClientBirthData).not.toHaveBeenCalled();
  });

  it("preserves authoritative calculation fields when an unrelated label changes", async () => {
    const savedProfile = profile({ label: "Натальная карта" });
    api.getClientCabinetOverview.mockResolvedValue(overview());
    api.upsertClientBirthData.mockResolvedValue(savedProfile);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Мои данные" }));
    fireEvent.change(screen.getByLabelText("Название"), {
      target: { value: "Натальная карта" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить данные" }));

    await waitFor(() => expect(api.upsertClientBirthData).toHaveBeenCalledTimes(1));
    expect(api.upsertClientBirthData).toHaveBeenCalledWith({
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
      expectedRevision: 4,
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
    birthData: profile(),
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
    revision: 4,
    lastEditedByUserId: "11111111-1111-4111-8111-111111111111",
    lastEditedByRole: "client",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
    ...overrides
  };
}
