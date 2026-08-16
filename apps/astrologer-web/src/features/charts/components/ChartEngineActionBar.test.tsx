// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { ChartEngineActionBar } from "./ChartEngineActionBar";

afterEach(cleanup);

describe("ChartEngineActionBar", () => {
  it("exposes typed reasons for disabled actions", () => {
    renderActionBar();

    expect(screen.getByRole("button", { name: "Export chart" })).toHaveAccessibleDescription(
      "Chart export is not available yet"
    );
    expect(screen.getByRole("button", { name: "Link" })).toHaveAccessibleDescription(
      "Calculate the chart before linking it to the client"
    );
    expect(screen.getByRole("button", { name: "PDF" })).toHaveAccessibleDescription(
      "PDF is available after chart calculation"
    );
  });

  it("delegates enabled calculation, presentation, PDF and panel actions", async () => {
    const user = userEvent.setup();
    const onCalculate = vi.fn();
    const onPresentation = vi.fn();
    const onPdf = vi.fn();
    const onToggleSettings = vi.fn();
    renderActionBar({
      canCalculate: true,
      presentationDisabled: false,
      pdfDisabled: false,
      onCalculate,
      onPresentation,
      onPdf,
      onToggleSettings
    });

    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await user.click(screen.getByRole("button", { name: "Export chart" }));
    await user.click(screen.getByRole("button", { name: "PDF" }));
    await user.click(screen.getByRole("button", { name: /Settings/u }));

    expect(onCalculate).toHaveBeenCalledOnce();
    expect(onPresentation).toHaveBeenCalledOnce();
    expect(onPdf).toHaveBeenCalledOnce();
    expect(onToggleSettings).toHaveBeenCalledOnce();
  });

  it("does not block PDF solely because the active chart mode is non-natal", async () => {
    const user = userEvent.setup();
    const onPdf = vi.fn();
    renderActionBar({
      canCalculate: true,
      pdfDisabled: false,
      pdfTitle: "PDF",
      onPdf
    });

    await user.click(screen.getByRole("button", { name: "PDF" }));

    expect(onPdf).toHaveBeenCalledOnce();
  });
});

function renderActionBar(overrides: Partial<Parameters<typeof ChartEngineActionBar>[0]> = {}) {
  return render(
    <ChartEngineActionBar
      birthDataEditorAvailable={false}
      calculateLabel="Calculate"
      canCalculate={false}
      copy={chartEngineCopyByLocale.en}
      isBirthDataEditorOpen={false}
      isCalculationLinked={false}
      isSettingsPanelOpen={false}
      linkDisabled
      presentationDisabled
      pdfDisabled
      pdfErrorMessage={null}
      pdfLabel="PDF"
      pdfTitle="PDF is available after chart calculation"
      onCalculate={vi.fn()}
      onToggleBirthDataEditor={vi.fn()}
      onToggleSettings={vi.fn()}
      {...overrides}
    />
  );
}
