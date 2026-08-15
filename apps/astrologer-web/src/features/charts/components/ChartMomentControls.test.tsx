// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      screen.getByRole("button", { name: "Time: 12:00" })
    );
    expect(screen.getByRole("region", { name: "Place and coordinates" })).toContainElement(
      screen.getByRole("textbox", { name: "Question place" })
    );
    expect(document.querySelectorAll("svg")).toHaveLength(6);
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

  it("uses the shared date and time pickers to set the horary moment", async () => {
    const user = userEvent.setup();
    const onHoraryQuestionChange = vi.fn();

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
        onHoraryQuestionChange={onHoraryQuestionChange}
        onProgressionTargetDateChange={vi.fn()}
        onTransitMomentChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Date: 03.08.2026" }));
    await user.selectOptions(screen.getByLabelText("Birth year"), "2026");
    await user.selectOptions(screen.getByLabelText("Birth month"), "08");
    await user.click(screen.getByRole("button", { name: "August 10, 2026" }));

    expect(onHoraryQuestionChange).toHaveBeenLastCalledWith({
      ...horaryQuestion,
      date: "2026-08-10"
    });

    await user.click(screen.getByRole("button", { name: "Time: 12:00" }));
    await user.click(screen.getByRole("button", { name: "10:00" }));
    await user.click(screen.getByRole("button", { name: "30 minutes" }));

    expect(onHoraryQuestionChange).toHaveBeenLastCalledWith({
      ...horaryQuestion,
      time: "10:30"
    });
  });

  it("selects the horary timezone from IANA options instead of requiring text entry", async () => {
    const user = userEvent.setup();
    const onHoraryQuestionChange = vi.fn();

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
        onHoraryQuestionChange={onHoraryQuestionChange}
        onProgressionTargetDateChange={vi.fn()}
        onTransitMomentChange={vi.fn()}
      />
    );

    const timezone = screen.getByRole("combobox", { name: "Question timezone" });
    expect(timezone).toHaveValue("Europe/Moscow");
    expect(screen.getByRole("option", { name: "UTC" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "America/New_York" })).toBeInTheDocument();

    await user.selectOptions(timezone, "America/New_York");

    expect(onHoraryQuestionChange).toHaveBeenLastCalledWith({
      ...horaryQuestion,
      timezone: "America/New_York"
    });
  });

  it("does not restart horary place autocomplete when the parent callback identity changes", async () => {
    vi.useFakeTimers();
    const firstSearch = vi.fn(async () => []);
    const secondSearch = vi.fn(async () => []);
    const thirdSearch = vi.fn(async () => []);
    const view = (onSearchBirthPlaces: typeof firstSearch) => (
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
        onSearchBirthPlaces={onSearchBirthPlaces}
        onTransitMomentChange={vi.fn()}
      />
    );

    try {
      const { rerender } = render(view(firstSearch));

      fireEvent.change(screen.getByRole("textbox", { name: "Question place" }), {
        target: { value: "Moscow" }
      });
      await vi.advanceTimersByTimeAsync(250);
      rerender(view(secondSearch));
      await vi.advanceTimersByTimeAsync(250);

      expect(firstSearch).toHaveBeenCalledOnce();
      expect(firstSearch).toHaveBeenCalledWith("Moscow");
      expect(secondSearch).not.toHaveBeenCalled();

      rerender(view(thirdSearch));
      await vi.advanceTimersByTimeAsync(500);

      expect(thirdSearch).not.toHaveBeenCalled();
      expect(firstSearch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
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
