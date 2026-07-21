// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("shows calculating without queue wording and renders canonical result tables", async () => {
    const user = userEvent.setup();
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
    expect(screen.getByRole("button", { name: /рассчитываем/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /пересчитать/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/очеред/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Солнце").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sun")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Рак/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Дома" }));
    expect(screen.getByText("I дом")).toBeInTheDocument();
  });

  it("renders canonical warnings and distribution summaries", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult({
          warnings: [
            {
              code: "BIRTH_TIME_APPROXIMATE",
              message: "Chart calculated with approximate birth time."
            }
          ]
        })}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByText(/время рождения указано примерно/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /стихии/i })).toBeInTheDocument();
    expect(screen.getByText(/огонь/i)).toBeInTheDocument();
    expect(screen.getByText(/кардинальный/i)).toBeInTheDocument();
    expect(screen.getByText(/мужская/i)).toBeInTheDocument();
  });

  it("renders reference-style dominant points in the left rail after distributions", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult({
          points: [
            {
              id: "sun",
              label: "Sun",
              longitude: 113.1,
              sign: "cancer",
              signDegree: 23.1,
              house: 10,
              retrograde: false
            },
            {
              id: "moon",
              label: "Moon",
              longitude: 21.2,
              sign: "aries",
              signDegree: 21.2,
              house: 8,
              retrograde: false
            },
            {
              id: "pluto",
              label: "Pluto",
              longitude: 227.33,
              sign: "scorpio",
              signDegree: 17.33,
              house: 7,
              retrograde: true
            },
            {
              id: "venus",
              label: "Venus",
              longitude: 84.2,
              sign: "gemini",
              signDegree: 24.2,
              house: 10,
              retrograde: false
            }
          ],
          aspects: [
            { pointA: "moon", pointB: "sun", type: "square", angle: 90, orb: 1.4, applying: true },
            { pointA: "moon", pointB: "pluto", type: "trine", angle: 120, orb: 2.1, applying: true },
            { pointA: "moon", pointB: "venus", type: "sextile", angle: 60, orb: 0.9, applying: false },
            { pointA: "pluto", pointB: "venus", type: "sextile", angle: 60, orb: 1.1, applying: false }
          ]
        })}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    const rail = screen.getByRole("complementary", { name: "Сводка карты" });
    const railText = rail.textContent ?? "";

    const dominantsSection = within(rail)
      .getByRole("heading", { name: "Доминанты" })
      .closest("section");
    expect(dominantsSection).not.toBeNull();
    expect(dominantsSection).toHaveTextContent(/Луна\s*3 асп\./);
    expect(dominantsSection).toHaveTextContent(/Плутон\s*2 асп\./);
    expect(railText.indexOf("Кресты")).toBeLessThan(railText.indexOf("Доминанты"));
    expect(railText.indexOf("Доминанты")).toBeLessThan(railText.indexOf("Ретроградные"));
  });

  it("switches the right panel tabs without mixing table sections", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Планеты" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Дома" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Аспекты" }));

    expect(screen.getByRole("heading", { name: "Аспекты" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Планеты" })).not.toBeInTheDocument();
  });

  it("opens calculation settings from the toolbar in the right panel", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.queryByRole("region", { name: "Настройки расчёта" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Настройки" }));

    expect(screen.getByRole("region", { name: "Настройки расчёта" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Планеты" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Закрыть настройки расчёта" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Цельнознаковая" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Равнодомная" })).toBeInTheDocument();
    expect(screen.getByText(/пресет применяется ко всем новым картам/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Закрыть настройки расчёта" }));

    expect(screen.queryByRole("region", { name: "Настройки расчёта" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Планеты" })).toBeInTheDocument();
  });

  it("renders reference-style planet rows and an aspect matrix in the right panel", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult({
          points: [
            {
              id: "sun",
              label: "Sun",
              longitude: 113.1,
              sign: "cancer",
              signDegree: 23.1,
              house: 10,
              retrograde: false
            },
            {
              id: "moon",
              label: "Moon",
              longitude: 21.2,
              sign: "aries",
              signDegree: 21.2,
              house: 8,
              retrograde: false
            }
          ],
          aspects: [
            { pointA: "sun", pointB: "moon", type: "square", angle: 90, orb: 1.4, applying: true }
          ]
        })}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    const planetsPanel = screen.getByRole("region", { name: "Планеты" });
    expect(within(planetsPanel).getByText("☉︎")).toBeInTheDocument();
    expect(within(planetsPanel).getByText("♋︎")).toBeInTheDocument();
    expect(within(planetsPanel).getByText("23°06'")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Аспекты" }));

    expect(screen.getByRole("heading", { name: "Матрица аспектов" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Луна Квадрат Солнце, орбис 1\.40°/)).toHaveTextContent("□");
  });

  it("renders deterministic interpretation anchors without fake AI output", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult({
          points: [
            {
              id: "sun",
              label: "Sun",
              longitude: 113.1,
              sign: "cancer",
              signDegree: 22.6,
              house: 11,
              retrograde: false
            },
            {
              id: "moon",
              label: "Moon",
              longitude: 21.2,
              sign: "aries",
              signDegree: 21.22,
              house: 8,
              retrograde: false
            }
          ],
          houses: [{ number: 1, longitude: 166.61, sign: "virgo", signDegree: 16.61 }]
        })}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Трактовки" }));

    const interpretationsPanel = screen.getByRole("region", { name: "Трактовки" });
    expect(
      within(interpretationsPanel).getByText("Опорные положения · canonical result")
    ).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Солнце")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Рак 22°36'/)).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Луна")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Овен 21°13'/)).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Asc")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Дева 16°37'/)).toBeInTheDocument();
    expect(
      within(interpretationsPanel).getByRole("button", { name: /AI-черновик недоступен/i })
    ).toBeDisabled();
    expect(
      within(interpretationsPanel).queryByText(/интерпретационный контур не подключён/i)
    ).not.toBeInTheDocument();
  });

  it("syncs planet hover between the wheel, detail card and right panel", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult({
          points: [
            {
              id: "sun",
              label: "Sun",
              longitude: 113.1,
              sign: "cancer",
              signDegree: 23.1,
              house: 10,
              retrograde: false
            },
            {
              id: "pluto",
              label: "Pluto",
              longitude: 227.33,
              sign: "scorpio",
              signDegree: 17.33,
              house: 7,
              retrograde: true
            }
          ],
          aspects: [
            {
              pointA: "sun",
              pointB: "pluto",
              type: "trine",
              angle: 120,
              orb: 2.1,
              applying: true
            }
          ]
        })}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByText(/наведите на планету/i)).toBeInTheDocument();
    const detailSlot = screen.getByTestId("chart-hover-detail-slot");
    expect(detailSlot).toHaveTextContent(/наведите на планету/i);

    const planetsPanel = screen.getByRole("region", { name: "Планеты" });
    const plutoRow = within(planetsPanel).getByTestId("chart-planet-row-pluto");
    await user.hover(plutoRow);

    expect(detailSlot).toHaveTextContent(/Плутон R ретроград/i);
    expect(plutoRow).toHaveAttribute("data-hovered", "true");
    expect(screen.getByRole("button", { name: /Плутон на карте/i })).toHaveAttribute(
      "data-hovered",
      "true"
    );
    expect(screen.getAllByText("Плутон").length).toBeGreaterThan(0);
    expect(screen.getByText(/R ретроград/i)).toBeInTheDocument();
    expect(screen.getByText(/17°20' Скорпион · VII дом/i)).toBeInTheDocument();
    expect(screen.getByText("△")).toBeInTheDocument();
  });

  it("marks an existing result as stale when birth data or settings changed", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        isResultStale
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByText(/карта устарела/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /пересчитать/i })).toBeEnabled();
  });

  it("blocks calculation and hides a saved full chart when birth time is unknown", async () => {
    const user = userEvent.setup();
    const onSaveBirthData = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={{
          ...client,
          birthData: {
            ...client.birthData,
            birthTime: null,
            birthTimePrecision: "unknown"
          }
        }}
        jobState="succeeded"
        result={chartResult({
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
          ]
        })}
        errorMessage={null}
        isBusy={false}
        isResultStale
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onSaveBirthData={onSaveBirthData}
      />
    );

    expect(screen.getByText(/не хватает: время рождения/i)).toBeInTheDocument();
    expect(screen.getByText(/нужны данные рождения/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /рассчитать/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /солнце на карте/i })).not.toBeInTheDocument();

    const chartDataPanel = screen.getByRole("complementary", { name: "Данные карты" });
    expect(within(chartDataPanel).queryByText("Солнце")).not.toBeInTheDocument();
    expect(screen.getByText(/появится после расчёта/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/^время рождения/i)).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/точность времени/i), "approximate");
    expect(screen.getByLabelText(/^время рождения/i)).toBeEnabled();
    await user.type(screen.getByLabelText(/^время рождения/i), "10:30");
    await user.click(screen.getByRole("button", { name: /сохранить данные рождения/i }));

    expect(onSaveBirthData).toHaveBeenCalledWith(
      expect.objectContaining({
        birthTime: "10:30",
        birthTimePrecision: "approximate"
      })
    );
  });

  it("keeps an already calculated current result as a disabled terminal action", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByText(/натальная карта рассчитана/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /рассчитано/i })).toBeDisabled();
  });

  it("allows calculation with approximate birth time", () => {
    render(
      <ChartEnginePage
        selectedClient={{
          ...client,
          birthData: {
            ...client.birthData,
            birthTimePrecision: "approximate"
          }
        }}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /рассчитать/i })).toBeEnabled();
  });

  it("turns a failed calculation into an explicit retry action", async () => {
    const user = userEvent.setup();
    const onCreateNatalJob = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="failed"
        result={null}
        errorMessage="Provider timeout"
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={onCreateNatalJob}
      />
    );

    expect(screen.getByText("Provider timeout")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /повторить/i }));

    expect(onCreateNatalJob).toHaveBeenCalledOnce();
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

function chartResult(
  overrides: Partial<StoredChartCalculationPayload["result"]> = {}
): StoredChartCalculationPayload {
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
      distributions: {
        elements: { fire: 3, earth: 2, air: 1, water: 4 },
        modalities: { cardinal: 4, fixed: 3, mutable: 3 },
        polarity: { masculine: 4, feminine: 6 }
      },
      warnings: [],
      ...overrides
    }
  };
}
