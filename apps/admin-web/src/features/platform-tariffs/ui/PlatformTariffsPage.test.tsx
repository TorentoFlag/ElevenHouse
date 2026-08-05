// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminTariffResponse } from "@elevenhouse/contracts";
import type { AdminPlatformTariffsApi } from "../api/adminPlatformTariffsApi";
import { PlatformTariffsPage } from "./PlatformTariffsPage";

const draft: AdminTariffResponse = {
  tariffSeriesId: "pro",
  version: 1,
  name: "Pro",
  tagline: "Для активной практики",
  monthlyPriceMinor: 199_000,
  yearlyPriceMinor: 1_990_000,
  monthlyRecurringFrequencyDays: 31,
  yearlyRecurringFrequencyDays: 365,
  clientSaleCommissionBps: 800,
  seatsLimit: 1,
  bookingsLimit: null,
  aiRequestsLimit: null,
  automationLimit: null,
  isPopular: true,
  displayOrder: 0,
  features: ["engine", "natal", "page"],
  draftRevision: 1,
  lifecycle: "draft",
  canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
};

describe("PlatformTariffsPage", () => {
  afterEach(cleanup);

  it("shows server-backed tariff versions and only exposes publication for a draft", async () => {
    render(<PlatformTariffsPage api={apiStub()} />);

    expect(await screen.findByRole("heading", { name: "Тарифы" })).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("Черновик")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Новый тариф" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Финансы" }).getAttribute("href")).toBe("?section=finance");
  });

  it("creates a next immutable version from a published tariff instead of editing it", async () => {
    const api = apiStub({ ...draft, lifecycle: "published" });
    render(<PlatformTariffsPage api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: "Создать v2" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    await waitFor(() =>
      expect(api.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({ tariffSeriesId: "pro", version: 2 }),
        expect.any(String)
      )
    );
  });

  it("sets the required recurring period when an operator prices a new monthly tariff", async () => {
    render(<PlatformTariffsPage api={apiStub()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Новый тариф" }));
    fireEvent.change(screen.getByLabelText("Цена / месяц, коп."), { target: { value: "199000" } });

    expect((screen.getByLabelText("Период месяца, дней") as HTMLInputElement).value).toBe("31");
  });
});

function apiStub(...tariffs: readonly AdminTariffResponse[]): AdminPlatformTariffsApi {
  return {
    listTariffs: vi.fn(async () => ({ tariffs: [...(tariffs.length > 0 ? tariffs : [draft])] })),
    createDraft: vi.fn(async (input) => ({ ...input, ...draft, lifecycle: "draft" as const })),
    updateDraft: vi.fn(async (input) => ({ ...input, ...draft, lifecycle: "draft" as const })),
    publishDraft: vi.fn(async () => ({ ...draft, lifecycle: "published" as const }))
  };
}
