// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@elevenhouse/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { ChartEngineRoute, ChartEngineRouteError } from "./ChartEngineRoute";

vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();

  return {
    ...original,
    useRouteError: () => new Error("HTTP request failed with status 502")
  };
});

describe("ChartEngineRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts the natal-only chart engine route", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider dictionaries={astrologerCopyByLocale}>
          <ChartEngineRoute />
        </I18nProvider>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: /движок карт/i })).toBeInTheDocument();
  });

  it("renders a local route fallback without leaking the router system error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<ChartEngineRouteError />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Не удалось выполнить расчёт.*Сервис временно недоступен/s
    );
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTP request failed|status 502/i)).not.toBeInTheDocument();
  });
});
