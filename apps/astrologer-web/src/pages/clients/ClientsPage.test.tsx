// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type {
  AstrologerClientCrmDetail,
  AstrologerClientCrmListItem,
  ClientCrmActivityItem
} from "@elevenhouse/contracts";
import { I18nProvider } from "@elevenhouse/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { ClientsPage } from "./ClientsPage";

const http = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock("../../Application", () => ({ application: { http } }));

afterEach(cleanup);

describe("ClientsPage", () => {
  beforeEach(() => {
    http.get.mockReset();
  });

  it("renders list loading, empty, error and retry states without local CRM placeholders", async () => {
    const pendingList = deferred<unknown>();
    http.get.mockReturnValueOnce(pendingList.promise);

    renderClientsPage();

    expect(screen.getByRole("status", { name: "Загрузка клиентов" })).toBeVisible();
    pendingList.resolve({ items: [], nextCursor: null });
    expect(await screen.findByText("Клиентов пока нет")).toBeVisible();
    expect(screen.queryByRole("button", { name: /добавить/i })).not.toBeInTheDocument();

    cleanup();
    http.get.mockReset();
    http.get.mockRejectedValueOnce(new Error("network"));
    renderClientsPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить клиентов");
    expect(screen.getByRole("button", { name: "Повторить" })).toBeVisible();
  });

  it("renders list success, query controls, filtered empty and load-more affordance", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path.includes("query=Ada")) return { items: [], nextCursor: null };
      return { items: [adaListItem, graceListItem], nextCursor: "next-cursor" };
    });

    renderClientsPage();

    expect(await screen.findByRole("button", { name: /Ada Lovelace/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("button", { name: /Grace Hopper/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Загрузить еще" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Загрузить еще" }));
    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(expect.stringContaining("cursor=next-cursor"))
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск клиентов" }), {
      target: { value: "Ada" }
    });

    expect(await screen.findByText("По этому фильтру клиентов нет")).toBeVisible();
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("query=Ada"));
    expect(
      http.get.mock.calls.some(
        ([path]) => typeof path === "string" && path.includes("query=Ada") && path.includes("cursor=")
      )
    ).toBe(false);
  });

  it("opens a relationship-scoped detail route with overview, birth data and related profiles", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111") {
        return { client: adaDetail };
      }
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111/activity") {
        return { items: [activityItem], nextCursor: null };
      }
      if (path.startsWith("/clients/crm?")) return { items: [adaListItem], nextCursor: null };
      throw new Error(`Unexpected GET ${path}`);
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Обзор" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Источник")).toBeVisible();
    expect(screen.getAllByText("20 авг. 2026 г.").length).toBeGreaterThan(0);
    expect(screen.getByText("Работа с клиентом")).toBeVisible();
    expect(screen.getByRole("link", { name: /Natal consultation.*21 авг. 2026 г./ })).toHaveAttribute(
      "href",
      "/calendar?bookingId=41111111-1111-4111-8111-111111111111&startAt=2026-08-21T10%3A00%3A00.000Z"
    );
    expect(screen.getByRole("link", { name: /Session review.*19 авг. 2026 г./ })).toHaveAttribute(
      "href",
      "/sessions/51111111-1111-4111-8111-111111111111"
    );

    const overviewTab = screen.getByRole("tab", { name: "Обзор" });
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Данные рождения" })).toHaveFocus();

    fireEvent.click(screen.getByRole("tab", { name: "Данные рождения" }));
    expect(screen.getByText("Время рождения")).toBeVisible();
    expect(screen.getByText("Обновлено")).toBeVisible();
    expect(screen.getByText("12:30 · exact")).toBeVisible();
    expect(screen.getByText("London, UK")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Связанные профили" }));
    expect(screen.getByText("Byron")).toBeVisible();
    expect(screen.getByText("child")).toBeVisible();
  });

  it("renders Activity as a safe timeline and never embeds correspondence UI", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111") {
        return { client: adaDetail };
      }
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111/activity") {
        return { items: [activityItem], nextCursor: null };
      }
      if (path.startsWith("/clients/crm?")) return { items: [adaListItem], nextCursor: null };
      throw new Error(`Unexpected GET ${path}`);
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    fireEvent.click(await screen.findByRole("tab", { name: "Активность" }));

    expect(await screen.findByText("Данные рождения обновлены")).toBeVisible();
    expect(screen.getByText("Revision 2")).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Переписка" })).not.toBeInTheDocument();
    expect(screen.queryByText("Messages")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/написать/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("message body");
    expect(document.querySelector("[data-chat-bubble]")).not.toBeInTheDocument();
  });

  it("renders detail failure and mobile back-to-list behavior", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111") {
        throw new Error("not found");
      }
      if (path.startsWith("/clients/crm?")) return { items: [adaListItem], nextCursor: null };
      throw new Error(`Unexpected GET ${path}`);
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    expect(await screen.findByRole("alert", { name: "Не удалось загрузить карточку" })).toHaveTextContent(
      "Не удалось загрузить карточку"
    );
    expect(screen.getByRole("button", { name: "Назад к списку клиентов" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Назад к списку клиентов" }));

    await waitFor(() =>
      expect(screen.getByTestId("clients-crm-workspace")).toHaveAttribute(
        "data-mobile-detail",
        "false"
      )
    );
  });
});

