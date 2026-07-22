import { useState } from "react";
import type {
  ChartSettings,
  ClientBirthDataUpsertRequest,
  DictionaryLocale,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import {
  getChartBirthDataReadiness,
  type ChartBirthDataReadiness
} from "../model/chartEngineState";
import {
  formatChartPointPosition,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
  getChartPointSymbol
} from "../model/chartDisplay";
import { ChartSettingsPanel } from "./ChartSettingsPanel";
import { ChartTables, type ChartPanelTab } from "./ChartTables";
import { ChartWheel } from "./ChartWheel";
import styles from "./ChartEnginePage.module.css";

export type ChartEnginePageJobState = "idle" | "calculating" | "succeeded" | "failed";

export type ChartEnginePageProps = {
  readonly selectedClient: ClientSelectOption | null;
  readonly jobState: ChartEnginePageJobState;
  readonly result: StoredChartCalculationPayload | null;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly isResultStale?: boolean;
  readonly locale?: DictionaryLocale;
  readonly settings: ChartSettings;
  readonly onSettingsChange: (settings: ChartSettings) => void;
  readonly onCreateNatalJob: () => void | Promise<void>;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
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
  jobState,
  result,
  errorMessage,
  isBusy,
  isResultStale = false,
  locale = "ru",
  settings,
  onSettingsChange,
  onCreateNatalJob,
  onSelectClient,
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
  const isBirthDataBlocked = Boolean(selectedClient && !readiness.ready);
  const displayResult = isBirthDataBlocked ? null : result;
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
    isResultStale
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
            <p>Натальная карта</p>
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
        <nav className={styles.modeTabs} aria-label="Тип карты">
          <button className={styles.modeActive} type="button">
            Натал
          </button>
          <button
            className={styles.modeDisabled}
            type="button"
            disabled
            title="Будет подключено после транзитного движка"
          >
            Транзиты
          </button>
          <button
            className={styles.modeDisabled}
            type="button"
            disabled
            title="Будет подключено после прогностического контура"
          >
            Прогрессии
          </button>
          <button
            className={styles.modeDisabled}
            type="button"
            disabled
            title="Синастрия будет отдельным методом расчёта"
          >
            Ещё
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
        <button
          className={styles.calculateButton}
          type="button"
          disabled={!chartViewState.canCalculate}
          onClick={() => void onCreateNatalJob()}
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
          disabled={pdfDisabled}
          title={pdfTitle}
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
              Вводить дату рождения вручную не нужно: расчёт берёт birth data из карточки клиента.
            </p>
            {!selectedClient ? (
              <p className={styles.warningText}>Выберите клиента из CRM.</p>
            ) : null}
            {selectedClient && !readiness.ready ? (
              <p className={styles.warningText}>Не хватает: {readiness.missing.join(", ")}.</p>
            ) : null}
            {selectedClient && !readiness.ready && onSaveBirthData ? (
              <BirthDataEditor
                client={selectedClient}
                disabled={isBusy || isSavingBirthData}
                errorMessage={birthDataError}
                isSaving={isSavingBirthData}
                onSave={onSaveBirthData}
              />
            ) : null}
          </section>
          {displayResult?.result.warnings.length ? (
            <section className={styles.railGroup}>
              <h2>Предупреждения</h2>
              <div className={styles.warningStack}>
                {displayResult.result.warnings.map((warning) => (
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
            {displayResult?.result.points.filter((point) => point.retrograde).length ? (
              displayResult.result.points
                .filter((point) => point.retrograde)
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
            missingBirthData={isBirthDataBlocked && !readiness.ready ? readiness.missing : []}
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
  isResultStale
}: {
  readonly selectedClient: ClientSelectOption | null;
  readonly readiness: ChartBirthDataReadiness;
  readonly jobState: ChartEnginePageJobState;
  readonly displayResult: StoredChartCalculationPayload | null;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly isCurrentResultCalculated: boolean;
  readonly isResultStale: boolean;
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
      canCalculate: readiness.ready && !isBusy,
      tone: "error"
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

  if (displayResult && isResultStale) {
    return {
      status: "Требуется пересчёт",
      detail: "Данные рождения или настройки изменились.",
      actionLabel: "Пересчитать карту",
      canCalculate: !isBusy,
      tone: "warning"
    };
  }

  if (isCurrentResultCalculated) {
    return {
      status: "Актуальная карта",
      detail: "Натальная карта рассчитана и привязана к клиенту.",
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
    detail: "Данные рождения и настройки готовы для натальной карты.",
    actionLabel: "Рассчитать",
    canCalculate: !isBusy,
    tone: "ready"
  };
}

function DistributionSummary({ result }: { readonly result: StoredChartCalculationPayload }) {
  return (
    <section className={styles.railGroup}>
      <h2>Стихии</h2>
      <div className={styles.distributionStack}>
        {elementItems.map((item) => (
          <DistributionBar
            key={item.key}
            label={item.label}
            value={result.result.distributions.elements[item.key]}
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
            value={result.result.distributions.modalities[item.key]}
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
            value={result.result.distributions.polarity[item.key]}
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
  result,
  isResultStale,
  pdfErrorMessage
}: {
  readonly jobState: ChartEnginePageJobState;
  readonly errorMessage: string | null;
  readonly missingBirthData: readonly string[];
  readonly result: StoredChartCalculationPayload | null;
  readonly isResultStale: boolean;
  readonly pdfErrorMessage: string | null;
}) {
  if (jobState === "calculating") {
    return (
      <div className={styles.statusCard} role="status">
        <strong>Рассчитываем карту</strong>
        <span>Берём данные рождения из CRM и строим canonical natal result.</span>
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
  if (!result) {
    return (
      <div className={styles.statusCard}>
        <strong>Готово к расчёту натала</strong>
        <span>
          Выберите клиента с полной датой, временем, часовым поясом и координатами рождения.
        </span>
      </div>
    );
  }
  if (isResultStale) {
    return (
      <div className={styles.statusCard} role="status">
        <strong>Карта устарела</strong>
        <span>
          Данные рождения или настройки изменились. Пересчитайте натал, чтобы обновить колесо и
          таблицы.
        </span>
      </div>
    );
  }

  return (
    <div className={styles.statusCard}>
      <strong>Натальная карта рассчитана</strong>
      <span>
        Провайдер: {result.provider.name} · {result.provider.ephemeris}
      </span>
      {pdfErrorMessage ? <span className={styles.warningText}>{pdfErrorMessage}</span> : null}
    </div>
  );
}

function getBigThree(
  result: StoredChartCalculationPayload
): readonly {
  readonly label: string;
  readonly symbol: string;
  readonly value: string;
}[] {
  const points = result.result.points;
  const sun = points.find((point) => point.id === "sun");
  const moon = points.find((point) => point.id === "moon");
  const ascendant = result.result.houses.find((house) => house.number === 1);

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

function getDominantPoints(
  result: StoredChartCalculationPayload
): readonly {
  readonly id: string;
  readonly label: string;
  readonly symbol: string;
  readonly count: number;
}[] {
  const pointOrder = new Map(result.result.points.map((point, index) => [point.id, index]));
  const pointById = new Map(result.result.points.map((point) => [point.id, point]));
  const counts = new Map<string, number>();

  for (const aspect of result.result.aspects) {
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

function formatChartWarning(
  warning: StoredChartCalculationPayload["result"]["warnings"][number]
): string {
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
