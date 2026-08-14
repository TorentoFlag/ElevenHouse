// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstroDiaryPage } from "./AstroDiaryPage";

const mocks = vi.hoisted(() => ({
  locale: "ru" as "ru" | "en",
  useDocumentTitle: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: () => ({
    locale: mocks.locale,
    dictionary: astrologerCopyByLocale[mocks.locale]
  })
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

describe("AstroDiaryPage", () => {
  it("renders an honest production connection state without fake journal data", () => {
    mocks.locale = "ru";

    render(<AstroDiaryPage />);

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("Астродневник");
    expect(screen.getByRole("heading", { name: "Астродневник" })).toBeTruthy();
    expect(screen.getByText("Контур журнала подключается")).toBeTruthy();
    expect(
      screen.getByText(
        /Записи, голосовые заметки, файлы .* появятся здесь только после подключения/
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /создать/i })).toBeNull();
  });
});
