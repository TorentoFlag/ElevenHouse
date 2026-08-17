// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientRelatedBirthProfileResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { ChartEngineHeader } from "./ChartEngineHeader";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChartEngineHeader", () => {
  it("renders the selected client and delegates primary mode changes", async () => {
    const user = userEvent.setup();
    const onSelectMode = vi.fn();

    renderHeader(
      <ChartEngineHeader
        actionBar={<button type="button">Calculate</button>}
        activeMode="natal"
        copy={chartEngineCopyByLocale.en}
        isBusy={false}
        selectedClient={client}
        selectedPartnerClient={null}
        onSelectMode={onSelectMode}
      />
    );

    expect(screen.getByRole("heading", { name: "Chart Engine" })).toBeInTheDocument();
    expect(screen.getByText("Marina Krasnova")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Transits" }));

    expect(onSelectMode).toHaveBeenCalledWith("transit");
  });

  it("renders the partner strip only for a two-client method", () => {
    renderHeader(
      <ChartEngineHeader
        actionBar={null}
        activeMode="synastry"
        copy={chartEngineCopyByLocale.en}
        isBusy={false}
        selectedClient={client}
        selectedPartnerClient={partnerClient}
        onSelectMode={vi.fn()}
      />
    );

    expect(screen.getByText("Alex Petrov")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Partner" })).toHaveTextContent("Alex Petrov");
    expect(screen.queryByText("Client profiles")).not.toBeInTheDocument();
  });

  it("exposes chart type explanations through accessible tooltips", async () => {
    const user = userEvent.setup();
    renderHeader(
      <ChartEngineHeader
        actionBar={null}
        activeMode="natal"
        copy={chartEngineCopyByLocale.en}
        isBusy={false}
        selectedClient={client}
        selectedPartnerClient={null}
        onSelectMode={vi.fn()}
      />
    );

    const natal = screen.getByRole("button", { name: "Natal" });
    const natalTooltip = screen.getByText("Planet and house positions at the person's birth moment.");
    expect(natal).toHaveAttribute("aria-describedby", natalTooltip.id);
    expect(natalTooltip.parentElement).toHaveClass("ehTooltip--bottom");
    expect(natal).not.toHaveAttribute("title");
    expect(screen.getByText("Natal chart with interpretations adapted for childhood.")).toBeInTheDocument();
    expect(
      screen.getByText("Planetary influence on the selected date relative to the natal chart.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open other chart types/i }));

    const synastry = screen.getByRole("menuitem", { name: "Synastry" });
    const synastryTooltip = screen.getByText(
      "Comparison of two charts to analyze how people interact."
    );
    expect(synastry).toHaveAttribute("aria-describedby", synastryTooltip.id);
    expect(synastryTooltip.parentElement).toHaveClass("ehTooltip--right");
    expect(screen.getByText("Symbolic development of the natal chart over time.")).toBeInTheDocument();
    expect(screen.getByText("One relationship chart built from both participants' data.")).toBeInTheDocument();
    expect(
      screen.getByText("Forecast chart for the year from one solar return to the next.")
    ).toBeInTheDocument();
    expect(screen.getByText("Chart of the moment when a specific question was asked.")).toBeInTheDocument();
    expect(
      screen.getByText("World map with planetary influence lines for different places.")
    ).toBeInTheDocument();
  });

  it("keeps client profiles inside the single partner picker", async () => {
    const user = userEvent.setup();
    const onSelectRelatedProfile = vi.fn();
    const onOpenRelatedProfileEditor = vi.fn();
    vi.spyOn(application.http, "get").mockResolvedValue({ clients: [], total: 0 });

    renderHeader(
      <ChartEngineHeader
        actionBar={null}
        activeMode="synastry"
        copy={chartEngineCopyByLocale.en}
        isBusy={false}
        selectedClient={{ ...client, relatedBirthProfiles: [relatedProfile] }}
        selectedPartnerClient={null}
        selectedPartnerRelatedProfile={null}
        onSelectMode={vi.fn()}
        onSelectPartnerRelatedProfile={onSelectRelatedProfile}
        onOpenRelatedProfileEditor={onOpenRelatedProfileEditor}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Partner" }));

    expect(screen.getByText("Client profiles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add profile" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Ivan Ivanov/u }));

    expect(onSelectRelatedProfile).toHaveBeenCalledWith(relatedProfile);
  });
});

function renderHeader(ui: React.ReactElement) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>
  );
}

const client = {
  value: "22222222-2222-4222-8222-222222222222",
  label: "Marina Krasnova",
  initials: "MK",
  subtitle: "15 Jul 1990 · Rome",
  birthDateDisplay: "15 Jul 1990",
  hasBirthDate: true,
  birthData: null
} satisfies ClientSelectOption;

const partnerClient = {
  ...client,
  value: "33333333-3333-4333-8333-333333333333",
  label: "Alex Petrov",
  initials: "AP"
} satisfies ClientSelectOption;

const relatedProfile = {
  id: "99999999-9999-4999-8999-999999999999",
  clientUserId: client.value,
  birthDate: "1991-04-15",
  birthTime: "09:20",
  birthTimePrecision: "exact",
  birthPlaceText: "Moscow, Russia",
  birthCountryCode: "RU",
  birthCity: "Moscow",
  birthRegion: null,
  birthTimezone: "Europe/Moscow",
  birthTimeDstOccurrence: null,
  birthLatitude: 55.7558,
  birthLongitude: 37.6173,
  source: "manual",
  revision: 1,
  lastEditedByUserId: client.value,
  lastEditedByRole: "client",
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  displayName: "Ivan Ivanov",
  relationshipLabel: "husband"
} satisfies ClientRelatedBirthProfileResponse;
