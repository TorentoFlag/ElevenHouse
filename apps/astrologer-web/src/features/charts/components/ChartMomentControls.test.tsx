// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import { ChartMomentControls } from "./ChartMomentControls";

afterEach(cleanup);

describe("ChartMomentControls", () => {
  it("groups horary setup fields by the order in which an astrologer completes them", () => {
    render(
      <ChartMomentControls
        activeMode="horary"
        copy={chartEngineCopyByLocale.en}
        disabled={false}
        horaryLayout="setup"
        horaryPlaceErrorMessage={null}
        horaryPlaceText=""
        horaryQuestion={horaryQuestion}
        locale="en"
        progressionTargetDate="2026-08-03"
        solarReturnYear={2026}
        transitMoment={{ date: "2026-08-03", time: "12:00" }}
        onHoraryQuestionChange={vi.fn()}
        onProgressionTargetDateChange={vi.fn()}
        onTransitMomentChange={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Question" })).toContainElement(
      screen.getByLabelText("Horary question")
    );
    expect(screen.getByRole("region", { name: "Moment" })).toContainElement(
      screen.getByLabelText("Question time")
    );
    expect(screen.getByRole("region", { name: "Place and coordinates" })).toContainElement(
      screen.getByRole("textbox", { name: "Question place" })
    );
    expect(document.querySelectorAll("svg")).toHaveLength(4);
  });

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
