// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstrologerMobileNavigationView } from "./AstrologerMobileNavigation";

describe("AstrologerMobileNavigationView", () => {
  it("keeps primary routes one tap away and exposes the current non-primary route through More", () => {
    render(
      <MemoryRouter initialEntries={["/finance"]}>
        <AstrologerMobileNavigationView
          copy={astrologerCopyByLocale.ru.appShell.navigation}
          canReadProducts={false}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Дашборд" }).getAttribute("href")).toBe(
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: "Воронки" }).getAttribute("href")).toBe("/flows");
    const more = screen.getByRole("button", { name: "Ещё" });
    expect(more.getAttribute("data-active")).toBe("true");

    fireEvent.click(more);

    expect(screen.getByRole("dialog", { name: "Все разделы" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Финансы" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Продукты" })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Настройки" }));
    expect(screen.queryByRole("dialog", { name: "Все разделы" })).toBeNull();
  });
});
