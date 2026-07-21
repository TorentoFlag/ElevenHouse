import { useState } from "react";
import type {
  ChartSettings,
  ClientBirthDataUpsertRequest,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import { getChartBirthDataReadiness } from "../model/chartEngineState";
import {
  formatChartPointPosition,
  formatHouseSignDisplay,
  getChartPointDisplayLabel
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
  readonly settings: ChartSettings;
  readonly onSettingsChange: (settings: ChartSettings) => void;
  readonly onCreateNatalJob: () => void | Promise<void>;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
  readonly onSaveBirthData?: (data: ClientBirthDataUpsertRequest) => void | Promise<void>;
  readonly isSavingBirthData?: boolean;
  readonly birthDataError?: string | null;
};

export function ChartEnginePage({
  selectedClient,
  jobState,
  result,
  errorMessage,
  isBusy,
  isResultStale = false,
  settings,
  onSettingsChange,
  onCreateNatalJob,
  onSelectClient,
  onSaveBirthData,
  isSavingBirthData = false,
  birthDataError = null
}: ChartEnginePageProps) {
  const readiness = getChartBirthDataReadiness(selectedClient?.birthData);
  const isBirthDataBlocked = Boolean(selectedClient && !readiness.ready);
  const displayResult = isBirthDataBlocked ? null : result;
  const isCurrentResultCalculated = Boolean(
    displayResult && !isResultStale && jobState === "succeeded"
  );
  const canCalculate = Boolean(
    selectedClient && readiness.ready && !isBusy && !isCurrentResultCalculated
  );
  const [activePanelTab, setActivePanelTab] = useState<ChartPanelTab>("planets");
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const calculateButtonLabel =
    jobState === "calculating"
      ? "Рассчитываем"
      : jobState === "failed"
        ? "Повторить"
        : displayResult && isResultStale
          ? "Пересчитать"
          : displayResult
            ? "Рассчитано"
            : "Рассчитать";

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
        <div className={styles.toolbarSpacer} />
        <button
          className={styles.calculateButton}
          type="button"
          disabled={!canCalculate}
          onClick={() => void onCreateNatalJob()}
        >
          <span aria-hidden="true">⚡</span>
          {calculateButtonLabel}
        </button>
        <button className={styles.toolButton} type="button" disabled>
          ↗
        </button>
        <button className={styles.toolButton} type="button" disabled>
          {displayResult && selectedClient ? "✓ Привязана" : "Привязать"}
        </button>
        <button className={styles.toolButton} type="button" disabled>
          PDF
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
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
              ))
            ) : (
              <p className={styles.muted}>Появится после расчёта.</p>
            )}
          </section>
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
          {displayResult ? <DistributionSummary result={displayResult} /> : null}
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
  isResultStale
}: {
  readonly jobState: ChartEnginePageJobState;
  readonly errorMessage: string | null;
  readonly missingBirthData: readonly string[];
  readonly result: StoredChartCalculationPayload | null;
  readonly isResultStale: boolean;
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
    </div>
  );
}

function getBigThree(
  result: StoredChartCalculationPayload
): readonly { readonly label: string; readonly value: string }[] {
  const points = result.result.points;
  const sun = points.find((point) => point.id === "sun");
  const moon = points.find((point) => point.id === "moon");
  const ascendant = result.result.houses.find((house) => house.number === 1);

  return [
    { label: "Солнце", value: sun ? formatChartPointPosition(sun) : "—" },
    { label: "Луна", value: moon ? formatChartPointPosition(moon) : "—" },
    {
      label: "Asc",
      value: ascendant
        ? `${formatHouseSignDisplay(ascendant.sign)} ${Math.round(ascendant.signDegree)}°`
        : "—"
    }
  ];
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
