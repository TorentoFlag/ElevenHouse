// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const mocks = vi.hoisted(() => ({
  useDocumentTitle: vi.fn(),
  useFlowApprovalsQuery: vi.fn(),
  useI18n: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/flows/model/useFlowApprovalsQuery", () => ({
  useFlowApprovalsQuery: mocks.useFlowApprovalsQuery
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useI18n.mockReturnValue({
      dictionary: {
        dashboard: {
          documentTitle: "ElevenHouse | Кабинет",
          kicker: "Рабочий стол",
          title: "Сегодня"
        }
      }
    });
    mocks.useFlowApprovalsQuery.mockReturnValue({
      data: { approvals: [approval], total: 1 },
      isLoading: false,
      error: null
    });
  });

  afterEach(() => cleanup());

  it("renders pending flow approvals as dashboard tasks linked to flows", () => {
    render(<DashboardPage />);

    expect(screen.getByText("Задачи из воронок")).toBeTruthy();
    expect(screen.getByText("Проверить AI-черновик")).toBeTruthy();
    expect(screen.getByText("Сообщение клиенту ожидает подтверждения.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Открыть воронки" })).toHaveProperty(
      "pathname",
      "/flows"
    );
    expect(screen.queryByText("Сообщение отправлено")).toBeNull();
  });

  it("shows an explicit alert when pending flow approvals fail to load", () => {
    mocks.useFlowApprovalsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("network down")
    });

    render(<DashboardPage />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Не удалось загрузить задачи из воронок"
    );
    expect(screen.queryByText("Нет pending-подтверждений из опубликованных воронок.")).toBeNull();
  });
});

const approval = {
  id: "55555555-5555-4555-8555-555555555555",
  flowRunId: "44444444-4444-4444-8444-444444444444",
  stepRunId: null,
  status: "pending",
  kind: "ai_output",
  title: "Проверить AI-черновик",
  preview: "Сообщение клиенту ожидает подтверждения.",
  createdAt: "2026-07-28T08:01:00.000Z",
  decidedAt: null
};
