// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@elevenhouse/i18n";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstroCalendarPage } from "./AstroCalendarPage";

describe("AstroCalendarPage", () => {
  it("mounts the astro calendar route page", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider dictionaries={astrologerCopyByLocale}>
          <AstroCalendarPage />
        </I18nProvider>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: /астрокалендарь/i })).toBeInTheDocument();
  });
});
