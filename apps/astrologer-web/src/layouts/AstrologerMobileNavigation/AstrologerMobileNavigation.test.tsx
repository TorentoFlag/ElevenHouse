// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstrologerMobileNavigationView } from "./AstrologerMobileNavigation";

afterEach(cleanup);

describe("AstrologerMobileNavigation", () => {
  it("keeps Clients in More instead of changing the established mobile primary items", () => {
    render(
      <MemoryRouter initialEntries={["/clients"]}>
        <AstrologerMobileNavigationView copy={astrologerCopyByLocale.en.appShell.navigation} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: "Clients" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("data-active", "true");

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute("href", "/clients");
  });

  it("keeps Reviews in More on mobile", () => {
    render(
      <MemoryRouter initialEntries={["/reviews"]}>
        <AstrologerMobileNavigationView copy={astrologerCopyByLocale.en.appShell.navigation} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: "Reviews" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("data-active", "true");

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute("href", "/reviews");
  });
});
