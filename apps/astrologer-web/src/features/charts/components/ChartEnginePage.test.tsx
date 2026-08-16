// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import type {
  CalculationInterpretationResponse,
  ChartInterpretationMode,
  ChartRenderResult,
  ChartSettings,
  ClientBirthPlaceCandidate,
  DictionaryEntriesResponse,
  StoredChartAstrocartographyCalculationPayload,
  StoredChartCalculationPayload,
  StoredChartHoraryCalculationPayload,
  StoredChartNatalCalculationPayload,
  StoredChartProgressionCalculationPayload,
  StoredChartSolarReturnCalculationPayload,
  StoredChartSynastryCalculationPayload
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import type { ChartEngineMode } from "../model/chartEngineMode";
import { ChartEnginePage, type ChartEnginePageProps } from "./ChartEnginePage";

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
    revision: 1,
    lastEditedByUserId: "22222222-2222-4222-8222-222222222222",
    lastEditedByRole: "client",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z"
  }
} satisfies ClientSelectOption;
const calculationId = "44444444-4444-4444-8444-444444444444";
const checksum = `sha256:${"a".repeat(64)}`;

const partnerClient = {
  ...client,
  value: "55555555-5555-4555-8555-555555555555",
  label: "Алексей Петров",
  initials: "АП",
  subtitle: "11.08.1992 · Москва",
  birthDateDisplay: "11.08.1992",
  birthData: {
    ...client.birthData,
    id: "66666666-6666-4666-8666-666666666666",
    clientUserId: "55555555-5555-4555-8555-555555555555",
    birthDate: "1992-08-11",
    birthTime: "08:15",
    birthPlaceText: "Москва, Россия",
    birthCountryCode: "RU",
    birthCity: "Москва",
    birthTimezone: "Europe/Moscow",
    birthLatitude: 55.7558,
    birthLongitude: 37.6173
  }
} satisfies ClientSelectOption;

