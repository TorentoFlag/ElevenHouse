// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { ChartEngineHeader } from "./ChartEngineHeader";

afterEach(cleanup);

describe("ChartEngineHeader", () => {
  it("renders the selected client and delegates primary mode changes", async () => {
    const user = userEvent.setup();
    const onSelectMode = vi.fn();

    render(
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
    render(
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
    expect(screen.getByText(/Partner ·/u)).toBeInTheDocument();
  });
});

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
