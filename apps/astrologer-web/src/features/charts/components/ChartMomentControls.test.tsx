// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { ChartMomentControls } from "./ChartMomentControls";

afterEach(cleanup);

describe("ChartMomentControls", () => {
  it("delegates progression date changes in the active locale", async () => {
    const onProgressionTargetDateChange = vi.fn();
    render(
      <ChartMomentControls
        activeMode="progression"
        copy={chartEngineCopyByLocale.en}
        disabled={false}
        horaryPlaceErrorMessage={null}
        horaryPlaceText=""
        horaryQuestion={horaryQuestion}
        locale="en"
        progressionTargetDate="2026-08-03"
        solarReturnYear={2026}
        transitMoment={{ date: "2026-08-03", time: "12:00" }}
        onHoraryQuestionChange={vi.fn()}
        onProgressionTargetDateChange={onProgressionTargetDateChange}
        onTransitMomentChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Progression date"), {
      target: { value: "2026-08-04" }
    });
    expect(onProgressionTargetDateChange).toHaveBeenLastCalledWith("2026-08-04");
  });
});

const horaryQuestion = {
  question: "",
  category: "other" as const,
  date: "2026-08-03",
  time: "12:00",
  timezone: "Europe/Moscow",
  latitude: "",
  longitude: ""
};
