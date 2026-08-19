// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { clientRouteContract } from "../../router.contract";
import { HomePage } from "./HomePage";

afterEach(cleanup);

describe("HomePage", () => {
  it("routes the client subdomain root into the guarded client cabinet", async () => {
    render(
      <MemoryRouter initialEntries={[clientRouteContract.home]}>
        <Routes>
          <Route path={clientRouteContract.home} element={<HomePage />} />
          <Route path={clientRouteContract.authenticatedProfile} element={<h1>Client cabinet</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Client cabinet" })).toBeVisible();
  });
});
