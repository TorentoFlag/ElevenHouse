import type { ChartSettings, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import { getChartBirthDataReadiness } from "../model/chartEngineState";
import { ChartSettingsPanel } from "./ChartSettingsPanel";
import { ChartTables } from "./ChartTables";
import { ChartWheel } from "./ChartWheel";
import styles from "./ChartEnginePage.module.css";

export type ChartEnginePageJobState = "idle" | "calculating" | "succeeded" | "failed";

export type ChartEnginePageProps = {
  readonly selectedClient: ClientSelectOption | null;
  readonly jobState: ChartEnginePageJobState;
  readonly result: StoredChartCalculationPayload | null;
  readonly errorMessage: string | null;
  readonly isBusy: boolean;
  readonly settings: ChartSettings;
  readonly onSettingsChange: (settings: ChartSettings) => void;
  readonly onCreateNatalJob: () => void | Promise<void>;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
};

export function ChartEnginePage({
  selectedClient,
  jobState,
  result,
  errorMessage,
  isBusy,
  settings,
  onSettingsChange,
  onCreateNatalJob,
  onSelectClient
}: ChartEnginePageProps) {
  const readiness = getChartBirthDataReadiness(selectedClient?.birthData);
  const canCalculate = Boolean(selectedClient && readiness.ready && !isBusy);

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
          <button className={styles.modeDisabled} type="button" disabled title="Будет подключено после транзитного движка">
            Транзиты
          </button>
          <button className={styles.modeDisabled} type="button" disabled title="Будет подключено после прогностического контура">
            Прогрессии
          </button>
          <button className={styles.modeDisabled} type="button" disabled title="Синастрия будет отдельным методом расчёта">
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
          Рассчитать
        </button>
        <button className={styles.toolButton} type="button" disabled>
          ↗
        </button>
        <button className={styles.toolButton} type="button" disabled>
          Привязать клиенту
        </button>
        <button className={styles.toolButton} type="button" disabled>
          PDF
        </button>
      </header>

      <section className={styles.body}>
        <aside className={styles.rail} aria-label="Сводка карты">
          <section className={styles.railGroup}>
            <h2>Клиент</h2>
            <p className={styles.helpText}>
              Вводить дату рождения вручную не нужно: расчёт берёт birth data из карточки клиента.
            </p>
            {!selectedClient ? <p className={styles.warningText}>Выберите клиента из CRM.</p> : null}
            {selectedClient && !readiness.ready ? (
              <p className={styles.warningText}>Не хватает: {readiness.missing.join(", ")}.</p>
            ) : null}
          </section>
          <section className={styles.railGroup}>
            <h2>Большая тройка</h2>
            {result ? (
              getBigThree(result).map((item) => (
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
            {result?.result.points.filter((point) => point.retrograde).length ? (
              result.result.points
                .filter((point) => point.retrograde)
                .map((point) => (
                  <div className={styles.retroPill} key={point.id}>
                    {point.label} R
                  </div>
                ))
            ) : (
              <p className={styles.muted}>Нет в текущем результате.</p>
            )}
          </section>
          <ChartSettingsPanel settings={settings} disabled={isBusy} onChange={onSettingsChange} />
        </aside>

        <section className={styles.workspace}>
          <ChartWheel result={result} />
          <StatusCard jobState={jobState} errorMessage={errorMessage} result={result} />
        </section>

        <aside className={styles.panel} aria-label="Данные карты">
          <div className={styles.panelTabs}>
            <button className={styles.panelTabActive} type="button">
              Планеты
            </button>
            <button className={styles.panelTab} type="button">
              Аспекты
            </button>
            <button className={styles.panelTab} type="button">
              Дома
            </button>
            <button className={styles.panelTab} type="button">
              Трактовки
            </button>
          </div>
          <ChartTables result={result} />
        </aside>
      </section>
    </main>
  );
}

function StatusCard({
  jobState,
  errorMessage,
  result
}: {
  readonly jobState: ChartEnginePageJobState;
  readonly errorMessage: string | null;
  readonly result: StoredChartCalculationPayload | null;
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
  if (!result) {
    return (
      <div className={styles.statusCard}>
        <strong>Готово к расчёту натала</strong>
        <span>Выберите клиента с полной датой, временем, часовым поясом и координатами рождения.</span>
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

function getBigThree(result: StoredChartCalculationPayload): readonly { readonly label: string; readonly value: string }[] {
  const points = result.result.points;
  const sun = points.find((point) => point.id === "sun");
  const moon = points.find((point) => point.id === "moon");
  const ascendant = result.result.houses.find((house) => house.number === 1);

  return [
    { label: "Солнце", value: sun ? `${sun.sign} ${Math.round(sun.signDegree)}°` : "—" },
    { label: "Луна", value: moon ? `${moon.sign} ${Math.round(moon.signDegree)}°` : "—" },
    { label: "Asc", value: ascendant ? `${ascendant.sign} ${Math.round(ascendant.signDegree)}°` : "—" }
  ];
}