describe("ChartEnginePage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps future modes honest and starts a CRM-backed natal calculation", async () => {
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

    expect(screen.getByRole("button", { name: /транзиты/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /прогрессии/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /синастрия/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /остальные типы карт/i }));
    expect(screen.getByRole("menuitem", { name: /прогрессии/i })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /синастрия/i })).toBeEnabled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: /прогрессии/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/вводить дату рождения вручную не нужно/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Клиент" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /рассчитать/i }));

    expect(onCreateNatalJob).toHaveBeenCalledOnce();
  });

  it("operates the overflow mode menu with roving keyboard focus and returns focus on Escape", async () => {
    const user = userEvent.setup();
    renderChartEnginePage({ locale: "en" });

    const trigger = screen.getByRole("button", { name: /open other chart types/i });
    await user.click(trigger);

    const progression = screen.getByRole("menuitem", { name: "Progressions" });
    const synastry = screen.getByRole("menuitem", { name: "Synastry" });
    const astrocartography = screen.getByRole("menuitem", { name: "Astrocartography" });
    progression.focus();
    await user.keyboard("{ArrowDown}");
    expect(synastry).toHaveFocus();
    await user.keyboard("{End}");
    expect(astrocartography).toHaveFocus();
    await user.keyboard("{Home}");
    expect(progression).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(astrocartography).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menuitem", { name: "Progressions" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders an English-owned empty state without Cyrillic text or accessible attributes", () => {
    const { container } = renderChartEnginePage({ locale: "en", selectedClient: null });

    expect(screen.getByRole("heading", { name: "Chart Engine" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Choose a client" })).toBeInTheDocument();
    expect(collectRenderedStrings(container).join(" ")).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("renders child chart mode as natal-backed and calls natal calculation", async () => {
    const user = userEvent.setup();
    const onCreateNatalJob = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={partnerClient}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={onCreateNatalJob}
      />
    );

    await user.click(screen.getByRole("button", { name: "Детская" }));

    expect(screen.getByText("Детская карта")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Рассчитать детскую/i }));

    expect(onCreateNatalJob).toHaveBeenCalledOnce();
  });

  it("does not render a separate ready-status card before natal calculation", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.queryByText("Готово к расчёту натала")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Выберите клиента с полной датой, временем, часовым поясом и координатами рождения."
      )
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /рассчитать/i })).toBeEnabled();
  });

  it("allows linking a freshly calculated CRM chart before a client link exists", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        calculationId={calculationId}
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        isCalculationLinked={false}
        linkDisabled={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onLink={onLink}
      />
    );

    await user.click(screen.getByRole("button", { name: "Привязать" }));

    expect(onLink).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "✓ Привязана" })).not.toBeInTheDocument();
  });

  it("shows only a centered empty state when no client is selected", () => {
    renderChartEnginePage({ selectedClient: null });

    const emptyState = screen.getByRole("status", { name: "Выберите клиента" });
    expect(within(emptyState).getByText("Выберите клиента")).toBeInTheDocument();
    expect(
      within(emptyState).getByText(/карта появится после выбора клиента/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Сводка карты" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Данные карты" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Натальная карта")).not.toBeInTheDocument();
    expect(screen.queryByText(/вводить дату рождения вручную не нужно/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Большая тройка")).not.toBeInTheDocument();
  });

  it("switches to transit mode and submits the transit calculation", async () => {
    const user = userEvent.setup();
    const onCreateTransitJob = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="natal"
        transitMoment={{ date: "2026-07-22", time: "14:30" }}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateTransitJob={onCreateTransitJob}
      />
    );

    await user.click(screen.getByRole("button", { name: /транзиты/i }));

    expect(screen.getByRole("button", { name: /рассчитать транзиты/i })).toBeEnabled();
    expect(screen.getByLabelText("Дата транзита")).toHaveValue("2026-07-22");
    expect(screen.getByLabelText("Время транзита")).toHaveValue("14:30");
    await user.click(screen.getByRole("button", { name: /рассчитать транзиты/i }));

    expect(onCreateTransitJob).toHaveBeenCalledOnce();
  });

  it("selects and clears a repeated-hour occurrence for transit civil-time changes", async () => {
    const user = userEvent.setup();
    const onTransitMomentChange = vi.fn();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        locale="ru"
        mode="transit"
        transitMoment={{
          date: "2026-10-25",
          time: "02:30",
          dstOccurrence: "second"
        }}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateTransitJob={vi.fn()}
        onTransitMomentChange={onTransitMomentChange}
      />
    );

    expect(screen.getByLabelText("Повторный час")).toHaveValue("second");
    expect(
      screen.getByText("Выберите вариант только если местное время повторялось при переводе часов.")
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Повторный час"), "first");
    expect(onTransitMomentChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dstOccurrence: "first" })
    );

    fireEvent.change(screen.getByLabelText("Дата транзита"), {
      target: { value: "2026-10-26" }
    });
    expect(onTransitMomentChange).toHaveBeenLastCalledWith({
      date: "2026-10-26",
      time: "02:30"
    });
  });

  it("switches to synastry mode and submits the partner calculation", async () => {
    const user = userEvent.setup();
    const onCreateSynastryJob = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={client}
        selectedPartnerClient={partnerClient}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="natal"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateSynastryJob={onCreateSynastryJob}
      />
    );

    await user.click(screen.getByRole("button", { name: /остальные типы карт/i }));
    await user.click(screen.getByRole("menuitem", { name: /синастрия/i }));

    expect(screen.getByText(/Партнёр · 11\.08\.1992/)).toBeInTheDocument();
    expect(screen.getByText("Алексей Петров")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /рассчитать синастрию/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /рассчитать синастрию/i }));

    expect(onCreateSynastryJob).toHaveBeenCalledOnce();
  });

  it("blocks synastry calculation until a different partner client is selected", async () => {
    const user = userEvent.setup();
    const onCreateSynastryJob = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={client}
        selectedPartnerClient={null}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="synastry"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateSynastryJob={onCreateSynastryJob}
      />
    );

    expect(screen.getAllByText("Выберите партнёра").length).toBeGreaterThan(0);
    const actionButton = screen.getAllByRole("button", { name: /выберите партнёра/i }).at(-1);
    expect(actionButton).toBeDefined();
    expect(actionButton).toBeDisabled();
    await user.click(actionButton!);

    expect(onCreateSynastryJob).not.toHaveBeenCalled();
  });

  it("renders transit points and aspects as a dual-wheel result", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={transitResult()}
        errorMessage={null}
        isBusy={false}
        mode="transit"
        transitMoment={{ date: "2026-07-22", time: "14:30" }}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByTestId("chart-transit-point-mars")).toBeInTheDocument();
    expect(screen.getByTestId("chart-transit-aspect-opposition")).toBeInTheDocument();
    expect(screen.queryByText(/Транзитная карта рассчитана/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Аспекты" }));

    expect(screen.getByText("Транзитные аспекты к наталу")).toBeInTheDocument();
    expect(screen.getByText(/Марс — Солнце/i)).toBeInTheDocument();
  });

  it("renders solar return points and aspects as a dual-wheel result", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={solarReturnResult()}
        errorMessage={null}
        isBusy={false}
        mode="solar_return"
        solarReturnYear={2026}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByTestId("chart-solar-return-point-mars")).toBeInTheDocument();
    expect(screen.getByTestId("chart-solar-return-aspect-opposition")).toBeInTheDocument();
    expect(screen.queryByText("Соляр рассчитан")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Аспекты" }));

    expect(screen.getByText("Солярные аспекты к наталу")).toBeInTheDocument();
    expect(screen.getByText(/Марс — Солнце/i)).toBeInTheDocument();
  });

  it("switches to progression mode and renders progressed points and aspects", async () => {
    const user = userEvent.setup();
    const onCreateProgressionJob = vi.fn(async () => undefined);
    const onProgressionTargetDateChange = vi.fn();
    const { rerender } = render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="natal"
        progressionTargetDate="2026-07-23"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateProgressionJob={onCreateProgressionJob}
        onProgressionTargetDateChange={onProgressionTargetDateChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /остальные типы карт/i }));
    await user.click(screen.getByRole("menuitem", { name: /прогрессии/i }));

    expect(screen.getByRole("button", { name: /рассчитать прогрессии/i })).toBeEnabled();
    expect(screen.getByLabelText("Дата прогрессии")).toHaveValue("2026-07-23");
    fireEvent.change(screen.getByLabelText("Дата прогрессии"), {
      target: { value: "2026-07-24" }
    });

    expect(onProgressionTargetDateChange).toHaveBeenLastCalledWith("2026-07-24");
    await user.click(screen.getByRole("button", { name: /рассчитать прогрессии/i }));

    expect(onCreateProgressionJob).toHaveBeenCalledOnce();

    rerender(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={progressionResult()}
        errorMessage={null}
        isBusy={false}
        mode="progression"
        progressionTargetDate="2026-07-23"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByTestId("chart-progression-point-mars")).toBeInTheDocument();
    expect(screen.getByTestId("chart-progression-aspect-opposition")).toBeInTheDocument();
    expect(screen.queryByText("Прогрессии рассчитаны")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Аспекты" }));

    expect(screen.getByText("Прогрессивные аспекты к наталу")).toBeInTheDocument();
    expect(screen.getByText(/Марс — Солнце/i)).toBeInTheDocument();
  });

  it("switches to horary mode and submits a question snapshot without requiring birth data", async () => {
    const user = userEvent.setup();
    const onCreateHoraryJob = vi.fn(async () => undefined);
    const onHoraryQuestionChange = vi.fn();
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
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="natal"
        horaryQuestion={{
          question: "",
          category: "other",
          date: "2026-07-23",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: "",
          longitude: ""
        }}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateHoraryJob={onCreateHoraryJob}
        onHoraryQuestionChange={onHoraryQuestionChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /остальные типы карт/i }));
    await user.click(screen.getByRole("menuitem", { name: "Хорар" }));

    expect(screen.getByRole("region", { name: "Подготовка хорара" })).toBeInTheDocument();
    expect(screen.getByLabelText("Вопрос хорара")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Дата: 23.07.2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Время: 14:30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Заполните хорар" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Вопрос хорара"), {
      target: { value: "Стоит ли принимать предложение?" }
    });
    fireEvent.change(screen.getByLabelText("Широта вопроса"), {
      target: { value: "55.7558" }
    });
    fireEvent.change(screen.getByLabelText("Долгота вопроса"), {
      target: { value: "37.6173" }
    });

    expect(onHoraryQuestionChange).toHaveBeenLastCalledWith({
      question: "Стоит ли принимать предложение?",
      category: "other",
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: "55.7558",
      longitude: "37.6173"
    });

    await user.click(screen.getByRole("button", { name: "Рассчитать хорар" }));

    expect(onCreateHoraryJob).toHaveBeenCalledOnce();
  });

  it("keeps incomplete horary input in a dedicated setup panel before rendering results", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="horary"
        horaryQuestion={{
          question: "",
          category: "other",
          date: "2026-07-23",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: "",
          longitude: ""
        }}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateHoraryJob={vi.fn()}
      />
    );

    const setupPanel = screen.getByRole("complementary", { name: "Параметры хорара" });

    expect(within(setupPanel).getByLabelText("Вопрос хорара")).toHaveProperty(
      "tagName",
      "TEXTAREA"
    );
    expect(within(setupPanel).getByText("Уточнить координаты вручную")).toBeInTheDocument();
    expect(setupPanel.querySelector("details")?.open).toBe(false);
    expect(within(setupPanel).getByRole("button", { name: "Заполните хорар" })).toBeDisabled();
    expect(within(setupPanel).getByRole("button", { name: "Экспорт карты" })).toBeDisabled();
    expect(within(setupPanel).getByRole("button", { name: "Привязать" })).toBeDisabled();
    expect(within(setupPanel).getByRole("button", { name: "PDF" })).toBeDisabled();
    expect(within(setupPanel).getByRole("button", { name: "Настройки" })).toBeEnabled();
    const preparation = screen.getByRole("region", { name: "Подготовка хорара" });

    expect(preparation).toHaveTextContent("Предпросмотр карты");
    expect(preparation).toHaveTextContent("Карта появится здесь");
    expect(preparation).toHaveTextContent("Заполните три группы слева");
    expect(preparation).toHaveTextContent("Вопрос");
    expect(preparation).toHaveTextContent("Момент");
    expect(preparation).toHaveTextContent("Место");
    expect(
      within(setupPanel).getByText("Заполните вопрос и место, чтобы начать расчёт")
    ).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Сводка карты" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Данные карты" })).not.toBeInTheDocument();
  });

  it("opens calculation settings from the horary setup footer", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="horary"
        horaryQuestion={{
          question: "",
          category: "other",
          date: "2026-07-23",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: "",
          longitude: ""
        }}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateHoraryJob={vi.fn()}
      />
    );

    const setupPanel = screen.getByRole("complementary", { name: "Параметры хорара" });

    expect(screen.queryByRole("region", { name: "Настройки расчёта" })).not.toBeInTheDocument();

    await user.click(within(setupPanel).getByRole("button", { name: "Настройки" }));

    expect(screen.getByRole("region", { name: "Настройки расчёта" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Закрыть настройки расчёта" }));

    expect(screen.queryByRole("region", { name: "Настройки расчёта" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Подготовка хорара" })).toBeInTheDocument();
  });

  it("renders English repeated-hour copy and clears the horary occurrence on timezone change", () => {
    const onHoraryQuestionChange = vi.fn();
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        locale="en"
        mode="horary"
        horaryQuestion={{
          question: "Should I accept the offer?",
          category: "career",
          date: "2026-10-25",
          time: "02:30",
          timezone: "Europe/Rome",
          latitude: 41.9028,
          longitude: 12.4964,
          dstOccurrence: "first"
        }}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateHoraryJob={vi.fn()}
        onHoraryQuestionChange={onHoraryQuestionChange}
      />
    );

    expect(screen.getByLabelText("Repeated hour")).toHaveValue("first");
    expect(
      screen.getByText("Choose only when the local clock time occurred twice during a DST change.")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Question timezone"), {
      target: { value: "Europe/Paris" }
    });
    expect(onHoraryQuestionChange).toHaveBeenLastCalledWith({
      question: "Should I accept the offer?",
      category: "career",
      date: "2026-10-25",
      time: "02:30",
      timezone: "Europe/Paris",
      latitude: 41.9028,
      longitude: 12.4964
    });
  });

  it("selects a horary place from production autocomplete and keeps the opaque provider reference", async () => {
    const user = userEvent.setup();
    const candidate = {
      id: "geoapify:autocomplete-request-42",
      label: "Rome, Lazio, Italy",
      placeName: "Rome, Italy",
      countryCode: "IT",
      city: "Rome",
      region: "Lazio",
      timezone: "Europe/Rome",
      latitude: 41.8933,
      longitude: 12.4829,
      provider: "geoapify" as const,
      providerPlaceId: "autocomplete-request-42"
    } satisfies ClientBirthPlaceCandidate;
    const onSearchBirthPlaces = vi.fn(async () => [candidate]);
    const onSelectHoraryPlace = vi.fn();

    render(
      <ChartEnginePage
        selectedClient={client}
        mode="horary"
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        horaryQuestion={{
          question: "Should I accept the offer?",
          category: "career",
          date: "2026-08-03",
          time: "14:30",
          timezone: "",
          latitude: "",
          longitude: ""
        }}
        onCreateNatalJob={vi.fn()}
        onSearchBirthPlaces={onSearchBirthPlaces}
        onSelectHoraryPlace={onSelectHoraryPlace}
        onSettingsChange={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("Место вопроса"), "Rome Italy");
    await waitFor(() => expect(onSearchBirthPlaces).toHaveBeenCalledWith("Rome Italy"));
    await user.click(await screen.findByRole("option", { name: "Rome, Lazio, Italy" }));

    expect(onSelectHoraryPlace).toHaveBeenCalledWith(candidate);
    expect(screen.getByLabelText("Место вопроса")).toHaveValue("Rome, Italy");
  });

  it("renders horary single-wheel result and keeps PDF available", () => {
    render(
      <ChartEnginePage
        selectedClient={partnerClient}
        jobState="succeeded"
        result={horaryResult()}
        errorMessage={null}
        isBusy={false}
        mode="horary"
        horaryQuestion={horaryResult().questionSnapshot}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        pdfDisabled={false}
      />
    );

    expect(screen.queryByText("Хорар рассчитан")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-point-sun")).toBeInTheDocument();
    expect(screen.queryByLabelText("Вопрос хорара")).not.toBeInTheDocument();
    const context = screen.getByRole("region", { name: "Контекст вопроса" });
    expect(context).toHaveTextContent("Стоит ли принимать предложение?");
    expect(context).toHaveTextContent("Работа");
    expect(context).toHaveTextContent("23.07.2026 · 14:30");
    expect(context).toHaveTextContent("Europe/Moscow");
    expect(context).toHaveTextContent("Москва, Россия");
    expect(context).toHaveTextContent("55.7558 / 37.6173");
    expect(
      within(context).getByRole("button", { name: "Изменить данные хорара" })
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
  });

  it("switches to astrocartography mode and submits the map calculation", async () => {
    const user = userEvent.setup();
    const onCreateAstrocartographyJob = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="natal"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onCreateAstrocartographyJob={onCreateAstrocartographyJob}
      />
    );

    await user.click(screen.getByRole("button", { name: /остальные типы карт/i }));
    await user.click(screen.getByRole("menuitem", { name: "Астрокарта" }));

    expect(screen.getByText("Астрокартография")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Рассчитать линии" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Рассчитать линии" }));

    expect(onCreateAstrocartographyJob).toHaveBeenCalledOnce();
  });

  it("renders astrocartography empty state without the natal wheel tables", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        mode="astrocartography"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByRole("img", { name: "Астрокартографическая карта" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Круг карты" })).not.toBeInTheDocument();
    expect(screen.getByText("Появится после расчёта линий.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Трактовки" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Планеты" })).not.toBeInTheDocument();
    expect(screen.getByText("После расчёта здесь появятся трактовки.")).toBeInTheDocument();
  });

  it("renders astrocartography map result and keeps PDF available", () => {
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={astrocartographyResult()}
        errorMessage={null}
        isBusy={false}
        mode="astrocartography"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        pdfDisabled={false}
      />
    );

    expect(screen.queryByText("Астрокарта рассчитана")).not.toBeInTheDocument();
    expect(screen.getByTestId("astrocartography-map")).toBeInTheDocument();
    expect(screen.getByTestId("astrocartography-line-sun_mc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
  });

  it("loads horary-specific dictionary anchors without natal fallback", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
      entries: [],
      total: 0,
      counts: { sources: { all: 0, platform: 0, modified: 0, custom: 0 } }
    } satisfies DictionaryEntriesResponse);

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={horaryResult()}
        errorMessage={null}
        isBusy={false}
        mode="horary"
        horaryQuestion={horaryResult().questionSnapshot}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Трактовки" }));

    const interpretationsPanel = screen.getByRole("region", { name: "Трактовки" });
    expect(within(interpretationsPanel).getByText("Хорар · библиотека")).toBeInTheDocument();
    expect(
      await within(interpretationsPanel).findAllByText("Для этого элемента еще нет трактовки")
    ).not.toHaveLength(0);
    expect(
      within(interpretationsPanel).getByRole("button", {
        name: "Добавить трактовку для Солнце в Раке"
      })
    ).toBeInTheDocument();
    expect(within(interpretationsPanel).queryByText(/AI-трактовка/u)).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/dictionary/entries/by-codes?locale=ru&codes=horary.question.career%2Chorary.sun.cancer%2Chorary.sun.house.10%2Chorary.house.1"
    );
    expect(get.mock.calls[0]?.[0]).not.toContain("sun_cancer");
  });

  it("generates chart AI draft from a dedicated AI tab", async () => {
    const user = userEvent.setup();
    const initialRecord = calculationRecordResponse([]);
    const generatedRecord = calculationRecordResponse([
      {
        id: "66666666-6666-4666-8666-666666666666",
        status: "draft",
        text: "OVERVIEW\nGenerated draft"
      }
    ]);
    const get = vi.spyOn(application.http, "get").mockResolvedValue(initialRecord);
    const post = vi.spyOn(application.http, "post").mockResolvedValue(generatedRecord);

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        calculationId={calculationId}
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(await screen.findByRole("heading", { name: "Черновик трактовки" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сгенерировать" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Сгенерировать" }));

    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      {
        csrf: true,
        headers: {
          "idempotency-key": expect.stringMatching(/^charts:ai-draft:[0-9a-f-]{36}$/u)
        }
      }
    );
    expect(get).toHaveBeenCalledWith(`/calculations/${calculationId}`);
    await waitFor(() =>
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain(
        "Generated draft"
      )
    );
    const firstKey = post.mock.calls[0]?.[2]?.headers?.["idempotency-key"];
    await user.click(screen.getByRole("button", { name: "Сгенерировать заново" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const secondKey = post.mock.calls[1]?.[2]?.headers?.["idempotency-key"];
    expect(firstKey).toMatch(/^charts:ai-draft:[0-9a-f-]{36}$/u);
    expect(secondKey).toMatch(/^charts:ai-draft:[0-9a-f-]{36}$/u);
    expect(secondKey).not.toBe(firstKey);
  });

  it.each([
    ["transport failure", new Error("network interrupted")],
    [
      "unknown provider outcome",
      new HttpError(503, {
        code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN",
        message: "Chart AI draft provider outcome requires reconciliation"
      })
    ]
  ])("reuses one AI idempotency key after %s", async (_label, firstFailure) => {
    const user = userEvent.setup();
    const generatedRecord = calculationRecordResponse([
      {
        id: "66666666-6666-4666-8666-666666666666",
        status: "draft",
        text: "OVERVIEW\nRecovered draft"
      }
    ]);
    vi.spyOn(application.http, "get").mockResolvedValue(calculationRecordResponse([]));
    const post = vi
      .spyOn(application.http, "post")
      .mockRejectedValueOnce(firstFailure)
      .mockResolvedValueOnce(generatedRecord);

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        calculationId={calculationId}
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "AI" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сгенерировать" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Сгенерировать" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    const firstKey = post.mock.calls[0]?.[2]?.headers?.["idempotency-key"];

    await user.click(screen.getByRole("button", { name: "Сгенерировать" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const secondKey = post.mock.calls[1]?.[2]?.headers?.["idempotency-key"];

    expect(firstKey).toMatch(/^charts:ai-draft:[0-9a-f-]{36}$/u);
    expect(secondKey).toBe(firstKey);
  });

  it("starts a new AI command after a known terminal preflight failure", async () => {
    const user = userEvent.setup();
    const generatedRecord = calculationRecordResponse([
      {
        id: "66666666-6666-4666-8666-666666666666",
        status: "draft",
        text: "OVERVIEW\nRecovered after preflight recovery"
      }
    ]);
    vi.spyOn(application.http, "get").mockResolvedValue(calculationRecordResponse([]));
    const post = vi
      .spyOn(application.http, "post")
      .mockRejectedValueOnce(
        new HttpError(503, {
          code: "CHART_AI_DRAFT_PREFLIGHT_UNAVAILABLE",
          message: "Chart AI preflight is temporarily unavailable"
        })
      )
      .mockResolvedValueOnce(generatedRecord);

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        calculationId={calculationId}
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "AI" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сгенерировать" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Сгенерировать" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Сгенерировать" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    const firstKey = post.mock.calls[0]?.[2]?.headers?.["idempotency-key"];
    const secondKey = post.mock.calls[1]?.[2]?.headers?.["idempotency-key"];
    expect(firstKey).toMatch(/^charts:ai-draft:[0-9a-f-]{36}$/u);
    expect(secondKey).toMatch(/^charts:ai-draft:[0-9a-f-]{36}$/u);
    expect(secondKey).not.toBe(firstKey);
  });

  it("keeps chart AI generation disabled when the calculation record cannot be loaded", async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(application.http, "get")
      .mockRejectedValue(new Error("Calculation fetch failed"));
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValue(calculationRecordResponse([]));

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        calculationId={calculationId}
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить расчёт карты. Обновите страницу и повторите"
    );
    expect(screen.getByRole("button", { name: "Сгенерировать" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Сгенерировать" }));

    expect(get).toHaveBeenCalledWith(`/calculations/${calculationId}`);
    expect(post).not.toHaveBeenCalled();
  });

  it("shows chart AI generation failures next to controls", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(application.http, "get").mockResolvedValue(calculationRecordResponse([]));
    const post = vi.spyOn(application.http, "post").mockRejectedValue(new HttpError(503, null));

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        calculationId={calculationId}
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "AI" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сгенерировать" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Сгенерировать" }));

    const alert = await screen.findByRole("alert");
    const textbox = screen.getByRole("textbox");

    expect(alert).toHaveTextContent("AI временно недоступен. Повторите позже");
    expect(Boolean(alert.compareDocumentPosition(textbox) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true
    );
    expect(post).toHaveBeenCalledWith(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      {
        csrf: true,
        headers: {
          "idempotency-key": expect.stringMatching(/^charts:ai-draft:[0-9a-f-]{36}$/u)
        }
      }
    );
    expect(get).toHaveBeenCalledWith(`/calculations/${calculationId}`);
  });

  it("loads astrocartography-specific dictionary anchors without natal fallback", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
      entries: [],
      total: 0,
      counts: { sources: { all: 0, platform: 0, modified: 0, custom: 0 } }
    } satisfies DictionaryEntriesResponse);

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        result={astrocartographyResult()}
        errorMessage={null}
        isBusy={false}
        mode="astrocartography"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(
      screen
        .getAllByRole("button")
        .filter((button) => ["Трактовки", "AI"].includes(button.textContent ?? ""))
        .map((button) => button.textContent)
    ).toEqual(["Трактовки", "AI"]);

    await user.click(screen.getByRole("button", { name: "Трактовки" }));

    const interpretationsPanel = screen.getByRole("region", { name: "Трактовки" });
    expect(
      within(interpretationsPanel).getByText("Астрокартография · библиотека")
    ).toBeInTheDocument();
    expect(
      await within(interpretationsPanel).findAllByText("Для этого элемента еще нет трактовки")
    ).not.toHaveLength(0);
    expect(
      within(interpretationsPanel).getByRole("button", {
        name: "Добавить трактовку для Солнце MC"
      })
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/dictionary/entries/by-codes?locale=ru&codes=astrocartography.sun.mc%2Castrocartography.moon.asc"
    );
    expect(get.mock.calls[0]?.[0]).not.toContain("sun_cancer");
  });

  it("renders synastry partner points and aspects as a dual-wheel result", async () => {
    const user = userEvent.setup();
    render(
      <ChartEnginePage
        selectedClient={client}
        selectedPartnerClient={partnerClient}
        jobState="succeeded"
        result={synastryResult()}
        errorMessage={null}
        isBusy={false}
        mode="synastry"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    expect(screen.getByTestId("chart-partner-point-mars")).toBeInTheDocument();
    expect(screen.getByTestId("chart-synastry-aspect-opposition")).toBeInTheDocument();
    expect(screen.queryByText(/Синастрия рассчитана/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Аспекты" }));

    expect(screen.getByText("Аспекты между картами")).toBeInTheDocument();
    expect(screen.getByText(/Солнце — Марс/i)).toBeInTheDocument();
  });

  it.each([
    {
      name: "no selected client",
      props: {
        selectedClient: null,
        jobState: "idle" as const,
        result: null,
        isBusy: false
      },
      status: "Выберите клиента",
      detail: "Карта рассчитывается только для клиента из CRM.",
      action: "Выберите клиента",
      enabled: false
    },
    {
      name: "missing birth date",
      props: {
        selectedClient: {
          ...client,
          birthDateDisplay: "—",
          hasBirthDate: false,
          birthData: {
            ...client.birthData,
            birthDate: null
          }
        },
        jobState: "idle" as const,
        result: null,
        isBusy: false
      },
      status: "Нужна дата рождения",
      detail: "Заполните дату рождения в карточке клиента.",
      action: "Добавьте дату",
      enabled: false
    },
    {
      name: "missing birth time",
      props: {
        selectedClient: {
          ...client,
          birthData: {
            ...client.birthData,
            birthTime: null,
            birthTimePrecision: "unknown" as const
          }
        },
        jobState: "idle" as const,
        result: null,
        isBusy: false
      },
      status: "Нужно время рождения",
      detail: "Без времени рождения не строим дома и углы.",
      action: "Добавьте время",
      enabled: false
    },
    {
      name: "approximate birth time",
      props: {
        selectedClient: {
          ...client,
          birthData: {
            ...client.birthData,
            birthTimePrecision: "approximate" as const
          }
        },
        jobState: "idle" as const,
        result: null,
        isBusy: false
      },
      status: "Время примерно",
      detail: "Расчёт доступен, но карта получит предупреждение о точности времени.",
      action: "Рассчитать с пометкой",
      enabled: true
    },
    {
      name: "calculating",
      props: {
        selectedClient: client,
        jobState: "calculating" as const,
        result: chartResult(),
        isBusy: true
      },
      status: "Расчёт выполняется",
      detail: "Ждём результат от расчётного контура.",
      action: "Рассчитываем",
      enabled: false
    },
    {
      name: "failed",
      props: {
        selectedClient: client,
        jobState: "failed" as const,
        result: null,
        isBusy: false,
        errorMessage: "Provider timeout"
      },
      status: "Ошибка расчёта",
      detail: "Provider timeout",
      action: "Повторить расчёт",
      enabled: true
    },
    {
      name: "stale result",
      props: {
        selectedClient: client,
        jobState: "succeeded" as const,
        result: chartResult(),
        isBusy: false,
        isResultStale: true
      },
      status: "Требуется пересчёт",
      detail: "Данные рождения или настройки изменились.",
      action: "Пересчитать карту",
      enabled: true
    },
    {
      name: "current calculated result",
      props: {
        selectedClient: client,
        jobState: "succeeded" as const,
        result: chartResult(),
        isBusy: false
      },
      status: "Актуальная карта",
      detail: "Натальная карта рассчитана и привязана к клиенту.",
      action: "Рассчитано",
      enabled: false
    }
  ])("renders explicit chart state matrix for $name", ({ action, enabled, props }) => {
    renderChartEnginePage(props);

    expect(screen.queryByLabelText("Состояние карты")).not.toBeInTheDocument();
    const actionButton = screen.getByRole("button", { name: action });
    if (enabled) {
      expect(actionButton).toBeEnabled();
    } else {
      expect(actionButton).toBeDisabled();
    }
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

  it("omits chart warning blocks while keeping distribution summaries", () => {
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

    expect(screen.queryByRole("heading", { name: "Предупреждения" })).not.toBeInTheDocument();
    expect(screen.queryByText(/время рождения указано примерно/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Chart calculated with approximate birth time.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /стихии/i })).toBeInTheDocument();
    expect(screen.getByText(/огонь/i)).toBeInTheDocument();
    expect(screen.getByText(/кардинальный/i)).toBeInTheDocument();
    expect(screen.getByText(/мужская/i)).toBeInTheDocument();
  });

  it("exposes the current-result PDF action without changing the toolbar command", async () => {
    const user = userEvent.setup();
    const onPdf = vi.fn();

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
        pdfLabel="PDF"
        pdfDisabled={false}
        pdfTitle="Сформировать PDF"
        onPdf={onPdf}
      />
    );

    const pdfButton = screen.getByRole("button", { name: "PDF" });
    expect(pdfButton).toBeEnabled();
    expect(pdfButton).toHaveAttribute("title", "Сформировать PDF");
    await user.click(pdfButton);

    expect(onPdf).toHaveBeenCalledOnce();
  });

  it("opens and closes the calculated chart presentation from the toolbar", async () => {
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

    const presentationButton = screen.getByRole("button", { name: "Экспорт карты" });
    expect(presentationButton).toBeEnabled();

    await user.click(presentationButton);

    const presentation = screen.getByRole("dialog", {
      name: "Натальная карта · Марина Краснова"
    });
    expect(within(presentation).getByText("Esc · Выйти")).toBeInTheDocument();
    expect(within(presentation).getByText("15.07.1990 · 10:30 · Рим, Италия")).toBeInTheDocument();
    expect(within(presentation).getByText("Большая тройка")).toBeInTheDocument();

    fireEvent.keyDown(presentation, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Натальная карта · Марина Краснова" })
    ).not.toBeInTheDocument();
  });

  it("opens the child chart presentation from a natal-backed child result", async () => {
    const user = userEvent.setup();

    render(
      <ChartEnginePage
        selectedClient={client}
        mode="child_chart"
        interpretationMode="child"
        jobState="succeeded"
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Экспорт карты" }));

    const presentation = screen.getByRole("dialog", {
      name: "Детская карта · Марина Краснова"
    });
    expect(within(presentation).getByText("Большая тройка")).toBeInTheDocument();
    expect(within(presentation).getByRole("img", { name: "Круг карты" })).toBeInTheDocument();
  });

  it("opens the astrocartography presentation with map-specific content", async () => {
    const user = userEvent.setup();

    render(
      <ChartEnginePage
        selectedClient={client}
        mode="astrocartography"
        jobState="succeeded"
        result={astrocartographyResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Экспорт карты" }));

    const presentation = screen.getByRole("dialog", {
      name: "Астрокартография · Марина Краснова"
    });
    expect(within(presentation).getByText("Сводка линий")).toBeInTheDocument();
    expect(within(presentation).getByTestId("astrocartography-map")).toBeInTheDocument();
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
            {
              pointA: "moon",
              pointB: "pluto",
              type: "trine",
              angle: 120,
              orb: 2.1,
              applying: true
            },
            {
              pointA: "moon",
              pointB: "venus",
              type: "sextile",
              angle: 60,
              orb: 0.9,
              applying: false
            },
            {
              pointA: "pluto",
              pointB: "venus",
              type: "sextile",
              angle: 60,
              orb: 1.1,
              applying: false
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
    const get = vi.spyOn(application.http, "get").mockResolvedValue(dictionaryEntriesResponse());
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
            },
            {
              id: "pluto",
              label: "Pluto",
              longitude: 225,
              sign: "scorpio",
              signDegree: 15,
              house: 7,
              retrograde: true
            }
          ],
          houses: [
            { number: 1, longitude: 166.61, sign: "virgo", signDegree: 16.61 },
            { number: 7, longitude: 346.61, sign: "pisces", signDegree: 16.61 }
          ],
          aspects: [
            { pointA: "moon", pointB: "sun", type: "square", angle: 90, orb: 1.4, applying: true },
            { pointA: "moon", pointB: "pluto", type: "trine", angle: 120, orb: 2.1, applying: true }
          ]
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
      within(interpretationsPanel).getByText("Опорные положения · библиотека")
    ).toBeInTheDocument();
    expect(await within(interpretationsPanel).findByText(/Солнце · XI дом/i)).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Аспекты")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Дома")).toBeInTheDocument();
    expect(within(interpretationsPanel).queryByText(/platform/i)).not.toBeInTheDocument();
    expect(within(interpretationsPanel).getAllByText("Справочник").length).toBeGreaterThanOrEqual(
      5
    );
    expect(
      within(interpretationsPanel).getByText(/Справочная трактовка Солнца в Раке/i)
    ).toBeInTheDocument();
    expect(within(interpretationsPanel).getAllByText(/Рак 22°36'/).length).toBeGreaterThan(0);
    expect(within(interpretationsPanel).getByText("Луна в Овне")).toBeInTheDocument();
    expect(
      within(interpretationsPanel).getByText(/Справочная трактовка Луны в Овне/i)
    ).toBeInTheDocument();
    expect(within(interpretationsPanel).getAllByText(/Овен 21°13'/).length).toBeGreaterThan(0);
    expect(within(interpretationsPanel).getByText("Плутон · VII дом")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Плутон в VII доме/i)).toBeInTheDocument();
    expect(
      within(interpretationsPanel).getAllByText("Для этого элемента еще нет трактовки")
    ).not.toHaveLength(0);
    expect(
      within(interpretationsPanel).getByRole("button", {
        name: "Добавить трактовку для Солнце · XI дом"
      })
    ).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("I дом")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Дева 16°37'/)).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Квадрат")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Квадрат как аспект/i)).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Солнце — Луна")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Связь Солнца и Луны/i)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/dictionary/entries/by-codes?locale=ru&codes=sun_cancer%2Csun_house_11%2Cmoon_aries%2Cmoon_house_8%2Cpluto_scorpio%2Cpluto_house_7%2Chouse_1%2Chouse_7%2Csquare%2Ctrine%2Csun_moon%2Cmoon_pluto"
    );
    expect(within(interpretationsPanel).queryByText(/AI-черновик/u)).not.toBeInTheDocument();
    expect(
      within(interpretationsPanel).queryByText(/интерпретационный контур не подключён/i)
    ).not.toBeInTheDocument();
  });

  it("creates a missing interpretation in the chart panel and refreshes its card", async () => {
    const user = userEvent.setup();
    const categoryId = "8e14390f-3db1-4d1c-9344-55679c778427";
    const get = vi.spyOn(application.http, "get").mockImplementation(async (url) => {
      if (url === "/dictionary/categories?locale=ru") {
        return {
          categories: [
            {
              id: categoryId,
              code: "planets_in_houses",
              name: "Планеты в домах",
              order: 20,
              count: 0,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z"
            }
          ],
          total: 0
        };
      }

      if (url.startsWith("/dictionary/entries/by-codes?locale=ru")) {
        const hasCreatedEntry =
          get.mock.calls.filter(([requestUrl]) =>
            String(requestUrl).startsWith("/dictionary/entries/by-codes?locale=ru")
          ).length > 1;

        return {
          entries: hasCreatedEntry
            ? [
                {
                  id: "9e14390f-3db1-4d1c-9344-55679c778427",
                  categoryId,
                  categoryCode: "planets_in_houses",
                  code: "sun_house_11",
                  locale: "ru",
                  source: "custom",
                  title: "Солнце · XI дом",
                  content: "Авторская трактовка Солнца в XI доме.",
                  astrologerEntryId: "9e14390f-3db1-4d1c-9344-55679c778427",
                  createdAt: "2026-08-15T00:00:00.000Z",
                  updatedAt: "2026-08-15T00:00:00.000Z"
                }
              ]
            : [],
          total: hasCreatedEntry ? 1 : 0,
          counts: {
            sources: {
              all: hasCreatedEntry ? 1 : 0,
              platform: 0,
              modified: 0,
              custom: hasCreatedEntry ? 1 : 0
            }
          }
        } satisfies DictionaryEntriesResponse;
      }

      throw new Error(`Unexpected GET ${url}`);
    });
    const post = vi.spyOn(application.http, "post").mockResolvedValue({
      id: "9e14390f-3db1-4d1c-9344-55679c778427",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      categoryId,
      code: "sun_house_11",
      locale: "ru",
      entryType: "custom",
      title: "Солнце · XI дом",
      content: "Авторская трактовка Солнца в XI доме.",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z"
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
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
              }
            ]
          })}
          errorMessage={null}
          isBusy={false}
          settings={settings()}
          onSettingsChange={vi.fn()}
          onCreateNatalJob={vi.fn()}
        />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "Трактовки" }));

    const interpretationsPanel = screen.getByRole("region", { name: "Трактовки" });
    const addButton = await within(interpretationsPanel).findByRole("button", {
      name: "Добавить трактовку для Солнце · XI дом"
    });
    expect(
      within(addButton.parentElement as HTMLElement).getByText(
        "Для этого элемента еще нет трактовки"
      )
    ).toBeInTheDocument();

    await user.click(addButton);

    expect(
      within(interpretationsPanel).getByRole("heading", { name: "Солнце · XI дом" })
    ).toBeInTheDocument();
    expect(within(interpretationsPanel).getByDisplayValue("Солнце · XI дом")).toBeInTheDocument();
    await user.click(within(interpretationsPanel).getByRole("button", { name: "Отмена" }));
    const restoredAddButton = await within(interpretationsPanel).findByRole("button", {
      name: "Добавить трактовку для Солнце · XI дом"
    });
    await waitFor(() => expect(restoredAddButton).toHaveFocus());

    await user.click(restoredAddButton);
    await user.type(
      within(interpretationsPanel).getByLabelText("Текст трактовки"),
      "Авторская трактовка Солнца в XI доме."
    );
    await user.click(within(interpretationsPanel).getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/dictionary/custom-entries",
        {
          categoryId,
          locale: "ru",
          code: "sun_house_11",
          title: "Солнце · XI дом",
          content: "Авторская трактовка Солнца в XI доме."
        },
        { csrf: true }
      )
    );
    expect(
      await within(interpretationsPanel).findByText("Авторская трактовка Солнца в XI доме.")
    ).toBeInTheDocument();
    expect(
      within(interpretationsPanel).queryByRole("button", {
        name: "Добавить трактовку для Солнце · XI дом"
      })
    ).not.toBeInTheDocument();
    expect(
      get.mock.calls.filter(([url]) =>
        String(url).startsWith("/dictionary/entries/by-codes?locale=ru")
      )
    ).toHaveLength(2);
  });

  it("shows child natal result with child dictionary anchors and an AI tab", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
      entries: [],
      total: 0,
      counts: { sources: { all: 0, platform: 0, modified: 0, custom: 0 } }
    } satisfies DictionaryEntriesResponse);
    render(
      <ChartEnginePage
        selectedClient={client}
        mode="child_chart"
        interpretationMode="child"
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
            },
            {
              id: "pluto",
              label: "Pluto",
              longitude: 225,
              sign: "scorpio",
              signDegree: 15,
              house: 7,
              retrograde: true
            }
          ],
          houses: [
            { number: 1, longitude: 166.61, sign: "virgo", signDegree: 16.61 },
            { number: 7, longitude: 346.61, sign: "pisces", signDegree: 16.61 }
          ],
          aspects: [
            { pointA: "moon", pointB: "sun", type: "square", angle: 90, orb: 1.4, applying: true },
            { pointA: "moon", pointB: "pluto", type: "trine", angle: 120, orb: 2.1, applying: true }
          ]
        })}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        pdfDisabled={false}
      />
    );

    expect(screen.queryByText("Детская карта рассчитана")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "AI" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Трактовки" }));

    const interpretationsPanel = screen.getByRole("region", { name: "Трактовки" });
    expect(
      within(interpretationsPanel).getByText("Детские трактовки · библиотека")
    ).toBeInTheDocument();
    expect(
      await within(interpretationsPanel).findAllByText("Детская карта · планета в знаке")
    ).toHaveLength(3);
    expect(
      within(interpretationsPanel).getAllByText("Для этого элемента еще нет трактовки")
    ).not.toHaveLength(0);
    expect(
      within(interpretationsPanel).getByRole("button", {
        name: "Добавить трактовку для Солнце · XI дом"
      })
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/dictionary/entries/by-codes?locale=ru&codes=child.sun.cancer%2Cchild.sun.house.11%2Cchild.moon.aries%2Cchild.moon.house.8%2Cchild.pluto.scorpio%2Cchild.pluto.house.7%2Cchild.house.1%2Cchild.house.7%2Cchild.aspect.sun.square.moon%2Cchild.aspect.moon.trine.pluto"
    );
  });

  it("keeps an active AI surface when the persisted calculation switches to child mode", async () => {
    const user = userEvent.setup();
    const page = ({
      canRequestAi,
      interpretationMode,
      mode
    }: {
      canRequestAi: boolean;
      interpretationMode: ChartInterpretationMode;
      mode: ChartEngineMode;
    }) => (
      <ChartEnginePage
        selectedClient={client}
        calculationId={null}
        canRequestAi={canRequestAi}
        mode={mode}
        interpretationMode={interpretationMode}
        jobState="succeeded"
        result={chartResult()}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
      />
    );
    const { rerender } = render(
      page({ canRequestAi: true, interpretationMode: "adult_natal", mode: "natal" })
    );

    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByRole("heading", { name: "Черновик трактовки" })).toBeInTheDocument();

    rerender(page({ canRequestAi: true, interpretationMode: "child", mode: "child_chart" }));

    expect(screen.getByRole("button", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Черновик трактовки" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI" })).toHaveAttribute("aria-pressed", "true");
  });

  it("derives Dictionary copy from persisted adult authority instead of child URL state", async () => {
    const user = userEvent.setup();
    vi.spyOn(application.http, "get").mockResolvedValue({
      entries: [],
      total: 0,
      counts: { sources: { all: 0, platform: 0, modified: 0, custom: 0 } }
    } satisfies DictionaryEntriesResponse);
    render(
      <ChartEnginePage
        selectedClient={client}
        mode="child_chart"
        interpretationMode="adult_natal"
        jobState="succeeded"
        result={chartResult()}
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
      within(interpretationsPanel).getByText("Опорные положения · библиотека")
    ).toBeInTheDocument();
    expect(
      within(interpretationsPanel).queryByText("Детские трактовки · библиотека")
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
    expect(screen.queryByText(/нужны данные рождения/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /добавьте время/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /солнце на карте/i })).not.toBeInTheDocument();

    expect(screen.queryByRole("complementary", { name: "Данные карты" })).not.toBeInTheDocument();
    expect(screen.queryByText("Солнце")).not.toBeInTheDocument();
    expect(screen.getByText(/появится после расчёта/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /время рождения/i })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/точность времени/i), "approximate");
    expect(screen.getByRole("button", { name: /время рождения/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /время рождения/i }));
    await user.click(screen.getByRole("button", { name: "10:00" }));
    await user.click(screen.getByRole("button", { name: "30 минут" }));
    await user.click(screen.getByRole("button", { name: /сохранить данные рождения/i }));

    expect(onSaveBirthData).toHaveBeenCalledWith(
      expect.objectContaining({
        birthTime: "10:30",
        birthTimePrecision: "approximate"
      })
    );
  });

  it("moves missing birth data editing out of the rail into the workspace", () => {
    render(
      <ChartEnginePage
        selectedClient={{
          ...client,
          birthData: null
        }}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onSaveBirthData={vi.fn()}
      />
    );

    const rail = screen.getByRole("complementary", { name: "Сводка карты" });
    expect(within(rail).getByText(/не хватает:/i)).toBeInTheDocument();
    expect(within(rail).queryByText("Заполните данные рождения")).not.toBeInTheDocument();
    expect(within(rail).queryByLabelText("Дата рождения")).not.toBeInTheDocument();

    const birthDataWorkspace = screen.getByRole("region", {
      name: "Заполнение данных рождения"
    });
    expect(within(birthDataWorkspace).getByText("Заполните данные рождения")).toBeInTheDocument();
    expect(
      within(birthDataWorkspace).getByRole("button", { name: /дата рождения/i })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Натальная карта")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Данные карты" })).not.toBeInTheDocument();
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

    expect(screen.queryByText(/натальная карта рассчитана/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Провайдер:/i)).not.toBeInTheDocument();
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

    expect(screen.getAllByText("Provider timeout").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /повторить расчёт/i }));

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
    expect(screen.getByRole("button", { name: /добавьте дату/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /дата рождения/i }));
    await user.selectOptions(screen.getByLabelText("Год рождения"), "1990");
    await user.selectOptions(screen.getByLabelText("Месяц рождения"), "07");
    await user.click(screen.getByRole("button", { name: "15 июля 1990" }));
    await user.selectOptions(screen.getByLabelText(/точность времени/i), "exact");
    await user.click(screen.getByRole("button", { name: /время рождения/i }));
    await user.click(screen.getByRole("button", { name: "10:00" }));
    await user.click(screen.getByRole("button", { name: "30 минут" }));
    await user.clear(screen.getByLabelText(/место рождения/i));
    await user.type(screen.getByLabelText(/место рождения/i), "Рим, Италия");
    await user.click(screen.getByText(/ввести координаты вручную/i));
    await user.clear(screen.getByLabelText(/часовой пояс/i));
    await user.type(screen.getByLabelText(/часовой пояс/i), "Europe/Rome");
    await user.clear(screen.getByLabelText(/широта/i));
    await user.type(screen.getByLabelText(/широта/i), "41.9028");
    await user.clear(screen.getByLabelText(/долгота/i));
    await user.type(screen.getByLabelText(/долгота/i), "12.4964");
    await user.click(screen.getByRole("button", { name: /сохранить данные рождения/i }));

    expect(onSaveBirthData).toHaveBeenCalledWith({
      expectedRevision: 1,
      label: "Основные данные",
      birthDate: "1990-07-15",
      birthTime: "10:30",
      birthTimePrecision: "exact",
      birthPlaceText: "Рим, Италия",
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: "Europe/Rome",
      birthTimeDstOccurrence: null,
      birthLatitude: 41.9028,
      birthLongitude: 12.4964
    });
  });

  it("closes the birth data editor from the close button and reopens it from the toolbar", async () => {
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

    expect(screen.getByRole("region", { name: "Заполнение данных рождения" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Закрыть форму данных рождения" }));

    expect(screen.queryByRole("region", { name: "Заполнение данных рождения" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Данные рождения" }));

    expect(screen.getByRole("region", { name: "Заполнение данных рождения" })).toBeInTheDocument();
  });

  it("closes the birth data editor when the workspace backdrop is clicked", async () => {
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

    const birthDataWorkspace = screen.getByRole("region", {
      name: "Заполнение данных рождения"
    });

    fireEvent.mouseDown(birthDataWorkspace);

    expect(screen.queryByRole("region", { name: "Заполнение данных рождения" })).not.toBeInTheDocument();
  });

  it("edits a complete client birth occurrence and clears it when the timezone changes", async () => {
    const user = userEvent.setup();
    const onSaveBirthData = vi.fn(async () => undefined);
    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        locale="ru"
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onSaveBirthData={onSaveBirthData}
      />
    );

    await user.click(screen.getByRole("button", { name: "Данные рождения" }));
    await user.selectOptions(screen.getByLabelText("Повторный час"), "second");
    await user.click(screen.getByRole("button", { name: /сохранить данные рождения/i }));
    expect(onSaveBirthData).toHaveBeenLastCalledWith(
      expect.objectContaining({ birthTimeDstOccurrence: "second" })
    );

    await user.click(screen.getByText(/ввести координаты вручную/i));
    await user.clear(screen.getByLabelText("Часовой пояс"));
    await user.type(screen.getByLabelText("Часовой пояс"), "Europe/Paris");
    await user.click(screen.getByRole("button", { name: /сохранить данные рождения/i }));
    expect(onSaveBirthData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        birthTimezone: "Europe/Paris",
        birthTimeDstOccurrence: null
      })
    );
  });

  it("fills timezone and coordinates from debounced birth-place autocomplete", async () => {
    const user = userEvent.setup();
    const onSaveBirthData = vi.fn(async () => undefined);
    const onSearchBirthPlaces = vi.fn(async () => [
      {
        id: "nominatim:41485",
        label: "Rome, Lazio, Italy",
        placeName: "Rome, Italy",
        countryCode: "IT",
        city: "Rome",
        region: "Lazio",
        timezone: "Europe/Rome",
        latitude: 41.8933,
        longitude: 12.4829,
        provider: "geoapify" as const,
        providerPlaceId: "41485"
      }
    ]);

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
            birthPlaceText: null,
            birthCountryCode: null,
            birthCity: null,
            birthRegion: null,
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
        onSearchBirthPlaces={onSearchBirthPlaces}
        onSaveBirthData={onSaveBirthData}
        isSavingBirthData={false}
        birthDataError={null}
      />
    );

    expect(screen.queryByRole("button", { name: /найти/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/место рождения/i), "Rome Italy");
    await waitFor(() => expect(onSearchBirthPlaces).toHaveBeenCalledWith("Rome Italy"));
    expect(onSearchBirthPlaces).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole("option", { name: /rome, italy/i }));
    await user.click(screen.getByRole("button", { name: /дата рождения/i }));
    await user.selectOptions(screen.getByLabelText("Год рождения"), "1990");
    await user.selectOptions(screen.getByLabelText("Месяц рождения"), "07");
    await user.click(screen.getByRole("button", { name: "15 июля 1990" }));
    await user.selectOptions(screen.getByLabelText(/точность времени/i), "exact");
    await user.click(screen.getByRole("button", { name: /время рождения/i }));
    await user.click(screen.getByRole("button", { name: "10:00" }));
    await user.click(screen.getByRole("button", { name: "30 минут" }));
    await user.click(screen.getByRole("button", { name: /сохранить данные рождения/i }));

    expect(onSearchBirthPlaces).toHaveBeenCalledWith("Rome Italy");
    expect(onSearchBirthPlaces).toHaveBeenCalledTimes(1);
    expect(onSaveBirthData).toHaveBeenCalledWith(
      expect.objectContaining({
        birthPlaceText: "Rome, Italy",
        birthCountryCode: "IT",
        birthCity: "Rome",
        birthRegion: "Lazio",
        birthTimezone: "Europe/Rome",
        birthLatitude: 41.8933,
        birthLongitude: 12.4829
      })
    );
  });

  it("isolates an unsaved birth-data draft when the selected client changes", async () => {
    const user = userEvent.setup();
    const clientWithoutBirthData = { ...client, birthData: null } satisfies ClientSelectOption;
    const otherClientWithoutCompleteBirthData = {
      ...partnerClient,
      birthData: {
        ...partnerClient.birthData,
        birthDate: null,
        birthPlaceText: "Берлин, Германия",
        birthCountryCode: "DE",
        birthCity: "Берлин",
        birthRegion: null,
        birthTimezone: null,
        birthLatitude: null,
        birthLongitude: null
      }
    } satisfies ClientSelectOption;
    const page = (selectedClient: ClientSelectOption) => (
      <ChartEnginePage
        selectedClient={selectedClient}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onSaveBirthData={vi.fn()}
      />
    );
    const { rerender } = render(page(clientWithoutBirthData));

    await user.type(screen.getByLabelText(/место рождения/i), "Rome Italy");
    expect(screen.getByLabelText(/место рождения/i)).toHaveValue("Rome Italy");

    rerender(page(otherClientWithoutCompleteBirthData));
    expect(screen.getByLabelText(/место рождения/i)).toHaveValue("Берлин, Германия");

    rerender(page(clientWithoutBirthData));
    expect(screen.getByLabelText(/место рождения/i)).toHaveValue("");
  });

  it("discards an in-flight birth-place search when the selected client changes", async () => {
    const user = userEvent.setup();
    const searchResult = deferred<readonly ClientBirthPlaceCandidate[]>();
    const onSearchBirthPlaces = vi.fn(() => searchResult.promise);
    const clientWithoutBirthData = { ...client, birthData: null } satisfies ClientSelectOption;
    const otherClientWithoutCompleteBirthData = {
      ...partnerClient,
      birthData: {
        ...partnerClient.birthData,
        birthDate: null,
        birthPlaceText: "Берлин, Германия",
        birthCountryCode: "DE",
        birthCity: "Берлин",
        birthRegion: null,
        birthTimezone: null,
        birthLatitude: null,
        birthLongitude: null
      }
    } satisfies ClientSelectOption;
    const page = (selectedClient: ClientSelectOption) => (
      <ChartEnginePage
        selectedClient={selectedClient}
        jobState="idle"
        result={null}
        errorMessage={null}
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onSearchBirthPlaces={onSearchBirthPlaces}
        onSaveBirthData={vi.fn()}
      />
    );
    const { rerender } = render(page(clientWithoutBirthData));

    await user.type(screen.getByLabelText(/место рождения/i), "Rome Italy");
    await waitFor(() => expect(onSearchBirthPlaces).toHaveBeenCalledWith("Rome Italy"));

    rerender(page(otherClientWithoutCompleteBirthData));
    searchResult.resolve([
      {
        id: "geoapify:rome",
        label: "Rome, Lazio, Italy",
        placeName: "Rome, Italy",
        countryCode: "IT",
        city: "Rome",
        region: "Lazio",
        timezone: "Europe/Rome",
        latitude: 41.8933,
        longitude: 12.4829,
        provider: "geoapify",
        providerPlaceId: "rome"
      }
    ]);

    await waitFor(() => {
      expect(screen.getByLabelText(/место рождения/i)).toHaveValue("Берлин, Германия");
      expect(screen.queryByRole("option", { name: /rome, italy/i })).not.toBeInTheDocument();
    });
  });

  it("renders independent poll, result, saved-calculation, and link recovery actions", async () => {
    const user = userEvent.setup();
    const onRetryPoll = vi.fn();
    const onRetryResult = vi.fn();
    const onRetrySavedCalculation = vi.fn();
    const onRetryLink = vi.fn();

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="failed"
        result={null}
        errorMessage={null}
        pollErrorMessage="Статус задания недоступен"
        resultErrorMessage="Результат недоступен"
        savedCalculationErrorMessage="Сохранённый расчёт недоступен"
        linkErrorMessage="Привязка не выполнена"
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onRetryPoll={onRetryPoll}
        onRetryResult={onRetryResult}
        onRetrySavedCalculation={onRetrySavedCalculation}
        onRetryLink={onRetryLink}
      />
    );

    expect(screen.getByText("Статус задания недоступен")).toBeInTheDocument();
    expect(screen.getByText("Результат недоступен")).toBeInTheDocument();
    expect(screen.getByText("Сохранённый расчёт недоступен")).toBeInTheDocument();
    expect(screen.getByText("Привязка не выполнена")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить проверку расчёта" }));
    await user.click(screen.getByRole("button", { name: "Повторить загрузку результата" }));
    await user.click(
      screen.getByRole("button", { name: "Повторить загрузку сохранённого расчёта" })
    );
    await user.click(screen.getByRole("button", { name: "Повторить привязку" }));

    expect(onRetryPoll).toHaveBeenCalledOnce();
    expect(onRetryResult).toHaveBeenCalledOnce();
    expect(onRetrySavedCalculation).toHaveBeenCalledOnce();
    expect(onRetryLink).toHaveBeenCalledOnce();
  });

  it("offers a safe navigation action when the calculation identity mismatches", async () => {
    const user = userEvent.setup();
    const onRecoverCalculationIdentity = vi.fn();

    render(
      <ChartEnginePage
        selectedClient={client}
        jobState="succeeded"
        calculationId={calculationId}
        result={null}
        errorMessage={null}
        identityErrorMessage="Расчёт принадлежит другим клиентам"
        canRecoverCalculationIdentity
        isBusy={false}
        settings={settings()}
        onSettingsChange={vi.fn()}
        onCreateNatalJob={vi.fn()}
        onRecoverCalculationIdentity={onRecoverCalculationIdentity}
      />
    );

    expect(screen.getByText("Расчёт принадлежит другим клиентам")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Открыть клиентов расчёта" }));
    expect(onRecoverCalculationIdentity).toHaveBeenCalledOnce();
  });

  it("does not search birth places until the query has at least three characters", async () => {
    const user = userEvent.setup();
    const onSearchBirthPlaces = vi.fn(async () => []);

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
            birthPlaceText: null,
            birthCountryCode: null,
            birthCity: null,
            birthRegion: null,
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
        onSearchBirthPlaces={onSearchBirthPlaces}
        onSaveBirthData={vi.fn()}
        isSavingBirthData={false}
        birthDataError={null}
      />
    );

    await user.type(screen.getByLabelText(/место рождения/i), "Ри");

    await new Promise((resolve) => window.setTimeout(resolve, 900));
    expect(onSearchBirthPlaces).not.toHaveBeenCalled();
  });

  it("shows a friendly birth-place provider error instead of a raw HTTP message", async () => {
    const user = userEvent.setup();
    const onSearchBirthPlaces = vi.fn(async () => {
      throw new Error("HTTP request failed with status 503");
    });

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
            birthPlaceText: null,
            birthCountryCode: null,
            birthCity: null,
            birthRegion: null,
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
        onSearchBirthPlaces={onSearchBirthPlaces}
        onSaveBirthData={vi.fn()}
        isSavingBirthData={false}
        birthDataError={null}
      />
    );

    await user.type(screen.getByLabelText(/место рождения/i), "Рим");

    expect(
      await screen.findByText("Не удалось найти место. Попробуйте уточнить запрос позже.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/HTTP request failed/i)).not.toBeInTheDocument();
  });
});

function dictionaryEntriesResponse(): DictionaryEntriesResponse {
  return {
    entries: [
      {
        id: "a138f7d0-6b2c-4f6d-89a9-6be4f756d133",
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        categoryCode: "planets_in_signs",
        code: "sun_cancer",
        locale: "ru",
        source: "platform",
        title: "Солнце в Раке",
        content: "Справочная трактовка Солнца в Раке.",
        platformEntryId: "a138f7d0-6b2c-4f6d-89a9-6be4f756d133",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z"
      },
      {
        id: "b238f7d0-6b2c-4f6d-89a9-6be4f756d133",
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        categoryCode: "planets_in_signs",
        code: "moon_aries",
        locale: "ru",
        source: "platform",
        title: "Луна в Овне",
        content: "Справочная трактовка Луны в Овне.",
        platformEntryId: "b238f7d0-6b2c-4f6d-89a9-6be4f756d133",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z"
      },
      {
        id: "c338f7d0-6b2c-4f6d-89a9-6be4f756d133",
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        categoryCode: "planets_in_houses",
        code: "pluto_house_7",
        locale: "ru",
        source: "platform",
        title: "Плутон в VII доме",
        content: "Плутон в VII доме показывает интенсивные темы партнерства.",
        platformEntryId: "c338f7d0-6b2c-4f6d-89a9-6be4f756d133",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z"
      },
      {
        id: "d438f7d0-6b2c-4f6d-89a9-6be4f756d133",
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        categoryCode: "aspects",
        code: "square",
        locale: "ru",
        source: "platform",
        title: "Квадрат",
        content: "Квадрат как аспект показывает напряжение и задачу развития.",
        platformEntryId: "d438f7d0-6b2c-4f6d-89a9-6be4f756d133",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z"
      },
      {
        id: "e538f7d0-6b2c-4f6d-89a9-6be4f756d133",
        categoryId: "8e14390f-3db1-4d1c-9344-55679c778427",
        categoryCode: "planet_aspects",
        code: "sun_moon",
        locale: "ru",
        source: "platform",
        title: "Солнце — Луна",
        content: "Связь Солнца и Луны показывает контакт воли и эмоциональных потребностей.",
        platformEntryId: "e538f7d0-6b2c-4f6d-89a9-6be4f756d133",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z"
      }
    ],
    total: 5,
    counts: {
      sources: {
        all: 5,
        platform: 5,
        modified: 0,
        custom: 0
      }
    }
  };
}

function settings(): ChartSettings {
  return {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function renderChartEnginePage(
  overrides: Partial<
    Pick<
      ChartEnginePageProps,
      | "selectedClient"
      | "jobState"
      | "result"
      | "errorMessage"
      | "isBusy"
      | "isResultStale"
      | "locale"
    >
  >
) {
  const selectedClient = Object.prototype.hasOwnProperty.call(overrides, "selectedClient")
    ? (overrides.selectedClient ?? null)
    : client;

  return render(
    <ChartEnginePage
      selectedClient={selectedClient}
      jobState={overrides.jobState ?? "idle"}
      result={overrides.result ?? null}
      errorMessage={overrides.errorMessage ?? null}
      isBusy={overrides.isBusy ?? false}
      isResultStale={overrides.isResultStale ?? false}
      locale={overrides.locale}
      settings={settings()}
      onSettingsChange={vi.fn()}
      onCreateNatalJob={vi.fn()}
    />
  );
}

function collectRenderedStrings(container: HTMLElement): string[] {
  return [
    container.textContent ?? "",
    ...Array.from(container.querySelectorAll("*")).flatMap((element) =>
      ["aria-label", "aria-description", "title", "placeholder"].flatMap((attribute) => {
        const value = element.getAttribute(attribute);
        return value ? [value] : [];
      })
    )
  ];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function chartResult(
  overrides: Partial<ChartRenderResult> = {}
): StoredChartNatalCalculationPayload {
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

function calculationRecordResponse(interpretations: readonly CalculationInterpretationResponse[]) {
  return {
    id: calculationId,
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    module: "chart",
    mode: "individual",
    interpretationMode: "adult_natal",
    methodCode: "natal",
    title: "QA Natal",
    status: "calculated",
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: { method: "natal" },
    resultData: chartResult(),
    resultSummary: { method: "natal" },
    resultChecksum: checksum,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: client.value,
        displayName: client.label
      }
    ],
    links: [],
    interpretations,
    artifacts: [],
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z"
  };
}

function transitResult(): StoredChartCalculationPayload {
  const natal = chartResult({
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
        id: "mars",
        label: "Mars",
        longitude: 31.8,
        sign: "taurus",
        signDegree: 1.8,
        house: 8,
        retrograde: false
      }
    ],
    houses: [{ number: 1, longitude: 180, sign: "libra", signDegree: 0 }],
    aspects: []
  }).result;

  return {
    schemaVersion: "chart-result.v1",
    method: "transit",
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
    transitSnapshot: {
      date: "2026-07-22",
      time: "14:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964
    },
    result: {
      natal,
      transit: {
        ...natal,
        points: [
          {
            id: "mars",
            label: "Mars",
            longitude: 293.4,
            sign: "capricorn",
            signDegree: 23.4,
            house: 4,
            retrograde: false
          }
        ],
        aspects: [],
        warnings: []
      },
      aspectsToNatal: [
        {
          transitPoint: "mars",
          natalPoint: "sun",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      warnings: []
    }
  };
}

function solarReturnResult(): StoredChartSolarReturnCalculationPayload {
  const natal = chartResult({
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
        id: "mars",
        label: "Mars",
        longitude: 31.8,
        sign: "taurus",
        signDegree: 1.8,
        house: 8,
        retrograde: false
      }
    ],
    houses: [{ number: 1, longitude: 180, sign: "libra", signDegree: 0 }],
    aspects: []
  }).result;

  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: chartResult().inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal,
      solarReturn: {
        ...natal,
        points: [
          {
            id: "mars",
            label: "Mars",
            longitude: 293.4,
            sign: "capricorn",
            signDegree: 23.4,
            house: 4,
            retrograde: false
          }
        ],
        aspects: [],
        warnings: []
      },
      aspectsToNatal: [
        {
          solarReturnPoint: "mars",
          natalPoint: "sun",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      warnings: []
    }
  };
}

function progressionResult(): StoredChartProgressionCalculationPayload {
  const natal = chartResult({
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
        id: "mars",
        label: "Mars",
        longitude: 31.8,
        sign: "taurus",
        signDegree: 1.8,
        house: 8,
        retrograde: false
      }
    ],
    houses: [{ number: 1, longitude: 180, sign: "libra", signDegree: 0 }],
    aspects: []
  }).result;

  return {
    schemaVersion: "chart-result.v1",
    method: "progression",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: chartResult().inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    result: {
      natal,
      progressed: {
        ...natal,
        points: [
          {
            id: "mars",
            label: "Mars",
            longitude: 293.4,
            sign: "capricorn",
            signDegree: 23.4,
            house: 4,
            retrograde: false
          }
        ],
        aspects: [],
        warnings: []
      },
      aspectsToNatal: [
        {
          progressedPoint: "mars",
          natalPoint: "sun",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      warnings: []
    }
  };
}

function horaryResult(): StoredChartHoraryCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "horary",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    questionSnapshot: {
      question: "Стоит ли принимать предложение?",
      category: "career",
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    },
    result: chartResult({
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
      houses: [{ number: 1, longitude: 180, sign: "libra", signDegree: 0 }],
      aspects: []
    }).result
  };
}

