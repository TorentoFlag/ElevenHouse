// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@elevenhouse/i18n";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { ChartEngineRoute } from "./ChartEngineRoute";

describe("ChartEngineRoute", () => {
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
});
