import type { ChartSettings } from "@elevenhouse/contracts";
import styles from "./ChartEnginePage.module.css";

export type ChartSettingsPanelProps = {
  readonly settings: ChartSettings;
  readonly disabled?: boolean;
  readonly onChange: (settings: ChartSettings) => void;
};

export function ChartSettingsPanel({ settings, disabled = false, onChange }: ChartSettingsPanelProps) {
  return (
    <section className={styles.settingsCard} aria-labelledby="chart-settings-heading">
      <h2 id="chart-settings-heading">Настройки расчёта</h2>
      <label>
        <span>Система домов</span>
        <select
          id="chart-house-system"
          name="chartHouseSystem"
          value={settings.houseSystem}
          disabled={disabled}
          onChange={(event) => onChange({ ...settings, houseSystem: event.target.value as ChartSettings["houseSystem"] })}
        >
          <option value="placidus">Плацидус</option>
          <option value="koch">Кох</option>
          <option value="whole_sign">Whole Sign</option>
          <option value="equal">Equal</option>
          <option value="regiomontanus">Региомонтан</option>
        </select>
      </label>
      <label>
        <span>Лунные узлы</span>
        <select
          id="chart-node-type"
          name="chartNodeType"
          value={settings.nodeType}
          disabled={disabled}
          onChange={(event) => onChange({ ...settings, nodeType: event.target.value as ChartSettings["nodeType"] })}
        >
          <option value="true">Истинный узел</option>
          <option value="mean">Средний узел</option>
        </select>
      </label>
      <label>
        <span>Аспекты</span>
        <select
          id="chart-aspect-preset"
          name="chartAspectPreset"
          value={settings.aspectPreset}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...settings, aspectPreset: event.target.value as ChartSettings["aspectPreset"] })
          }
        >
          <option value="major">Мажорные</option>
          <option value="major_minor">Мажорные + минорные</option>
        </select>
      </label>
      <label>
        <span>Орбис × {settings.orbMultiplier.toFixed(1)}</span>
        <input
          id="chart-orb-multiplier"
          name="chartOrbMultiplier"
          type="range"
          min="0.5"
          max="1.5"
          step="0.1"
          value={settings.orbMultiplier}
          disabled={disabled}
          onChange={(event) => onChange({ ...settings, orbMultiplier: Number(event.target.value) })}
        />
      </label>
    </section>
  );
}
