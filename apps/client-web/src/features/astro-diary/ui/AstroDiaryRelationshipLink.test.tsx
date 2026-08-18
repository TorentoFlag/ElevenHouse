// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AstroDiaryRelationshipLink } from "./AstroDiaryRelationshipLink";

afterEach(cleanup);

describe("AstroDiaryRelationshipLink", () => {
  it("navigates only to the explicit server-related astrologer", () => {
    render(
      <MemoryRouter>
        <AstroDiaryRelationshipLink
          astrologerId="41111111-1111-4111-8111-111111111111"
          label="Open AstroDiary"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Open AstroDiary" })).toHaveAttribute(
      "href",
      "/me/astrologers/41111111-1111-4111-8111-111111111111/journal"
    );
  });
});
