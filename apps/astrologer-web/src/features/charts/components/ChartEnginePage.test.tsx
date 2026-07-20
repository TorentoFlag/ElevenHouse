// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartSettings, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { ChartEnginePage } from "./ChartEnginePage";

const client = {
  value: "22222222-2222-4222-8222-222222222222",
  label: "Марина Краснова",
  initials: "МК",
  subtitle: "15.07.1990 · Рим",
  birthDateDisplay: "15.07.1990",
  hasBirthDate: true,
  birthData: {
    id: "55555555-5555-4555-8555-555555555555",
    clientUserId: "22222222-2222-4222-8222-222222222222",
    label: null,
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: "Рим, Италия",
    birthCountryCode: "IT",
    birthCity: "Рим",
    birthRegion: null,
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: null,
    birthLatitude: 41.9028,
    birthLongitude: 12.4964,
    source: "manual",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z"
  }
} satisfies ClientSelectOption;

describe("ChartEnginePage", () => {
  afterEach(() => cleanup());

  it("keeps non-natal modes disabled and starts only a CRM-backed natal calculation", async () => {
    const user = userEvent.setup();
    const onCreateNatalJob = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={onCreateNatalJob}
      />
    );

    expect(screen.getByRole("button", { name: /транзиты/i })).toBeDisabled();
    expect(screen.getByText(/вводить дату рождения вручную не нужно/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /рассчитать/i }));

    expect(onCreateNatalJob).toHaveBeenCalledOnce();
  });

  it("shows calculating without queue wording and renders canonical result tables", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="calculating"
        result={chartResult()}
        errorMessage={null}
        isBusy={true}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByText(/рассчитываем карту/i)).toBeInTheDocument();
    expect(screen.queryByText(/очеред/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Солнце").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sun")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Рак/).length).toBeGreaterThan(0);
    expect(screen.getByText("I дом")).toBeInTheDocument();
  });

  it("saves missing birth data from the chart engine rail before calculation", async () => {
    const user = userEvent.setup();
    const onSaveBirthData = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={{
          ...client,
          birthDateDisplay: "—",
          hasBirthDate: false,
          birthData: {
            ...client.birthData,
            birthDate: null,
            birthTime: null,
            birthTimePrecision: "unknown",
            birthTimezone: null,
            birthLatitude: null,
            birthLongitude: null
          }
        }}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onSaveBirthData={onSaveBirthData}
        isSavingBirthData={false}
        birthDataError={null}
      />
    );

    expect(screen.getByText(/заполните данные рождения/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /рассчитать/i })).toBeDisabled();

    await user.clear(screen.getByLabelText(/дата рождения/i));
    await user.type(screen.getByLabelText(/дата рождения/i), "1990-07-15");
    await user.selectOptions(screen.getByLabelText(/точность времени/i), "exact");
    await user.clear(screen.getByLabelText(/^время рождения/i));
    await user.type(screen.getByLabelText(/^время рождения/i), "10:30");
    await user.clear(screen.getByLabelText(/место рождения/i));
    await user.type(screen.getByLabelText(/место рождения/i), "Рим, Италия");
    await user.clear(screen.getByLabelText(/часовой пояс/i));
    await user.type(screen.getByLabelText(/часовой пояс/i), "Europe/Rome");
    await user.clear(screen.getByLabelText(/широта/i));
    await user.type(screen.getByLabelText(/широта/i), "41.9028");
    await user.clear(screen.getByLabelText(/долгота/i));
    await user.type(screen.getByLabelText(/долгота/i), "12.4964");
    await user.click(screen.getByRole("button", { name: /сохранить данные рождения/i }));

    expect(onSaveBirthData).toHaveBeenCalledWith({
      label: "Основные данные",
      birthDate: "1990-07-15",
      birthTime: "10:30",
      birthTimePrecision: "exact",
      birthPlaceText: "Рим, Италия",
      birthCountryCode: "IT",
      birthCity: "Рим",
      birthRegion: null,
      birthTimezone: "Europe/Rome",
      birthTimeDstOccurrence: null,
      birthLatitude: 41.9028,
      birthLongitude: 12.4964
    });
  });
});

function settings(): ChartSettings {
  return {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function chartResult(): StoredChartCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      points: [
        {
          id: "sun",
          label: "Sun",
          longitude: 113.1,
          sign: "cancer",
          signDegree: 23.1,
          house: 10,
          retrograde: false
        }
      ],
      houses: [{ number: 1, longitude: 180, sign: "Весы", signDegree: 0 }],
      aspects: [],
      distributions: { elements: { water: 1 }, modalities: {}, polarity: {} },
      warnings: []
    }
  };
}
