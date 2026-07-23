import { useEffect, useState } from "react";
import type {
  ChartHoraryQuestionCategory,
  ChartHoraryQuestionSnapshot,
  ChartSettings,
  ClientBirthDataUpsertRequest,
  DictionaryLocale,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import {
  getChartBirthDataReadiness,
  getChartHoraryQuestionReadiness,
  type ChartBirthDataReadiness
} from "../model/chartEngineState";
import {
  formatChartPointPosition,
  formatHouseSignDisplay,
  getChartWarnings,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  getPrimaryChartRenderResult
} from "../model/chartDisplay";
import { ChartSettingsPanel } from "./ChartSettingsPanel";
import { ChartTables, type ChartPanelTab } from "./ChartTables";
import { ChartWheel } from "./ChartWheel";
import styles from "./ChartEnginePage.module.css";

export type ChartEnginePageJobState = "idle" | "calculating" | "succeeded" | "failed";
export type ChartEngineMode =
  | "natal"
  | "child_chart"
  | "transit"
  | "progression"
  | "synastry"
  | "composite"
  | "solar_return"
  | "horary";
export type ChartTransitMomentInput = {
  readonly date: string;
  readonly time: string;
};
export type ChartHoraryQuestionInput = Omit<
  ChartHoraryQuestionSnapshot,
  "category" | "latitude" | "longitude"
> & {
  readonly category: ChartHoraryQuestionCategory;
  readonly latitude: string | number;
  readonly longitude: string | number;
};

export type ChartEnginePageProps = {
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient?: ClientSelectOption | null;
  readonly jobState: ChartEnginePageJobState;
  readonly result: StoredChartCalculationPayload | null;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly isResultStale?: boolean;
  readonly locale?: DictionaryLocale;
  readonly settings: ChartSettings;
  readonly mode?: ChartEngineMode;
  readonly transitMoment?: ChartTransitMomentInput;
  readonly solarReturnYear?: number;
  readonly progressionTargetDate?: string;
  readonly horaryQuestion?: ChartHoraryQuestionInput;
  readonly onSettingsChange: (settings: ChartSettings) => void;
  readonly onCreateNatalJob: () => void | Promise<void>;
  readonly onCreateTransitJob?: () => void | Promise<void>;
  readonly onCreateSynastryJob?: () => void | Promise<void>;
  readonly onCreateCompositeJob?: () => void | Promise<void>;
  readonly onCreateSolarReturnJob?: () => void | Promise<void>;
  readonly onCreateProgressionJob?: () => void | Promise<void>;
  readonly onCreateHoraryJob?: () => void | Promise<void>;
  readonly onTransitMomentChange?: (moment: ChartTransitMomentInput) => void;
  readonly onSolarReturnYearChange?: (year: number) => void;
  readonly onProgressionTargetDateChange?: (targetDate: string) => void;
  readonly onHoraryQuestionChange?: (question: ChartHoraryQuestionInput) => void;
  readonly onModeChange?: (mode: ChartEngineMode) => void;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
  readonly onSelectPartnerClient?: (client: ClientSelectOption) => void;
  readonly onSaveBirthData?: (data: ClientBirthDataUpsertRequest) => void | Promise<void>;
  readonly isSavingBirthData?: boolean;
  readonly birthDataError?: string | null;
  readonly pdfLabel?: string;
  readonly pdfDisabled?: boolean;
  readonly pdfTitle?: string;
  readonly pdfErrorMessage?: string | null;
  readonly onPdf?: () => void | Promise<void>;
};

export function ChartEnginePage({
  selectedClient,
  selectedPartnerClient = null,
  jobState,
  result,
  errorMessage,
  isBusy,
  isResultStale = false,
  locale = "ru",
  settings,
  mode = "natal",
  transitMoment,
  solarReturnYear,
  progressionTargetDate,
  horaryQuestion,
  onSettingsChange,
  onCreateNatalJob,
  onCreateTransitJob,
  onCreateSynastryJob,
  onCreateCompositeJob,
  onCreateSolarReturnJob,
  onCreateProgressionJob,
  onCreateHoraryJob,
  onTransitMomentChange,
  onSolarReturnYearChange,
  onProgressionTargetDateChange,
  onHoraryQuestionChange,
  onModeChange,
  onSelectClient,
  onSelectPartnerClient,
  onSaveBirthData,
  isSavingBirthData = false,
  birthDataError = null,
  pdfLabel = "PDF",
  pdfDisabled = true,
  pdfTitle = "PDF доступен после расчёта карты",
  pdfErrorMessage = null,
  onPdf
}: ChartEnginePageProps) {
  const readiness = getChartBirthDataReadiness(selectedClient?.birthData);
  const partnerReadiness = getChartBirthDataReadiness(selectedPartnerClient?.birthData);
  const [localMode, setLocalMode] = useState<ChartEngineMode>(mode);
  const [localTransitMoment, setLocalTransitMoment] = useState<ChartTransitMomentInput>(
    transitMoment ?? { date: "", time: "" }
  );
  const [localProgressionTargetDate, setLocalProgressionTargetDate] = useState(
    progressionTargetDate ?? new Date().toISOString().slice(0, 10)
  );
  const [localHoraryQuestion, setLocalHoraryQuestion] = useState<ChartHoraryQuestionInput>(
    horaryQuestion ?? getEmptyHoraryQuestion()
  );
  const activeMode = onModeChange ? mode : localMode;
  const activeTransitMoment = transitMoment ?? localTransitMoment;
  const activeSolarReturnYear = solarReturnYear ?? new Date().getFullYear();
  const activeProgressionTargetDate = progressionTargetDate ?? localProgressionTargetDate;
  useEffect(() => {
    if (horaryQuestion) {
      setLocalHoraryQuestion(horaryQuestion);
    }
  }, [horaryQuestion]);
  const activeHoraryQuestion = localHoraryQuestion;
  const isPartnerMode = activeMode === "synastry" || activeMode === "composite";
  const needsBirthData = activeMode !== "horary";
  const expectedResultMethod = getChartResultMethodForMode(activeMode);
  const horaryReadiness = getChartHoraryQuestionReadiness(activeHoraryQuestion);
  const isBirthDataBlocked = Boolean(needsBirthData && selectedClient && !readiness.ready);
  const isPartnerBirthDataBlocked = Boolean(
    needsBirthData && isPartnerMode && selectedPartnerClient && !partnerReadiness.ready
  );
  const displayResult =
    isBirthDataBlocked || isPartnerBirthDataBlocked || result?.method !== expectedResultMethod
      ? null
      : result;
  const isCurrentResultCalculated = Boolean(
    displayResult && !isResultStale && jobState === "succeeded"
  );
  const chartViewState = getChartViewState({
    selectedClient,
    readiness,
    jobState,
    displayResult,
    errorMessage,
    isBusy,
    isCurrentResultCalculated,
    isResultStale,
    mode: activeMode,
    selectedPartnerClient,
    partnerReadiness,
    horaryReadiness
  });
  const [activePanelTab, setActivePanelTab] = useState<ChartPanelTab>("planets");
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.iconBox} aria-hidden="true">
            ☉
          </span>
          <div>
            <p>{getModeTitle(activeMode)}</p>
            <h1>Движок карт</h1>
          </div>
        </div>
        <div className={styles.clientStrip}>
          {onSelectClient ? (
            <ClientSearchCombobox
              label="Клиент"
              value={selectedClient?.value ?? ""}
              placeholder="Выберите клиента"
              selectedClient={selectedClient}
              requireBirthDate={false}
              fullWidth
              disabled={isBusy}
              onSelect={onSelectClient}
            />
          ) : (
            <button className={styles.clientButton} type="button">
              <span>{selectedClient?.initials ?? "К"}</span>
              <strong>{selectedClient?.label ?? "Выберите клиента"}</strong>
              <small>{selectedClient?.birthDateDisplay ?? "из CRM"}</small>
            </button>
          )}
        </div>
        {isPartnerMode ? (
          <div className={styles.clientStrip}>
            {onSelectPartnerClient ? (
              <ClientSearchCombobox
                label="Партнёр"
                value={selectedPartnerClient?.value ?? ""}
                placeholder="Выберите партнёра"
                selectedClient={selectedPartnerClient}
                requireBirthDate={false}
                fullWidth
                disabled={isBusy}
                onSelect={onSelectPartnerClient}
              />
            ) : (
              <button className={styles.clientButton} type="button">
                <span>{selectedPartnerClient?.initials ?? "П"}</span>
                <strong>{selectedPartnerClient?.label ?? "Выберите партнёра"}</strong>
                <small>Партнёр · {selectedPartnerClient?.birthDateDisplay ?? "из CRM"}</small>
              </button>
            )}
          </div>
        ) : null}
        <nav className={styles.modeTabs} aria-label="Тип карты">
          <button
            className={activeMode === "natal" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "natal",
                onModeChange,
                setLocalMode
              })
            }
          >
            Натал
          </button>
          <button
            className={activeMode === "child_chart" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "child_chart",
                onModeChange,
                setLocalMode
              })
            }
          >
            Детская
          </button>
          <button
            className={activeMode === "transit" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "transit",
                onModeChange,
                setLocalMode
              })
            }
          >
            Транзиты
          </button>
          <button
            className={activeMode === "progression" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "progression",
                onModeChange,
                setLocalMode
              })
            }
          >
            Прогрессии
          </button>
          <button
            className={activeMode === "synastry" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "synastry",
                onModeChange,
                setLocalMode
              })
            }
          >
            Синастрия
          </button>
          <button
            className={activeMode === "composite" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "composite",
                onModeChange,
                setLocalMode
              })
            }
          >
            Композит
          </button>
          <button
            className={activeMode === "solar_return" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "solar_return",
                onModeChange,
                setLocalMode
              })
            }
          >
            Соляр
          </button>
          <button
            className={activeMode === "horary" ? styles.modeActive : styles.modeButton}
            type="button"
            onClick={() =>
              setChartMode({
                mode: "horary",
                onModeChange,
                setLocalMode
              })
            }
          >
            Хорар
          </button>
        </nav>
        <div
          aria-label="Состояние карты"
          className={styles.stateSummary}
          data-tone={chartViewState.tone}
        >
          <strong>{chartViewState.status}</strong>
          <span>{chartViewState.detail}</span>
        </div>
        <div className={styles.toolbarSpacer} />
        {activeMode === "transit" ? (
          <TransitMomentFields
            disabled={isBusy}
            value={activeTransitMoment}
            onChange={(nextMoment) =>
              updateTransitMoment({
                nextMoment,
                onTransitMomentChange,
                setLocalTransitMoment
              })
            }
          />
        ) : null}
        {activeMode === "solar_return" ? (
          <SolarReturnYearField
            disabled={isBusy}
            value={activeSolarReturnYear}
            onChange={onSolarReturnYearChange}
          />
        ) : null}
        {activeMode === "progression" ? (
          <ProgressionTargetDateField
            disabled={isBusy}
            value={activeProgressionTargetDate}
            onChange={(targetDate) =>
              updateProgressionTargetDate({
                targetDate,
                onProgressionTargetDateChange,
                setLocalProgressionTargetDate
              })
            }
          />
        ) : null}
        {activeMode === "horary" ? (
          <HoraryQuestionFields
            disabled={isBusy}
            value={activeHoraryQuestion}
            onChange={(nextQuestion) =>
              updateHoraryQuestion({
                nextQuestion,
                onHoraryQuestionChange,
                setLocalHoraryQuestion
              })
            }
          />
        ) : null}
        <button
          className={styles.calculateButton}
          type="button"
          disabled={!chartViewState.canCalculate}
          onClick={() =>
            void runChartCalculationAction({
              activeMode,
              onCreateNatalJob,
              onCreateTransitJob,
              onCreateSynastryJob,
              onCreateCompositeJob,
              onCreateSolarReturnJob,
              onCreateProgressionJob,
              onCreateHoraryJob
            })
          }
        >
          <span aria-hidden="true">⚡</span>
          {chartViewState.actionLabel}
        </button>
        <button className={styles.toolButton} type="button" disabled>
          ↗
        </button>
        <button className={styles.toolButton} type="button" disabled>
          {displayResult && selectedClient ? "✓ Привязана" : "Привязать"}
        </button>
        <button
          className={styles.toolButton}
          type="button"
          disabled={activeMode !== "natal" || pdfDisabled}
          title={
            activeMode === "child_chart"
              ? "PDF для детской карты будет отдельным контуром"
              : activeMode === "horary"
                ? "PDF для хорара будет отдельным контуром"
              : activeMode !== "natal"
                ? "PDF для этого метода будет отдельным контуром"
                : pdfTitle
          }
          onClick={() => void onPdf?.()}
        >
          {pdfLabel}
        </button>
        <button
          aria-pressed={isSettingsPanelOpen}
          className={isSettingsPanelOpen ? styles.toolButtonActive : styles.toolButton}
          type="button"
          onClick={() => setIsSettingsPanelOpen((isOpen) => !isOpen)}
        >
          <span aria-hidden="true">☼</span>
          Настройки
        </button>
      </header>

      <section className={styles.body}>
        <aside className={styles.rail} aria-label="Сводка карты">
          <section className={styles.railGroup}>
            <h2>Клиент</h2>
            <p className={styles.helpText}>
              {activeMode === "horary"
                ? "Клиент нужен как CRM-контекст; расчёт берёт момент и место вопроса из формы хорара."
                : "Вводить дату рождения вручную не нужно: расчёт берёт birth data из карточки клиента."}
            </p>
            {!selectedClient ? (
              <p className={styles.warningText}>Выберите клиента из CRM.</p>
            ) : null}
            {needsBirthData && selectedClient && !readiness.ready ? (
              <p className={styles.warningText}>Не хватает: {readiness.missing.join(", ")}.</p>
            ) : null}
            {needsBirthData && selectedClient && !readiness.ready && onSaveBirthData ? (
              <BirthDataEditor
                client={selectedClient}
                disabled={isBusy || isSavingBirthData}
                errorMessage={birthDataError}
                isSaving={isSavingBirthData}
                onSave={onSaveBirthData}
              />
            ) : null}
          </section>
          {displayResult && getChartWarnings(displayResult).length ? (
            <section className={styles.railGroup}>
              <h2>Предупреждения</h2>
              <div className={styles.warningStack}>
                {getChartWarnings(displayResult).map((warning) => (
                  <div className={styles.chartWarning} key={warning.code}>
                    {formatChartWarning(warning)}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className={styles.railGroup}>
            <h2>Большая тройка</h2>
            {displayResult ? (
              getBigThree(displayResult).map((item) => (
                <div className={styles.summaryCard} key={item.label}>
                  <span className={styles.summaryGlyph} aria-hidden="true">
                    {item.symbol}
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.muted}>Появится после расчёта.</p>
            )}
          </section>
          {displayResult ? <DistributionSummary result={displayResult} /> : null}
          {displayResult ? <DominantsSummary result={displayResult} /> : null}
          <section className={styles.railGroup}>
            <h2>Ретроградные</h2>
            {displayResult &&
            getPrimaryChartRenderResult(displayResult).points.filter((point) => point.retrograde)
              .length ? (
              getPrimaryChartRenderResult(displayResult)
                .points.filter((point) => point.retrograde)
                .map((point) => (
                  <div className={styles.retroPill} key={point.id}>
                    {getChartPointDisplayLabel(point.id, point.label)} R
                  </div>
                ))
            ) : (
              <p className={styles.muted}>Нет в текущем результате.</p>
            )}
          </section>
        </aside>

        <section className={styles.workspace}>
          <ChartWheel
            result={displayResult}
            hoveredPointId={hoveredPointId}
            onHoverPoint={setHoveredPointId}
          />
          <StatusCard
            jobState={jobState}
            errorMessage={errorMessage}
            result={displayResult}
            isResultStale={isResultStale}
            mode={activeMode}
            selectedPartnerClient={selectedPartnerClient}
            missingBirthData={isBirthDataBlocked && !readiness.ready ? readiness.missing : []}
            missingPartnerBirthData={
              isPartnerBirthDataBlocked && !partnerReadiness.ready ? partnerReadiness.missing : []
            }
            pdfErrorMessage={pdfErrorMessage}
          />
        </section>

        <aside className={styles.panel} aria-label="Данные карты">
          {isSettingsPanelOpen ? (
            <>
              <div className={styles.panelSettingsHeader}>
                <strong>Настройки расчёта</strong>
                <button
                  aria-label="Закрыть настройки расчёта"
                  className={styles.panelCloseButton}
                  type="button"
                  onClick={() => setIsSettingsPanelOpen(false)}
                >
                  +
                </button>
              </div>
              <div className={styles.panelSettings}>
                <ChartSettingsPanel
                  settings={settings}
                  disabled={isBusy}
                  onChange={onSettingsChange}
                />
              </div>
            </>
          ) : (
            <>
              <div className={styles.panelTabs}>
                {panelTabs.map((tab) => (
                  <button
                    aria-pressed={activePanelTab === tab.id}
                    className={activePanelTab === tab.id ? styles.panelTabActive : styles.panelTab}
                    key={tab.id}
                    type="button"
                    onClick={() => setActivePanelTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <ChartTables
                activeTab={activePanelTab}
                hoveredPointId={hoveredPointId}
                interpretationMode={activeMode === "child_chart" ? "child" : "default"}
                locale={locale}
                onHoverPoint={setHoveredPointId}
                result={displayResult}
              />
            </>
          )}
        </aside>
      </section>
    </main>
  );
}

type ChartViewState = {
  readonly status: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly canCalculate: boolean;
  readonly tone: "idle" | "ready" | "warning" | "busy" | "error" | "success";
};

function getChartViewState({
  selectedClient,
  readiness,
  jobState,
  displayResult,
  errorMessage,
  isBusy,
  isCurrentResultCalculated,
  isResultStale,
  mode,
  selectedPartnerClient,
  partnerReadiness,
  horaryReadiness
}: {
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
  readonly readiness: ChartBirthDataReadiness;
  readonly partnerReadiness: ChartBirthDataReadiness;
  readonly horaryReadiness: ChartBirthDataReadiness;
  readonly jobState: ChartEnginePageJobState;
  readonly displayResult: StoredChartCalculationPayload | null;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly isCurrentResultCalculated: boolean;
  readonly isResultStale: boolean;
  readonly mode: ChartEngineMode;
}): ChartViewState {
  if (!selectedClient) {
    return {
      status: "Выберите клиента",
      detail: "Карта рассчитывается только для клиента из CRM.",
      actionLabel: "Выберите клиента",
      canCalculate: false,
      tone: "idle"
    };
  }

  if (jobState === "calculating") {
    return {
      status: "Расчёт выполняется",
      detail: "Ждём результат от расчётного контура.",
      actionLabel: "Рассчитываем",
      canCalculate: false,
      tone: "busy"
    };
  }

  if (jobState === "failed") {
    return {
      status: "Ошибка расчёта",
      detail: errorMessage ?? "Проверьте данные рождения клиента и повторите расчёт.",
      actionLabel: "Повторить расчёт",
      canCalculate: mode === "horary" ? horaryReadiness.ready && !isBusy : readiness.ready && !isBusy,
      tone: "error"
    };
  }

  if (mode === "horary") {
    if (displayResult && isResultStale) {
      return {
        status: "Хорар изменён",
        detail: "Вопрос, момент, место или настройки изменились. Пересчитайте карту.",
        actionLabel: "Пересчитать хорар",
        canCalculate: horaryReadiness.ready && !isBusy,
        tone: "warning"
      };
    }

    if (isCurrentResultCalculated) {
      return {
        status: "Хорар рассчитан",
        detail: "Карта построена на момент вопроса; автоматический ответ не подключён.",
        actionLabel: "Актуальна",
        canCalculate: false,
        tone: "success"
      };
    }

    if (!horaryReadiness.ready) {
      return {
        status: "Готово к хорару",
        detail: `Заполните: ${horaryReadiness.missing.join(", ")}.`,
        actionLabel: "Заполните хорар",
        canCalculate: false,
        tone: "warning"
      };
    }

    return {
      status: "Готово к хорару",
      detail: "Введите вопрос и момент, чтобы построить карту вопроса.",
      actionLabel: "Рассчитать хорар",
      canCalculate: !isBusy,
      tone: "ready"
    };
  }

  if (!readiness.ready) {
    if (readiness.missing.includes("дата рождения")) {
      return {
        status: "Нужна дата рождения",
        detail: "Заполните дату рождения в карточке клиента.",
        actionLabel: "Добавьте дату",
        canCalculate: false,
        tone: "warning"
      };
    }

    if (readiness.missing.includes("время рождения")) {
      return {
        status: "Нужно время рождения",
        detail: "Без времени рождения не строим дома и углы.",
        actionLabel: "Добавьте время",
        canCalculate: false,
        tone: "warning"
      };
    }

    return {
      status: "Нужно место рождения",
      detail: `Заполните ${readiness.missing.join(", ")} в карточке клиента.`,
      actionLabel: "Заполните данные",
      canCalculate: false,
      tone: "warning"
    };
  }

  if (mode === "synastry" || mode === "composite") {
    const methodName = mode === "composite" ? "композита" : "синастрии";
    if (!selectedPartnerClient) {
      return {
        status: "Выберите партнёра",
        detail:
          mode === "composite"
            ? "Композит требует второго клиента из CRM."
            : "Синастрия требует второго клиента из CRM.",
        actionLabel: "Выберите партнёра",
        canCalculate: false,
        tone: "idle"
      };
    }
    if (selectedPartnerClient.value === selectedClient.value) {
      return {
        status: "Нужен другой партнёр",
        detail: `Для ${methodName} выберите второго клиента, не текущую карту.`,
        actionLabel: "Выберите другого",
        canCalculate: false,
        tone: "warning"
      };
    }
    if (!partnerReadiness.ready) {
      return {
        status: partnerReadiness.missing.includes("время рождения")
          ? "Нужно время партнёра"
          : "Нужны данные партнёра",
        detail: `У партнёра не заполнены: ${partnerReadiness.missing.join(", ")}.`,
        actionLabel: "Заполните партнёра",
        canCalculate: false,
        tone: "warning"
      };
    }
  }

  if (displayResult && isResultStale) {
    return {
      status: "Требуется пересчёт",
      detail:
        mode === "child_chart"
          ? "Данные рождения или настройки изменились. Пересчитайте детскую карту."
          : "Данные рождения или настройки изменились.",
      actionLabel: mode === "child_chart" ? "Пересчитать детскую" : "Пересчитать карту",
      canCalculate: !isBusy,
      tone: "warning"
    };
  }

  if (isCurrentResultCalculated) {
    return {
      status: "Актуальная карта",
      detail:
        mode === "transit"
          ? "Транзиты рассчитаны по наталу клиента и выбранному моменту."
          : mode === "synastry"
            ? "Синастрия рассчитана для выбранной пары клиентов."
            : mode === "composite"
              ? "Композит рассчитан как одно колесо отношений для выбранной пары."
              : mode === "solar_return"
                ? "Соляр рассчитан по наталу клиента и выбранному году."
                : mode === "progression"
                  ? "Прогрессии рассчитаны по наталу клиента и выбранной дате."
                  : mode === "child_chart"
                    ? "Расчёт использует натальные положения; трактовки адаптированы для родительского чтения."
                    : "Натальная карта рассчитана и привязана к клиенту.",
      actionLabel: "Актуальна",
      canCalculate: false,
      tone: "success"
    };
  }

  if (selectedClient.birthData?.birthTimePrecision === "approximate") {
    return {
      status: "Время примерно",
      detail: "Расчёт доступен, но карта получит предупреждение о точности времени.",
      actionLabel: "Рассчитать с пометкой",
      canCalculate: !isBusy,
      tone: "warning"
    };
  }

  return {
    status: "Готово к расчёту",
    detail:
      mode === "transit"
        ? "Натал клиента и момент транзита готовы для расчёта."
        : mode === "synastry"
          ? "Оба клиента готовы для расчёта совместимости."
          : mode === "composite"
            ? "Оба клиента готовы для расчёта композитной карты."
            : mode === "solar_return"
              ? "Натал клиента и год соляра готовы для расчёта."
              : mode === "progression"
                ? "Натал клиента и дата прогрессии готовы для расчёта."
                : mode === "child_chart"
                  ? "Натал ребёнка будет рассчитан из CRM birth data, а трактовки откроются в мягком детском режиме."
                  : "Данные рождения и настройки готовы для натальной карты.",
    actionLabel:
      mode === "transit"
        ? "Рассчитать транзиты"
        : mode === "synastry"
          ? "Рассчитать синастрию"
          : mode === "composite"
            ? "Рассчитать композит"
            : mode === "solar_return"
            ? "Рассчитать соляр"
            : mode === "progression"
              ? "Рассчитать прогрессии"
              : mode === "child_chart"
                ? "Рассчитать детскую"
                : "Рассчитать",
    canCalculate: !isBusy,
    tone: "ready"
  };
}

function DistributionSummary({ result }: { readonly result: StoredChartCalculationPayload }) {
  const renderResult = getPrimaryChartRenderResult(result);

  return (
    <section className={styles.railGroup}>
      <h2>Стихии</h2>
      <div className={styles.distributionStack}>
        {elementItems.map((item) => (
          <DistributionBar
            key={item.key}
            label={item.label}
            value={renderResult.distributions.elements[item.key]}
            max={10}
          />
        ))}
      </div>
      <h2>Кресты</h2>
      <div className={styles.distributionStack}>
        {modalityItems.map((item) => (
          <DistributionBar
            key={item.key}
            label={item.label}
            value={renderResult.distributions.modalities[item.key]}
            max={10}
          />
        ))}
      </div>
      <h2>Полярность</h2>
      <div className={styles.distributionStack}>
        {polarityItems.map((item) => (
          <DistributionBar
            key={item.key}
            label={item.label}
            value={renderResult.distributions.polarity[item.key]}
            max={10}
          />
        ))}
      </div>
    </section>
  );
}

function DominantsSummary({ result }: { readonly result: StoredChartCalculationPayload }) {
  const dominantPoints = getDominantPoints(result);

  return (
    <section className={styles.railGroup}>
      <h2>Доминанты</h2>
      {dominantPoints.length ? (
        <div className={styles.dominantStack}>
          {dominantPoints.map((item) => (
            <div className={styles.dominantRow} key={item.id}>
              <span className={styles.dominantGlyph} aria-hidden="true">
                {item.symbol}
              </span>
              <strong>{item.label}</strong>
              <span>{item.count} асп.</span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>Недостаточно аспектов.</p>
      )}
    </section>
  );
}

function DistributionBar({
  label,
  value,
  max
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
}) {
  const width = `${Math.min(100, Math.round((value / max) * 100))}%`;

  return (
    <div className={styles.distributionRow}>
      <span>{label}</span>
      <div className={styles.distributionTrack} aria-hidden="true">
        <i style={{ width }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function BirthDataEditor({
  client,
  disabled,
  errorMessage,
  isSaving,
  onSave
}: {
  readonly client: ClientSelectOption;
  readonly disabled: boolean;
  readonly errorMessage: string | null;
  readonly isSaving: boolean;
  readonly onSave: (data: ClientBirthDataUpsertRequest) => void | Promise<void>;
}) {
  const birthData = client.birthData;
  const [birthDate, setBirthDate] = useState(birthData?.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(birthData?.birthTime ?? "");
  const [birthTimePrecision, setBirthTimePrecision] = useState<
    ClientBirthDataUpsertRequest["birthTimePrecision"]
  >(birthData?.birthTimePrecision ?? "unknown");
  const [birthPlaceText, setBirthPlaceText] = useState(birthData?.birthPlaceText ?? "");
  const [birthTimezone, setBirthTimezone] = useState(birthData?.birthTimezone ?? "");
  const [birthLatitude, setBirthLatitude] = useState(
    birthData?.birthLatitude == null ? "" : String(birthData.birthLatitude)
  );
  const [birthLongitude, setBirthLongitude] = useState(
    birthData?.birthLongitude == null ? "" : String(birthData.birthLongitude)
  );

  const timeDisabled = disabled || birthTimePrecision === "unknown";

  return (
    <form
      className={styles.birthDataCard}
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          label: birthData?.label ?? "Основные данные",
          birthDate: normalizeTextField(birthDate),
          birthTime: birthTimePrecision === "unknown" ? null : normalizeTextField(birthTime),
          birthTimePrecision,
          birthPlaceText: normalizeTextField(birthPlaceText),
          birthCountryCode: birthData?.birthCountryCode ?? null,
          birthCity: birthData?.birthCity ?? null,
          birthRegion: birthData?.birthRegion ?? null,
          birthTimezone: normalizeTextField(birthTimezone),
          birthTimeDstOccurrence: birthData?.birthTimeDstOccurrence ?? null,
          birthLatitude: normalizeNumberField(birthLatitude),
          birthLongitude: normalizeNumberField(birthLongitude)
        });
      }}
    >
      <div>
        <strong>Заполните данные рождения</strong>
        <span>Сохраним в карточку клиента и сразу разблокируем расчёт натала.</span>
      </div>
      <label>
        <span>Дата рождения</span>
        <input
          type="date"
          value={birthDate}
          disabled={disabled}
          onChange={(event) => setBirthDate(event.target.value)}
        />
      </label>
      <label>
        <span>Точность времени</span>
        <select
          value={birthTimePrecision}
          disabled={disabled}
          onChange={(event) =>
            setBirthTimePrecision(
              event.target.value as ClientBirthDataUpsertRequest["birthTimePrecision"]
            )
          }
        >
          <option value="unknown">Неизвестно</option>
          <option value="approximate">Примерно</option>
          <option value="exact">Точно</option>
        </select>
      </label>
      <label>
        <span>Время рождения</span>
        <input
          type="time"
          value={birthTime}
          disabled={timeDisabled}
          onChange={(event) => setBirthTime(event.target.value)}
        />
      </label>
      <label>
        <span>Место рождения</span>
        <input
          type="text"
          value={birthPlaceText}
          disabled={disabled}
          placeholder="Москва, Россия"
          onChange={(event) => setBirthPlaceText(event.target.value)}
        />
      </label>
      <label>
        <span>Часовой пояс</span>
        <input
          type="text"
          value={birthTimezone}
          disabled={disabled}
          placeholder="Europe/Moscow"
          onChange={(event) => setBirthTimezone(event.target.value)}
        />
      </label>
      <div className={styles.birthDataGrid}>
        <label>
          <span>Широта</span>
          <input
            type="number"
            step="0.0001"
            value={birthLatitude}
            disabled={disabled}
            onChange={(event) => setBirthLatitude(event.target.value)}
          />
        </label>
        <label>
          <span>Долгота</span>
          <input
            type="number"
            step="0.0001"
            value={birthLongitude}
            disabled={disabled}
            onChange={(event) => setBirthLongitude(event.target.value)}
          />
        </label>
      </div>
      {errorMessage ? <p className={styles.birthDataError}>{errorMessage}</p> : null}
      <button className={styles.birthDataSaveButton} type="submit" disabled={disabled}>
        {isSaving ? "Сохраняем…" : "Сохранить данные рождения"}
      </button>
    </form>
  );
}

function normalizeTextField(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNumberField(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function StatusCard({
  jobState,
  errorMessage,
  missingBirthData,
  missingPartnerBirthData,
  mode,
  selectedPartnerClient,
  result,
  isResultStale,
  pdfErrorMessage
}: {
  readonly jobState: ChartEnginePageJobState;
  readonly errorMessage: string | null;
  readonly missingBirthData: readonly string[];
  readonly missingPartnerBirthData: readonly string[];
  readonly mode: ChartEngineMode;
  readonly selectedPartnerClient: ClientSelectOption | null;
  readonly result: StoredChartCalculationPayload | null;
  readonly isResultStale: boolean;
  readonly pdfErrorMessage: string | null;
}) {
  if (jobState === "calculating") {
    return (
      <div className={styles.statusCard} role="status">
        <strong>{getCalculatingLabel(mode)}</strong>
        <span>
          {mode === "synastry"
            ? "Берём данные рождения обоих клиентов из CRM и строим canonical result."
            : mode === "composite"
              ? "Берём данные рождения обоих клиентов из CRM и строим single-wheel composite result."
              : mode === "solar_return"
              ? "Берём натал из CRM, считаем соляр на выбранный год и строим dual-wheel result."
              : mode === "progression"
                ? "Берём натал из CRM, считаем вторичные прогрессии на выбранную дату и строим dual-wheel result."
                : mode === "horary"
                  ? "Строим карту на момент вопроса; birth data клиента не используется."
                : mode === "child_chart"
                  ? "Берём birth data из CRM, считаем натал и открываем мягкий детский режим трактовок."
                  : "Берём данные рождения из CRM и строим canonical natal result."}
        </span>
      </div>
    );
  }
  if (jobState === "failed") {
    return (
      <div className={styles.statusCardError} role="alert">
        <strong>Расчёт не выполнен</strong>
        <span>{errorMessage ?? "Проверьте данные рождения клиента и повторите расчёт."}</span>
      </div>
    );
  }
  if (missingBirthData.length > 0) {
    return (
      <div className={styles.statusCard} role="status">
        <strong>Нужны данные рождения</strong>
        <span>
          Добавьте {missingBirthData.join(", ")}, чтобы рассчитать натал без имитации домов и углов.
        </span>
      </div>
    );
  }
  if ((mode === "synastry" || mode === "composite") && !selectedPartnerClient) {
    return (
      <div className={styles.statusCard} role="status">
        <strong>Выберите партнёра</strong>
        <span>Второй участник берётся из связанного CRM-клиента.</span>
      </div>
    );
  }
  if (missingPartnerBirthData.length > 0) {
    return (
      <div className={styles.statusCard} role="status">
        <strong>Нужны данные партнёра</strong>
        <span>
          Добавьте {missingPartnerBirthData.join(", ")}, чтобы рассчитать{" "}
          {mode === "composite" ? "композит" : "синастрию"}.
        </span>
      </div>
    );
  }
  if (!result) {
    return (
      <div className={styles.statusCard}>
        <strong>{getEmptyResultLabel(mode)}</strong>
        <span>
          {mode === "transit"
            ? "Выберите клиента и момент транзита: дата, время и место будут отправлены в backend-контур."
            : mode === "synastry"
              ? "Выберите второго клиента: в backend уйдут только id пары и настройки расчёта."
              : mode === "composite"
                ? "Выберите второго клиента: backend рассчитает одно колесо отношений по CRM birth data."
                : mode === "solar_return"
                ? "Выберите клиента и год соляра: backend сам возьмёт birth data из CRM."
                : mode === "progression"
                  ? "Выберите клиента и дату прогрессии: backend сам возьмёт birth data из CRM."
                  : mode === "horary"
                    ? "Выберите клиента как CRM-контекст и заполните вопрос, момент и место вопроса."
                  : mode === "child_chart"
                    ? "Выберите клиента: backend рассчитает натал, а трактовки откроются в детском режиме."
                    : "Выберите клиента с полной датой, временем, часовым поясом и координатами рождения."}
        </span>
      </div>
    );
  }
  if (isResultStale) {
    return (
      <div className={styles.statusCard} role="status">
        <strong>Карта устарела</strong>
        <span>
          {mode === "transit"
            ? "Данные рождения, настройки или момент транзита изменились. Пересчитайте карту."
            : mode === "synastry"
              ? "Данные одного из участников или настройки изменились. Пересчитайте синастрию."
              : mode === "composite"
                ? "Данные одного из участников или настройки изменились. Пересчитайте композит."
                : mode === "solar_return"
                  ? "Данные рождения, настройки или год соляра изменились. Пересчитайте соляр."
                  : mode === "progression"
                    ? "Данные рождения, настройки или дата прогрессии изменились. Пересчитайте прогрессии."
                    : mode === "horary"
                      ? "Вопрос, момент, место или настройки изменились. Пересчитайте хорар."
                    : mode === "child_chart"
                      ? "Данные рождения или настройки изменились. Пересчитайте детскую карту."
                      : "Данные рождения или настройки изменились. Пересчитайте натал, чтобы обновить колесо и таблицы."}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.statusCard}>
      <strong>{getSucceededLabel(mode)}</strong>
      <span>
        Провайдер: {result.provider.name} · {result.provider.ephemeris}
      </span>
      {pdfErrorMessage ? <span className={styles.warningText}>{pdfErrorMessage}</span> : null}
    </div>
  );
}

function getBigThree(result: StoredChartCalculationPayload): readonly {
  readonly label: string;
  readonly symbol: string;
  readonly value: string;
}[] {
  const renderResult = getPrimaryChartRenderResult(result);
  const points = renderResult.points;
  const sun = points.find((point) => point.id === "sun");
  const moon = points.find((point) => point.id === "moon");
  const ascendant = renderResult.houses.find((house) => house.number === 1);

  return [
    { label: "Солнце", symbol: "☉︎", value: sun ? formatChartPointPosition(sun) : "—" },
    { label: "Луна", symbol: "☽︎", value: moon ? formatChartPointPosition(moon) : "—" },
    {
      label: "Asc",
      symbol: "A",
      value: ascendant
        ? `${formatHouseSignDisplay(ascendant.sign)} ${Math.round(ascendant.signDegree)}°`
        : "—"
    }
  ];
}

function getDominantPoints(result: StoredChartCalculationPayload): readonly {
  readonly id: string;
  readonly label: string;
  readonly symbol: string;
  readonly count: number;
}[] {
  const renderResult = getPrimaryChartRenderResult(result);
  const pointOrder = new Map(renderResult.points.map((point, index) => [point.id, index]));
  const pointById = new Map(renderResult.points.map((point) => [point.id, point]));
  const counts = new Map<string, number>();

  for (const aspect of renderResult.aspects) {
    if (dominantPointIds.has(aspect.pointA)) {
      counts.set(aspect.pointA, (counts.get(aspect.pointA) ?? 0) + 1);
    }
    if (dominantPointIds.has(aspect.pointB)) {
      counts.set(aspect.pointB, (counts.get(aspect.pointB) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([id, count]) => {
      const point = pointById.get(id);

      return point
        ? {
            id,
            label: getChartPointDisplayLabel(point.id, point.label),
            symbol: getChartPointSymbol(point.id, point.label),
            count
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.count - a.count || (pointOrder.get(a.id) ?? 0) - (pointOrder.get(b.id) ?? 0))
    .slice(0, 3);
}

function formatChartWarning(warning: ReturnType<typeof getChartWarnings>[number]): string {
  if (warning.code === "BIRTH_TIME_APPROXIMATE") {
    return "Время рождения указано примерно: дома и углы могут смещаться.";
  }

  return warning.message;
}

const elementItems = [
  { key: "fire", label: "Огонь" },
  { key: "earth", label: "Земля" },
  { key: "air", label: "Воздух" },
  { key: "water", label: "Вода" }
] as const;

const modalityItems = [
  { key: "cardinal", label: "Кардинальный" },
  { key: "fixed", label: "Фиксированный" },
  { key: "mutable", label: "Мутабельный" }
] as const;

const dominantPointIds = new Set([
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
]);

const polarityItems = [
  { key: "masculine", label: "Мужская" },
  { key: "feminine", label: "Женская" }
] as const;

const panelTabs: readonly { readonly id: ChartPanelTab; readonly label: string }[] = [
  { id: "planets", label: "Планеты" },
  { id: "aspects", label: "Аспекты" },
  { id: "houses", label: "Дома" },
  { id: "interpretations", label: "Трактовки" }
];

function getModeTitle(mode: ChartEngineMode): string {
  if (mode === "child_chart") return "Детская карта";
  if (mode === "transit") return "Транзитная карта";
  if (mode === "progression") return "Прогрессии";
  if (mode === "synastry") return "Синастрия";
  if (mode === "composite") return "Композит";
  if (mode === "solar_return") return "Соляр";
  if (mode === "horary") return "Хорар";
  return "Натальная карта";
}

function getCalculatingLabel(mode: ChartEngineMode): string {
  if (mode === "child_chart") return "Рассчитываем детскую карту";
  if (mode === "transit") return "Рассчитываем транзиты";
  if (mode === "progression") return "Рассчитываем прогрессии";
  if (mode === "synastry") return "Рассчитываем синастрию";
  if (mode === "composite") return "Рассчитываем композит";
  if (mode === "solar_return") return "Рассчитываем соляр";
  if (mode === "horary") return "Рассчитываем хорар";
  return "Рассчитываем карту";
}

function getEmptyResultLabel(mode: ChartEngineMode): string {
  if (mode === "child_chart") return "Готово к расчёту детской карты";
  if (mode === "transit") return "Готово к расчёту транзитов";
  if (mode === "progression") return "Готово к расчёту прогрессий";
  if (mode === "synastry") return "Готово к расчёту синастрии";
  if (mode === "composite") return "Готово к расчёту композита";
  if (mode === "solar_return") return "Готово к расчёту соляра";
  if (mode === "horary") return "Готово к хорару";
  return "Готово к расчёту натала";
}

function getSucceededLabel(mode: ChartEngineMode): string {
  if (mode === "child_chart") return "Детская карта рассчитана";
  if (mode === "transit") return "Транзитная карта рассчитана";
  if (mode === "progression") return "Прогрессии рассчитаны";
  if (mode === "synastry") return "Синастрия рассчитана";
  if (mode === "composite") return "Композит рассчитан";
  if (mode === "solar_return") return "Соляр рассчитан";
  if (mode === "horary") return "Хорар рассчитан";
  return "Натальная карта рассчитана";
}

function runChartCalculationAction({
  activeMode,
  onCreateNatalJob,
  onCreateTransitJob,
  onCreateSynastryJob,
  onCreateCompositeJob,
  onCreateSolarReturnJob,
  onCreateProgressionJob,
  onCreateHoraryJob
}: {
  readonly activeMode: ChartEngineMode;
  readonly onCreateNatalJob: () => void | Promise<void>;
  readonly onCreateTransitJob?: () => void | Promise<void>;
  readonly onCreateSynastryJob?: () => void | Promise<void>;
  readonly onCreateCompositeJob?: () => void | Promise<void>;
  readonly onCreateSolarReturnJob?: () => void | Promise<void>;
  readonly onCreateProgressionJob?: () => void | Promise<void>;
  readonly onCreateHoraryJob?: () => void | Promise<void>;
}) {
  if (activeMode === "child_chart") {
    return onCreateNatalJob();
  }
  if (activeMode === "transit") {
    return onCreateTransitJob?.();
  }
  if (activeMode === "progression") {
    return onCreateProgressionJob?.();
  }
  if (activeMode === "synastry") {
    return onCreateSynastryJob?.();
  }
  if (activeMode === "composite") {
    return onCreateCompositeJob?.();
  }
  if (activeMode === "solar_return") {
    return onCreateSolarReturnJob?.();
  }
  if (activeMode === "horary") {
    return onCreateHoraryJob?.();
  }

  return onCreateNatalJob();
}

function setChartMode({
  mode,
  onModeChange,
  setLocalMode
}: {
  readonly mode: ChartEngineMode;
  readonly onModeChange?: (mode: ChartEngineMode) => void;
  readonly setLocalMode: (mode: ChartEngineMode) => void;
}) {
  if (onModeChange) {
    onModeChange(mode);
    return;
  }
  setLocalMode(mode);
}

export function getChartResultMethodForMode(
  mode: ChartEngineMode
): StoredChartCalculationPayload["method"] {
  return mode === "child_chart" ? "natal" : mode;
}

function TransitMomentFields({
  disabled,
  onChange,
  value
}: {
  readonly disabled: boolean;
  readonly value: ChartTransitMomentInput;
  readonly onChange: (moment: ChartTransitMomentInput) => void;
}) {
  return (
    <div className={styles.transitMomentFields}>
      <label>
        <span>Дата транзита</span>
        <input
          aria-label="Дата транзита"
          disabled={disabled}
          id="chart-transit-date"
          name="transitDate"
          type="date"
          value={value.date}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
      </label>
      <label>
        <span>Время транзита</span>
        <input
          aria-label="Время транзита"
          disabled={disabled}
          id="chart-transit-time"
          name="transitTime"
          type="time"
          value={value.time}
          onChange={(event) => onChange({ ...value, time: event.target.value })}
        />
      </label>
    </div>
  );
}

function SolarReturnYearField({
  disabled,
  onChange,
  value
}: {
  readonly disabled: boolean;
  readonly value: number;
  readonly onChange?: (year: number) => void;
}) {
  return (
    <div className={`${styles.transitMomentFields} ${styles.solarReturnYearField}`}>
      <label>
        <span>Год соляра</span>
        <input
          aria-label="Год соляра"
          disabled={disabled}
          id="chart-solar-return-year"
          max={2100}
          min={1900}
          name="solarReturnYear"
          type="number"
          value={value}
          onChange={(event) => {
            const nextYear = Number(event.target.value);
            if (Number.isFinite(nextYear)) {
              onChange?.(nextYear);
            }
          }}
        />
      </label>
    </div>
  );
}

function ProgressionTargetDateField({
  disabled,
  onChange,
  value
}: {
  readonly disabled: boolean;
  readonly value: string;
  readonly onChange: (targetDate: string) => void;
}) {
  return (
    <div className={`${styles.transitMomentFields} ${styles.solarReturnYearField}`}>
      <label>
        <span>Дата прогрессии</span>
        <input
          aria-label="Дата прогрессии"
          disabled={disabled}
          id="chart-progression-target-date"
          name="progressionTargetDate"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function HoraryQuestionFields({
  disabled,
  onChange,
  value
}: {
  readonly disabled: boolean;
  readonly value: ChartHoraryQuestionInput;
  readonly onChange: (question: ChartHoraryQuestionInput) => void;
}) {
  return (
    <div className={styles.horaryQuestionFields}>
      <label className={styles.horaryQuestionText}>
        <span>Вопрос</span>
        <input
          aria-label="Вопрос хорара"
          disabled={disabled}
          maxLength={500}
          name="horaryQuestion"
          placeholder="Что именно нужно решить?"
          type="text"
          value={value.question}
          onChange={(event) => onChange({ ...value, question: event.target.value })}
        />
      </label>
      <label>
        <span>Категория</span>
        <select
          aria-label="Категория хорара"
          disabled={disabled}
          name="horaryCategory"
          value={value.category}
          onChange={(event) =>
            onChange({
              ...value,
              category: event.target.value as ChartHoraryQuestionCategory
            })
          }
        >
          {horaryCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Дата</span>
        <input
          aria-label="Дата вопроса"
          disabled={disabled}
          name="horaryDate"
          type="date"
          value={value.date}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
      </label>
      <label>
        <span>Время</span>
        <input
          aria-label="Время вопроса"
          disabled={disabled}
          name="horaryTime"
          type="time"
          value={value.time}
          onChange={(event) => onChange({ ...value, time: event.target.value })}
        />
      </label>
      <label>
        <span>TZ</span>
        <input
          aria-label="Часовой пояс вопроса"
          disabled={disabled}
          name="horaryTimezone"
          placeholder="Europe/Moscow"
          type="text"
          value={value.timezone}
          onChange={(event) => onChange({ ...value, timezone: event.target.value })}
        />
      </label>
      <label>
        <span>Широта</span>
        <input
          aria-label="Широта вопроса"
          disabled={disabled}
          name="horaryLatitude"
          step="0.0001"
          type="number"
          value={value.latitude}
          onChange={(event) => onChange({ ...value, latitude: event.target.value })}
        />
      </label>
      <label>
        <span>Долгота</span>
        <input
          aria-label="Долгота вопроса"
          disabled={disabled}
          name="horaryLongitude"
          step="0.0001"
          type="number"
          value={value.longitude}
          onChange={(event) => onChange({ ...value, longitude: event.target.value })}
        />
      </label>
    </div>
  );
}

function updateTransitMoment({
  nextMoment,
  onTransitMomentChange,
  setLocalTransitMoment
}: {
  readonly nextMoment: ChartTransitMomentInput;
  readonly onTransitMomentChange?: (moment: ChartTransitMomentInput) => void;
  readonly setLocalTransitMoment: (moment: ChartTransitMomentInput) => void;
}) {
  if (onTransitMomentChange) {
    onTransitMomentChange(nextMoment);
    return;
  }
  setLocalTransitMoment(nextMoment);
}

function updateProgressionTargetDate({
  targetDate,
  onProgressionTargetDateChange,
  setLocalProgressionTargetDate
}: {
  readonly targetDate: string;
  readonly onProgressionTargetDateChange?: (targetDate: string) => void;
  readonly setLocalProgressionTargetDate: (targetDate: string) => void;
}) {
  if (onProgressionTargetDateChange) {
    onProgressionTargetDateChange(targetDate);
    return;
  }
  setLocalProgressionTargetDate(targetDate);
}

function updateHoraryQuestion({
  nextQuestion,
  onHoraryQuestionChange,
  setLocalHoraryQuestion
}: {
  readonly nextQuestion: ChartHoraryQuestionInput;
  readonly onHoraryQuestionChange?: (question: ChartHoraryQuestionInput) => void;
  readonly setLocalHoraryQuestion: (question: ChartHoraryQuestionInput) => void;
}) {
  setLocalHoraryQuestion(nextQuestion);
  onHoraryQuestionChange?.(nextQuestion);
}

function getEmptyHoraryQuestion(): ChartHoraryQuestionInput {
  return {
    question: "",
    category: "other",
    date: "",
    time: "",
    timezone: "",
    latitude: "",
    longitude: ""
  };
}

const horaryCategoryOptions: readonly {
  readonly value: ChartHoraryQuestionCategory;
  readonly label: string;
}[] = [
  { value: "relationship", label: "Отношения" },
  { value: "career", label: "Работа" },
  { value: "money", label: "Деньги" },
  { value: "home", label: "Дом" },
  { value: "health", label: "Здоровье" },
  { value: "travel", label: "Поездка" },
  { value: "other", label: "Другое" }
];