function renderClientsPage({
  route = "/clients",
  locale = "ru"
}: {
  readonly route?: string;
  readonly locale?: "ru" | "en";
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider
        dictionaries={astrologerCopyByLocale}
        initialLocale={locale}
        storage={null}
        documentElement={null}
      >
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:clientUserId" element={<ClientsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}>;

const clientUserId = "11111111-1111-4111-8111-111111111111";
const relatedProfileId = "33333333-3333-4333-8333-333333333333";

const adaListItem = {
  clientUserId,
  displayName: "Ada Lovelace",
  relationship: {
    id: "21111111-1111-4111-8111-111111111111",
    status: "active",
    source: "booking",
    firstLinkedAt: "2026-08-19T10:00:00.000Z",
    lastLinkedAt: "2026-08-20T10:00:00.000Z"
  },
  lifecycle: {
    status: "active",
    mode: "automatic",
    revision: 2,
    lastActivityAt: "2026-08-20T10:00:00.000Z"
  },
  readiness: { birthData: "ready", relatedProfiles: "ready" }
} as const satisfies AstrologerClientCrmListItem;

const graceListItem = {
  clientUserId: "22222222-2222-4222-8222-222222222222",
  displayName: "Grace Hopper",
  relationship: {
    id: "22222222-2222-4222-8222-222222222223",
    status: "active",
    source: "direct_link",
    firstLinkedAt: "2026-08-18T10:00:00.000Z",
    lastLinkedAt: "2026-08-19T10:00:00.000Z"
  },
  lifecycle: {
    status: "new",
    mode: "automatic",
    revision: 1,
    lastActivityAt: "2026-08-19T10:00:00.000Z"
  },
  readiness: { birthData: "missing", relatedProfiles: "ready" }
} as const satisfies AstrologerClientCrmListItem;

const activityItem = {
  id: "activity-1",
  occurredAt: "2026-08-20T10:30:00.000Z",
  kind: "birth_data_updated",
  metadata: { revision: 2 }
} as const satisfies ClientCrmActivityItem;

const adaDetail = {
  ...adaListItem,
  birthData: {
    id: "31111111-1111-4111-8111-111111111111",
    clientUserId,
    label: "Main profile",
    birthDate: "1815-12-10",
    birthTime: "12:30",
    birthTimePrecision: "exact",
    birthPlaceText: "London, UK",
    birthCountryCode: "GB",
    birthCity: "London",
    birthRegion: null,
    birthTimezone: "Europe/London",
    birthTimeDstOccurrence: null,
    birthLatitude: 51.5072,
    birthLongitude: -0.1276,
    source: "client_profile",
    revision: 2,
    lastEditedByUserId: clientUserId,
    lastEditedByRole: "client",
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-20T10:30:00.000Z"
  },
  relatedBirthProfiles: [
    {
      id: relatedProfileId,
      clientUserId,
      displayName: "Byron",
      relationshipLabel: "child",
      birthDate: null,
      birthTime: null,
      birthTimePrecision: "unknown",
      birthPlaceText: null,
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: null,
      birthTimeDstOccurrence: null,
      birthLatitude: null,
      birthLongitude: null,
      source: "manual",
      revision: 1,
      lastEditedByUserId: clientUserId,
      lastEditedByRole: "astrologer",
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z"
    }
  ],
  serviceWork: {
    status: "available",
    bookings: {
      upcomingTotal: 1,
      upcoming: [
        {
          id: "41111111-1111-4111-8111-111111111111",
          state: "confirmed",
          productTitle: "Natal consultation",
          startAt: "2026-08-21T10:00:00.000Z",
          endAt: "2026-08-21T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: "/calendar?bookingId=41111111-1111-4111-8111-111111111111&startAt=2026-08-21T10%3A00%3A00.000Z"
        }
      ],
      recentTotal: 0,
      recent: []
    },
    sessions: {
      upcomingTotal: 0,
      upcoming: [],
      recentTotal: 1,
      recent: [
        {
          id: "51111111-1111-4111-8111-111111111111",
          bookingId: "41111111-1111-4111-8111-111111111111",
          state: "ended",
          productTitle: "Session review",
          scheduledStartAt: "2026-08-19T10:00:00.000Z",
          scheduledEndAt: "2026-08-19T11:00:00.000Z",
          timeZone: "Europe/Moscow",
          href: "/sessions/51111111-1111-4111-8111-111111111111"
        }
      ]
    }
  },
  activity: { items: [activityItem], nextCursor: null }
} as const satisfies AstrologerClientCrmDetail;
