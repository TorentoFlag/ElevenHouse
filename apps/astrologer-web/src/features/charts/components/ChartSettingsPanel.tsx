import type { ChartSettings } from "@elevenhouse/contracts";
import { chartEngineCopyByLocale, type ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartEnginePage.module.css";

export type ChartSettingsPanelProps = {
  readonly settings: ChartSettings;
  readonly disabled?: boolean;
  readonly copy?: ChartEngineCopy;
  readonly onChange: (settings: ChartSettings) => void;
};

export function ChartSettingsPanel({
  copy = chartEngineCopyByLocale.ru,
  settings,
  disabled = false,
  onChange
}: ChartSettingsPanelProps) {
  return (
    <section className={styles.settingsCard} aria-label={copy.settings.ariaLabel}>
      <label>
        <span>{copy.settings.houseSystem}</span>
        <select
          id="chart-house-system"
          name="chartHouseSystem"
          value={settings.houseSystem}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              houseSystem: event.target.value as ChartSettings["houseSystem"]
            })
          }
        >
          <option value="placidus">{copy.settings.houseSystems.placidus}</option>
          <option value="koch">{copy.settings.houseSystems.koch}</option>
          <option value="whole_sign">{copy.settings.houseSystems.whole_sign}</option>
          <option value="equal">{copy.settings.houseSystems.equal}</option>
          <option value="regiomontanus">{copy.settings.houseSystems.regiomontanus}</option>
        </select>
      </label>
      <label>
        <span>{copy.settings.nodes}</span>
        <select
          id="chart-node-type"
          name="chartNodeType"
          value={settings.nodeType}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...settings, nodeType: event.target.value as ChartSettings["nodeType"] })
          }
        >
          <option value="true">{copy.settings.trueNode}</option>
          <option value="mean">{copy.settings.meanNode}</option>
        </select>
      </label>
      <label>
        <span>{copy.settings.aspects}</span>
        <select
          id="chart-aspect-preset"
          name="chartAspectPreset"
          value={settings.aspectPreset}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              aspectPreset: event.target.value as ChartSettings["aspectPreset"]
            })
          }
        >
          <option value="major">{copy.settings.major}</option>
          <option value="major_minor">{copy.settings.majorMinor}</option>
        </select>
      </label>
      <label>
        <span className={styles.settingRangeHeader}>
          {copy.settings.orbs}
          <b>×{settings.orbMultiplier.toFixed(2)}</b>
        </span>
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
        <small>{copy.settings.orbHelper}</small>
      </label>
      <div className={styles.settingsPresetNote}>
        <span aria-hidden="true">✓</span>
        {copy.settings.presetNote}
      </div>
    </section>
  );
}
