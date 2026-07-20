// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ChartEngineRoute } from "./ChartEngineRoute";

describe("ChartEngineRoute", () => {
  it("mounts the natal-only chart engine route", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ChartEngineRoute />
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: /движок карт/i })).toBeInTheDocument();
  });
});
