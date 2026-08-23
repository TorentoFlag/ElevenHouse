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
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));

vi.mock("../../Application", () => ({ application: { http } }));

afterEach(cleanup);

describe("ClientsPage", () => {
  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
    http.put.mockReset();
  });

  it("renders list loading, empty, error and retry states without local CRM placeholders", async () => {
    const pendingList = deferred<unknown>();
    http.get.mockReturnValueOnce(pendingList.promise);

    renderClientsPage();

    expect(screen.getByRole("status", { name: "Загрузка клиентов" })).toBeVisible();
    pendingList.resolve({ items: [], nextCursor: null });
    expect(await screen.findByText("Клиентов пока нет")).toBeVisible();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeVisible();

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
        ([path]) =>
          typeof path === "string" && path.includes("query=Ada") && path.includes("cursor=")
      )
    ).toBe(false);
  });

  it("switches between list and pipeline presentation without changing CRM data source", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path.startsWith("/clients/crm?")) {
        return { items: [adaListItem, graceListItem], nextCursor: null };
      }
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111") {
        return { client: adaDetail };
      }
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111/activity") {
        return { items: [activityItem], nextCursor: null };
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    renderClientsPage();

    expect(await screen.findByRole("button", { name: /Ada Lovelace/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Воронка" }));

    expect(screen.getByRole("button", { name: "Воронка" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getAllByText("Новый").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Активный").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Grace Hopper/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Список" }));
    expect(screen.getByRole("button", { name: "Список" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Ada Lovelace/ })).toBeVisible();
  });

  it("creates a manual CRM client and opens the server-owned detail projection", async () => {
    const newClientUserId = "33333333-3333-4333-8333-333333333333";
    const newClient = {
      ...adaDetail,
      clientUserId: newClientUserId,
      displayName: "Мария Орлова",
      relationship: {
        ...adaDetail.relationship,
        id: "33333333-3333-4333-8333-333333333334",
        source: "manual"
      },
      lifecycle: { ...adaDetail.lifecycle, status: "new", revision: 1 },
      privateCrm: { note: null, tags: [], updatedAt: "2026-08-20T12:00:00.000Z" },
      birthData: null,
      relatedBirthProfiles: []
    } as const satisfies AstrologerClientCrmDetail;

    http.get.mockImplementation(async (path: string) => {
      if (path === `/clients/crm/${newClientUserId}`) return { client: newClient };
      if (path === `/clients/crm/${newClientUserId}/activity`) {
        return { items: [], nextCursor: null };
      }
      if (path.startsWith("/clients/crm?")) return { items: [adaListItem], nextCursor: null };
      throw new Error(`Unexpected GET ${path}`);
    });
    http.post.mockResolvedValue({ client: newClient });

    renderClientsPage();

    fireEvent.click(await screen.findByRole("button", { name: "Добавить" }));
    fireEvent.change(screen.getByLabelText("Имя клиента"), {
      target: { value: "  Мария   Орлова  " }
    });
    fireEvent.change(screen.getByLabelText("Язык"), { target: { value: "ru" } });
    fireEvent.change(screen.getByLabelText("Часовой пояс"), {
      target: { value: "Europe/Moscow" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать клиента" }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        "/clients/crm",
        {
          displayName: "Мария Орлова",
          preferredLocale: "ru",
          timezone: "Europe/Moscow"
        },
        { csrf: true }
      )
    );
    expect(await screen.findByRole("heading", { name: "Мария Орлова" })).toBeVisible();
    expect(screen.queryByText("Переписка")).not.toBeInTheDocument();
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
    expect(screen.getByText("CRM")).toBeVisible();
    expect(screen.getAllByText("Активный").length).toBeGreaterThan(0);
    expect(screen.getByText("Natal")).toBeVisible();
    expect(screen.getByText("VIP")).toBeVisible();
    expect(screen.getByText("Prepare compatibility follow-up")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Natal consultation.*21 авг. 2026 г./ })
    ).toHaveAttribute(
      "href",
      "/calendar?bookingId=41111111-1111-4111-8111-111111111111&startAt=2026-08-21T10%3A00%3A00.000Z"
    );
    expect(screen.getByRole("link", { name: /Session review.*19 авг. 2026 г./ })).toHaveAttribute(
      "href",
      "/sessions/51111111-1111-4111-8111-111111111111"
    );
    expect(screen.getByText("Заказы")).toBeVisible();
    expect(screen.getByText("Paid report")).toBeVisible();
    expect(screen.getByText("Платежи")).toBeVisible();
    expect(screen.getByText(/Платеж 61111111/)).toBeVisible();

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

  it("edits astrologer-private CRM attributes without creating correspondence UI", async () => {
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
    http.put.mockResolvedValue({
      privateCrm: {
        note: "Needs birth time confirmation",
        tags: ["Follow-up"],
        updatedAt: "2026-08-20T11:00:00.000Z"
      }
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    fireEvent.click(await screen.findByRole("button", { name: "Редактировать CRM" }));
    fireEvent.change(screen.getByLabelText("Теги"), { target: { value: "Follow-up" } });
    fireEvent.change(screen.getByLabelText("Приватная заметка"), {
      target: { value: "Needs birth time confirmation" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить CRM" }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        "/clients/crm/11111111-1111-4111-8111-111111111111/private-profile",
        {
          note: "Needs birth time confirmation",
          tags: ["Follow-up"]
        },
        { csrf: true }
      )
    );
    expect(await screen.findByText("Follow-up")).toBeVisible();
    expect(screen.queryByPlaceholderText(/написать/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-chat-bubble]")).not.toBeInTheDocument();
  });

  it("edits client birth data through the relationship-scoped CRM card", async () => {
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
    http.put.mockResolvedValue({
      client: {
        clientUserId,
        displayName: adaDetail.displayName,
        relationshipStatus: adaDetail.relationship.status,
        firstLinkedAt: adaDetail.relationship.firstLinkedAt,
        lastLinkedAt: adaDetail.relationship.lastLinkedAt,
        birthData: {
          ...adaDetail.birthData,
          birthTime: "13:45",
          birthTimePrecision: "approximate",
          birthPlaceText: "Oxford, UK",
          birthTimezone: "Europe/London",
          revision: 3,
          updatedAt: "2026-08-20T12:00:00.000Z"
        },
        relatedBirthProfiles: adaDetail.relatedBirthProfiles
      }
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    fireEvent.click(await screen.findByRole("tab", { name: "Данные рождения" }));
    fireEvent.click(screen.getByRole("button", { name: "Редактировать данные рождения" }));
    fireEvent.change(screen.getByLabelText("Дата рождения"), { target: { value: "1815-12-10" } });
    fireEvent.change(screen.getByLabelText("Время рождения"), { target: { value: "13:45" } });
    fireEvent.change(screen.getByLabelText("Точность времени"), {
      target: { value: "approximate" }
    });
    fireEvent.change(screen.getByLabelText("Место"), { target: { value: "Oxford, UK" } });
    fireEvent.change(screen.getByLabelText("Часовой пояс"), {
      target: { value: "Europe/London" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить данные рождения" }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        "/clients/11111111-1111-4111-8111-111111111111/birth-data",
        expect.objectContaining({
          birthDate: "1815-12-10",
          birthTime: "13:45",
          birthTimePrecision: "approximate",
          birthPlaceText: "Oxford, UK",
          birthTimezone: "Europe/London",
          expectedRevision: 2
        }),
        { csrf: true }
      )
    );
    expect(await screen.findByText("13:45 · approximate")).toBeVisible();
    expect(screen.getByText("Oxford, UK")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
  });

  it("submits native birth date and time input values from the CRM editor", async () => {
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
    http.put.mockResolvedValue({
      client: {
        clientUserId,
        displayName: adaDetail.displayName,
        relationshipStatus: adaDetail.relationship.status,
        firstLinkedAt: adaDetail.relationship.firstLinkedAt,
        lastLinkedAt: adaDetail.relationship.lastLinkedAt,
        birthData: {
          ...adaDetail.birthData,
          birthDate: "1816-01-01",
          birthTime: "14:15",
          revision: 3,
          updatedAt: "2026-08-20T12:00:00.000Z"
        },
        relatedBirthProfiles: adaDetail.relatedBirthProfiles
      }
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    fireEvent.click(await screen.findByRole("tab", { name: "Данные рождения" }));
    fireEvent.click(screen.getByRole("button", { name: "Редактировать данные рождения" }));
    fireEvent.input(screen.getByLabelText("Дата рождения"), {
      target: { value: "1816-01-01" }
    });
    fireEvent.input(screen.getByLabelText("Время рождения"), {
      target: { value: "14:15" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить данные рождения" }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        "/clients/11111111-1111-4111-8111-111111111111/birth-data",
        expect.objectContaining({
          birthDate: "1816-01-01",
          birthTime: "14:15",
          expectedRevision: 2
        }),
        { csrf: true }
      )
    );
  });

  it("creates and updates related birth profiles without leaving the CRM context", async () => {
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
    http.post.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      clientUserId,
      displayName: "Annabella",
      relationshipLabel: "partner",
      birthDate: "1812-05-01",
      birthTime: null,
      birthTimePrecision: "unknown",
      birthPlaceText: "London, UK",
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: "Europe/London",
      birthTimeDstOccurrence: null,
      birthLatitude: null,
      birthLongitude: null,
      source: "manual",
      revision: 1,
      lastEditedByUserId: clientUserId,
      lastEditedByRole: "astrologer",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z"
    });
    http.put.mockResolvedValue({
      ...adaDetail.relatedBirthProfiles[0],
      relationshipLabel: "son",
      revision: 2,
      updatedAt: "2026-08-20T12:30:00.000Z"
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    fireEvent.click(await screen.findByRole("tab", { name: "Связанные профили" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить профиль" }));
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Annabella" } });
    fireEvent.change(screen.getByLabelText("Связь"), { target: { value: "partner" } });
    fireEvent.change(screen.getByLabelText("Дата рождения"), { target: { value: "1812-05-01" } });
    fireEvent.change(screen.getByLabelText("Место"), { target: { value: "London, UK" } });
    fireEvent.change(screen.getByLabelText("Часовой пояс"), {
      target: { value: "Europe/London" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        "/clients/11111111-1111-4111-8111-111111111111/related-birth-profiles",
        expect.objectContaining({
          displayName: "Annabella",
          relationshipLabel: "partner",
          birthDate: "1812-05-01",
          birthTimePrecision: "unknown",
          birthPlaceText: "London, UK",
          birthTimezone: "Europe/London",
          expectedRevision: null
        }),
        { csrf: true }
      )
    );
    expect(await screen.findByText("Annabella")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Редактировать Byron" }));
    fireEvent.change(screen.getByLabelText("Связь"), { target: { value: "son" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith(
        "/clients/11111111-1111-4111-8111-111111111111/related-birth-profiles/33333333-3333-4333-8333-333333333333",
        expect.objectContaining({
          displayName: "Byron",
          relationshipLabel: "son",
          expectedRevision: 1
        }),
        { csrf: true }
      )
    );
    expect(await screen.findByText("son")).toBeVisible();
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

  it("records paid order fulfillment from client service work for review collection", async () => {
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
    http.post.mockResolvedValue({
      id: "91111111-1111-4111-8111-111111111111",
      clientUserId,
      astrologerUserId: "81111111-1111-4111-8111-111111111111",
      relationshipId: "21111111-1111-4111-8111-111111111111",
      kind: "async_delivery",
      sourceResourceKey: "async_delivery:61111111-1111-4111-8111-111111111111",
      productId: "91111111-1111-4111-8111-111111111112",
      orderId: "61111111-1111-4111-8111-111111111111",
      titleSnapshot: "Paid report",
      contextLabelSnapshot: "Материал выдан клиенту",
      receivedAt: "2026-08-20T12:00:00.000Z",
      windowPolicy: "standard_14_days_after_receipt",
      activePeriodEndsAt: null,
      status: "received"
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    fireEvent.click(await screen.findByRole("button", { name: "Открыть отзыв" }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        "/reviews/source-receipts/paid-order-fulfillment",
        {
          orderId: "61111111-1111-4111-8111-111111111111",
          activePeriodEndsAt: null
        },
        {
          csrf: true,
          headers: {
            "idempotency-key":
              "client-crm-review-receipt:61111111-1111-4111-8111-111111111111"
          }
        }
      )
    );
    await waitFor(() =>
      expect(
        http.get.mock.calls.filter(([path]) =>
          String(path).startsWith("/clients/crm/11111111-1111-4111-8111-111111111111")
        ).length
      ).toBeGreaterThanOrEqual(4)
    );
  });

  it("renders service-work unavailable and empty states without fake module data", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111") {
        return { client: unavailableServiceWorkDetail };
      }
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111/activity") {
        return { items: [activityItem], nextCursor: null };
      }
      if (path.startsWith("/clients/crm?")) return { items: [adaListItem], nextCursor: null };
      throw new Error(`Unexpected GET ${path}`);
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    expect(await screen.findByText("Не удалось загрузить работу с клиентом")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Natal consultation/ })).not.toBeInTheDocument();

    cleanup();
    http.get.mockReset();
    http.get.mockImplementation(async (path: string) => {
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111") {
        return { client: emptyServiceWorkDetail };
      }
      if (path === "/clients/crm/11111111-1111-4111-8111-111111111111/activity") {
        return { items: [activityItem], nextCursor: null };
      }
      if (path.startsWith("/clients/crm?")) return { items: [adaListItem], nextCursor: null };
      throw new Error(`Unexpected GET ${path}`);
    });

    renderClientsPage({ route: "/clients/11111111-1111-4111-8111-111111111111" });

    expect(await screen.findByText("Работы, заказов и платежей пока нет")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Session review/ })).not.toBeInTheDocument();
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

    expect(
      await screen.findByRole("alert", { name: "Не удалось загрузить карточку" })
    ).toHaveTextContent("Не удалось загрузить карточку");
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
  privateCrm: {
    note: "Prepare compatibility follow-up",
    tags: ["Natal", "VIP"],
    updatedAt: "2026-08-20T10:00:00.000Z"
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
  privateCrm: {
    note: null,
    tags: [],
    updatedAt: "2026-08-19T10:00:00.000Z"
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
  privateCrm: {
    note: "Prepare compatibility follow-up",
    tags: ["Natal", "VIP"],
    updatedAt: "2026-08-20T10:00:00.000Z"
  },
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
    },
    orders: {
      recentTotal: 1,
      recent: [
        {
          id: "61111111-1111-4111-8111-111111111111",
          status: "paid",
          productTitle: "Paid report",
          amountMinor: 12000,
          currency: "RUB",
          bookingId: null,
          createdAt: "2026-08-20T09:00:00.000Z",
          updatedAt: "2026-08-20T09:05:00.000Z"
        }
      ]
    },
    payments: {
      recentTotal: 1,
      recent: [
        {
          id: "71111111-1111-4111-8111-111111111111",
          orderId: "61111111-1111-4111-8111-111111111111",
          status: "captured",
          amountMinor: 12000,
          currency: "RUB",
          createdAt: "2026-08-20T09:01:00.000Z",
          updatedAt: "2026-08-20T09:05:00.000Z"
        }
      ]
    }
  },
  activity: { items: [activityItem], nextCursor: null }
} as const satisfies AstrologerClientCrmDetail;

const unavailableServiceWorkDetail = {
  ...adaDetail,
  serviceWork: {
    status: "unavailable",
    source: "bookings",
    code: "summary_unavailable",
    retryable: true
  }
} as const satisfies AstrologerClientCrmDetail;

const emptyServiceWorkDetail = {
  ...adaDetail,
  serviceWork: {
    status: "available",
    bookings: {
      upcomingTotal: 0,
      upcoming: [],
      recentTotal: 0,
      recent: []
    },
    sessions: {
      upcomingTotal: 0,
      upcoming: [],
      recentTotal: 0,
      recent: []
    },
    orders: {
      recentTotal: 0,
      recent: []
    },
    payments: {
      recentTotal: 0,
      recent: []
    }
  }
} as const satisfies AstrologerClientCrmDetail;
