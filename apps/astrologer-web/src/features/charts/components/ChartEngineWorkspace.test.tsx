// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { getChartBirthDataReadiness } from "../model/chartEngineState";
import { ChartEngineWorkspace } from "./ChartEngineWorkspace";

afterEach(cleanup);

describe("ChartEngineWorkspace", () => {
  it("owns the localized no-client workspace state", () => {
    render(
      <ChartEngineWorkspace
        activeMode="natal"
        birthDataError={null}
        calculationId={null}
        canRequestAi={false}
        copy={chartEngineCopyByLocale.en}
        displayResult={null}
        errorMessage={null}
        interpretationMode={null}
        isBusy={false}
        isResultStale={false}
        isSavingBirthData={false}
        isSettingsPanelOpen={false}
        jobState="idle"
        locale="en"
        partnerReadiness={getChartBirthDataReadiness(undefined, "en")}
        readiness={getChartBirthDataReadiness(undefined, "en")}
        selectedClient={null}
        selectedPartnerClient={null}
        settings={settings}
        shouldShowBirthDataEditor={false}
        onCloseSettings={vi.fn()}
        onSettingsChange={vi.fn()}
      />
    );

    expect(screen.getByRole("status", { name: "Choose a client" })).toHaveTextContent(
      "The chart and calculation data appear after choosing a client from CRM."
    );
  });

  it("keeps the primary chart before the optional summary rail in reading order", () => {
    render(
      <ChartEngineWorkspace
        activeMode="natal"
        birthDataError={null}
        calculationId={null}
        canRequestAi={false}
        copy={chartEngineCopyByLocale.en}
        displayResult={null}
        errorMessage={null}
        interpretationMode={null}
        isBusy={false}
        isResultStale={false}
        isSavingBirthData={false}
        isSettingsPanelOpen={false}
        jobState="idle"
        locale="en"
        partnerReadiness={getChartBirthDataReadiness(undefined, "en")}
        readiness={getChartBirthDataReadiness(client.birthData, "en")}
        selectedClient={client}
        selectedPartnerClient={null}
        settings={settings}
        shouldShowBirthDataEditor={false}
        onCloseSettings={vi.fn()}
        onSettingsChange={vi.fn()}
      />
    );

    const chart = screen.getByRole("img", { name: "Chart wheel" });
    const rail = screen.getByRole("complementary", { name: "Chart summary" });

    expect(chart.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});

const client = {
  value: "22222222-2222-4222-8222-222222222222",
  label: "Marina Krasnova",
  initials: "MK",
  subtitle: "No birth data",
  birthDateDisplay: "",
  hasBirthDate: false,
  birthData: null
} satisfies ClientSelectOption;

const settings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
} as const;
