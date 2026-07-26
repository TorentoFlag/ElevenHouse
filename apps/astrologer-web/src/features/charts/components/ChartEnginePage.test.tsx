// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChartRenderResult,
  ChartSettings,
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
    isPrimary: true,
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z"
  }
} satisfies ClientSelectOption;

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
    expect(screen.getByRole("button", { name: /прогрессии/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /синастрия/i })).toBeEnabled();
    expect(screen.getByText(/вводить дату рождения вручную не нужно/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /рассчитать/i }));

    expect(onCreateNatalJob).toHaveBeenCalledOnce();
  });

  it("renders child chart mode as natal-backed and calls natal calculation", async () => {
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

    await user.click(screen.getByRole("button", { name: "Детская" }));

    expect(screen.getByText("Детская карта")).toBeInTheDocument();
    expect(screen.getByText(/трактовки откроются в мягком детском режиме/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Рассчитать детскую/i }));

    expect(onCreateNatalJob).toHaveBeenCalledOnce();
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

    await user.click(screen.getByRole("button", { name: /синастрия/i }));

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
    expect(screen.getByText(/Транзитная карта рассчитана/i)).toBeInTheDocument();

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
    expect(screen.getByText("Соляр рассчитан")).toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: /прогрессии/i }));

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
    expect(screen.getByText("Прогрессии рассчитаны")).toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: "Хорар" }));

    expect(screen.getAllByText("Готово к хорару").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Вопрос хорара")).toHaveValue("");
    expect(screen.getByLabelText("Дата вопроса")).toHaveValue("2026-07-23");
    expect(screen.getByLabelText("Время вопроса")).toHaveValue("14:30");
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

  it("renders horary single-wheel result and keeps PDF disabled", () => {
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
        pdfDisabled={false}
      />
    );

    expect(screen.getAllByText("Хорар рассчитан").length).toBeGreaterThan(0);
    expect(screen.getByText(/автоматический ответ не подключён/i)).toBeInTheDocument();
    expect(screen.getByTestId("chart-point-sun")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();
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

    await user.click(screen.getByRole("button", { name: "Астрокарта" }));

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
    expect(
      screen.getByText("После расчёта здесь появятся трактовки из canonical result.")
    ).toBeInTheDocument();
  });

  it("renders astrocartography map result and keeps PDF disabled", () => {
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

    expect(screen.getAllByText("Астрокарта рассчитана").length).toBeGreaterThan(0);
    expect(screen.getByTestId("astrocartography-map")).toBeInTheDocument();
    expect(screen.getByTestId("astrocartography-line-sun_mc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();
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
      await within(interpretationsPanel).findByText(
        "В справочнике пока нет записи horary.sun.cancer."
      )
    ).toBeInTheDocument();
    expect(
      within(interpretationsPanel).getByRole("link", {
        name: "Создать трактовку horary.sun.cancer в справочнике"
      })
    ).toHaveAttribute("href", expect.stringContaining("create=horary.sun.cancer"));
    expect(within(interpretationsPanel).getByText("AI-трактовка · хорар")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/dictionary/entries/by-codes?locale=ru&codes=horary.question.career%2Chorary.sun.cancer%2Chorary.sun.house.10%2Chorary.house.1"
    );
    expect(get.mock.calls[0]?.[0]).not.toContain("sun_cancer");
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

    await user.click(screen.getByRole("button", { name: "Трактовки" }));

    const interpretationsPanel = screen.getByRole("region", { name: "Трактовки" });
    expect(
      within(interpretationsPanel).getByText("Астрокартография · библиотека")
    ).toBeInTheDocument();
    expect(
      await within(interpretationsPanel).findByText(
        "В справочнике пока нет записи astrocartography.sun.mc."
      )
    ).toBeInTheDocument();
    expect(
      within(interpretationsPanel).getByRole("link", {
        name: "Создать трактовку astrocartography.sun.mc в справочнике"
      })
    ).toHaveAttribute("href", expect.stringContaining("create=astrocartography.sun.mc"));
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
    expect(screen.getAllByText(/Синастрия рассчитана/i).length).toBeGreaterThan(0);

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
      action: "Актуальна",
      enabled: false
    }
  ])(
    "renders explicit chart state matrix for $name",
    ({ action, detail, enabled, props, status }) => {
      renderChartEnginePage(props);

      const stateSummary = screen.getByLabelText("Состояние карты");
      expect(within(stateSummary).getByText(status)).toBeInTheDocument();
      expect(within(stateSummary).getByText(detail)).toBeInTheDocument();
      const actionButton = screen.getByRole("button", { name: action });
      if (enabled) {
        expect(actionButton).toBeEnabled();
      } else {
        expect(actionButton).toBeDisabled();
      }
    }
  );

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
    expect(
      within(interpretationsPanel).getAllByText(/Справочник · platform/i).length
    ).toBeGreaterThanOrEqual(5);
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
      within(interpretationsPanel).getByText("В справочнике пока нет записи sun_house_11.")
    ).toBeInTheDocument();
    const createMissingInterpretationLink = within(interpretationsPanel).getByRole("link", {
      name: "Создать трактовку sun_house_11 в справочнике"
    });
    const createMissingInterpretationHref =
      createMissingInterpretationLink.getAttribute("href") ?? "";
    const createMissingInterpretationParams = new URLSearchParams(
      createMissingInterpretationHref.split("?")[1] ?? ""
    );
    expect(createMissingInterpretationHref).toContain("/reference?");
    expect(createMissingInterpretationParams.get("category")).toBe("planets_in_houses");
    expect(createMissingInterpretationParams.get("create")).toBe("sun_house_11");
    expect(createMissingInterpretationParams.get("search")).toBe("sun_house_11");
    expect(createMissingInterpretationParams.get("title")).toBe("Солнце · XI дом");
    expect(within(interpretationsPanel).getByText("I дом")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Дева 16°37'/)).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Квадрат")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Квадрат как аспект/i)).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText("Солнце — Луна")).toBeInTheDocument();
    expect(within(interpretationsPanel).getByText(/Связь Солнца и Луны/i)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/dictionary/entries/by-codes?locale=ru&codes=sun_cancer%2Csun_house_11%2Cmoon_aries%2Cmoon_house_8%2Cpluto_scorpio%2Cpluto_house_7%2Chouse_1%2Chouse_7%2Csquare%2Ctrine%2Csun_moon%2Cmoon_pluto"
    );
    expect(
      within(interpretationsPanel).getByRole("button", { name: /AI-черновик недоступен/i })
    ).toBeDisabled();
    expect(
      within(interpretationsPanel).queryByText(/интерпретационный контур не подключён/i)
    ).not.toBeInTheDocument();
  });

  it("shows natal result in child mode with child dictionary anchors and disabled PDF", async () => {
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

    expect(screen.getByText("Детская карта рассчитана")).toBeInTheDocument();
    expect(
      screen.getByText(/трактовки адаптированы для родительского чтения/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Трактовки" }));

    const interpretationsPanel = screen.getByRole("region", { name: "Трактовки" });
    expect(
      within(interpretationsPanel).getByText("Детские трактовки · библиотека")
    ).toBeInTheDocument();
    expect(
      await within(interpretationsPanel).findAllByText("Детская карта · планета в знаке")
    ).toHaveLength(3);
    expect(
      within(interpretationsPanel).getByText("В справочнике пока нет записи child.sun.house.11.")
    ).toBeInTheDocument();
    const createMissingInterpretationLink = within(interpretationsPanel).getByRole("link", {
      name: "Создать трактовку child.sun.house.11 в справочнике"
    });
    const createMissingInterpretationHref =
      createMissingInterpretationLink.getAttribute("href") ?? "";
    const createMissingInterpretationParams = new URLSearchParams(
      createMissingInterpretationHref.split("?")[1] ?? ""
    );
    expect(createMissingInterpretationParams.get("category")).toBe("planets_in_houses");
    expect(createMissingInterpretationParams.get("create")).toBe("child.sun.house.11");
    expect(createMissingInterpretationParams.get("search")).toBe("child.sun.house.11");
    expect(get).toHaveBeenCalledWith(
      "/dictionary/entries/by-codes?locale=ru&codes=child.sun.cancer%2Cchild.sun.house.11%2Cchild.moon.aries%2Cchild.moon.house.8%2Cchild.pluto.scorpio%2Cchild.pluto.house.7%2Cchild.house.1%2Cchild.house.7%2Cchild.aspect.sun.square.moon%2Cchild.aspect.moon.trine.pluto"
    );
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
    expect(screen.getByRole("button", { name: /добавьте время/i })).toBeDisabled();
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

    expect(screen.getAllByText(/натальная карта рассчитана/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /актуальна/i })).toBeDisabled();
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
      birthLongitude: 12.4964,
      isPrimary: true
    });
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
      "selectedClient" | "jobState" | "result" | "errorMessage" | "isBusy" | "isResultStale"
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
      settings={settings()}
      onSettingsChange={vi.fn()}
      onCreateNatalJob={vi.fn()}
    />
  );
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