function astrocartographyResult(): StoredChartAstrocartographyCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "astrocartography",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: chartResult().inputSnapshot,
    result: {
      lines: [
        {
          id: "sun_mc",
          point: "sun",
          angle: "mc",
          label: "Солнце MC",
          path: [
            { latitude: -66, longitude: 10 },
            { latitude: 66, longitude: 10 }
          ]
        },
        {
          id: "moon_asc",
          point: "moon",
          angle: "asc",
          label: "Луна Asc",
          path: [
            { latitude: -20, longitude: -30 },
            { latitude: 20, longitude: 30 }
          ]
        }
      ],
      warnings: []
    }
  };
}

function synastryResult(): StoredChartSynastryCalculationPayload {
  const primary = chartResult({
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
    houses: [{ number: 1, longitude: 180, sign: "libra", signDegree: 0 }],
    aspects: []
  }).result;
  const partner = chartResult({
    points: [
      {
        id: "mars",
        label: "Mars",
        longitude: 293.4,
        sign: "capricorn",
        signDegree: 23.4,
        house: 4,
        retrograde: false
      }
    ],
    houses: [{ number: 1, longitude: 166, sign: "virgo", signDegree: 16 }],
    aspects: []
  }).result;

  return {
    schemaVersion: "chart-result.v1",
    method: "synastry",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: chartResult().inputSnapshot,
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "08:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    relationshipSnapshot: {
      primaryClientId: client.value,
      partnerClientId: partnerClient.value
    },
    result: {
      primary,
      partner,
      aspectsBetween: [
        {
          primaryPoint: "sun",
          partnerPoint: "mars",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      houseOverlays: [],
      warnings: []
    }
  };
}
