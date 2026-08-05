// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const mocks = vi.hoisted(() => ({
  useDocumentTitle: vi.fn(),
  flowWorkItemQueuePanel: vi.fn(),
  useI18n: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: mocks.useI18n
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/flows/ui/FlowWorkItemQueuePanel", () => ({
  FlowWorkItemQueuePanel: (props: {
    locale: "ru" | "en";
    limit: number;
    className?: string;
    headerAction?: React.ReactNode;
  }) => {
    mocks.flowWorkItemQueuePanel(props);
    return (
      <section data-testid="dashboard-flow-work-items" className={props.className}>
        {props.headerAction}
      </section>
    );
  }
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useI18n.mockReturnValue({
      locale: "ru",
      dictionary: {
        dashboard: {
          documentTitle: "ElevenHouse | Кабинет",
          kicker: "Рабочий стол",
          title: "Сегодня"
        }
      }
    });
  });

  afterEach(() => cleanup());

  it("mounts the compact production work-item projection instead of legacy approvals", () => {
    renderDashboard();

    expect(mocks.flowWorkItemQueuePanel).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "ru", limit: 5 })
    );
    expect(screen.getByTestId("dashboard-flow-work-items")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Все воронки" })).toHaveProperty("pathname", "/flows");
    expect(screen.queryByText("Проверить AI-черновик")).toBeNull();
    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("ElevenHouse | Кабинет");
  });

  it("localizes the projection navigation for an English operator", () => {
    mocks.useI18n.mockReturnValue({
      locale: "en",
      dictionary: {
        dashboard: {
          documentTitle: "ElevenHouse | Dashboard",
          kicker: "Workspace",
          title: "Today"
        }
      }
    });

    renderDashboard();

    expect(mocks.flowWorkItemQueuePanel).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", limit: 5 })
    );
    expect(screen.getByRole("link", { name: "All flows" })).toHaveProperty("pathname", "/flows");
  });
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}
