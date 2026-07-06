import { useState } from "react";
import type {
  NumerologyWorkspaceDetail,
  NumerologyWorkspaceModel
} from "../model/numerologyWorkspaceModel";
import {
  getPersonalYear,
  getPersonalYearEssence
} from "../model/numerologyResultPanelModel";
import { CompatibilityWorkspace } from "./CompatibilityWorkspace";
import { DetailPanel } from "./DetailPanel";
import { PythagoreanMatrix } from "./PythagoreanMatrix";
import { YearMonthsPanel } from "./YearMonthsPanel";
import styles from "./NumerologyComponents.module.css";

export { CompatibilityWorkspace } from "./CompatibilityWorkspace";
export type { CompatibilityWorkspaceProps } from "./CompatibilityWorkspace";
export { DetailPanel } from "./DetailPanel";
export type { DetailPanelProps } from "./DetailPanel";
export { YearMonthsPanel } from "./YearMonthsPanel";
export type { YearMonthsPanelProps } from "./YearMonthsPanel";

export function NumerologyResultPanel({
  model,
  detail,
  selectedSelector,
  isYearMode,
  interpretationText,
  isBusy,
  isApproveInterpretationDisabled,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation,
  onSelect
}: {
  readonly model: NumerologyWorkspaceModel | null;
  readonly detail: NumerologyWorkspaceDetail | null;
  readonly selectedSelector: string | null;
  readonly isYearMode: boolean;
  readonly interpretationText: string;
  readonly isBusy: boolean;
  readonly isApproveInterpretationDisabled: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
  readonly onSelect: (selector: string) => void;
}) {
  const [currentDate] = useState(() => new Date());

  if (!model) {
    return (
      <div className={styles.emptyWorkspace}>
        <h2 className={styles.panelTitle}>Выберите клиента для нумерологии</h2>
        <p className={styles.muted}>
          Создайте первый расчет или откройте историю, чтобы увидеть портрет клиента.
        </p>
      </div>
    );
  }

  const personalYear = getPersonalYear(model);
  const personalYearEssence = getPersonalYearEssence(model);

  if (model.mode === "compatibility" && model.compatibility) {
    return (
      <CompatibilityWorkspace
        model={model}
        interpretationText={interpretationText}
        isBusy={isBusy}
        isApproveInterpretationDisabled={isApproveInterpretationDisabled}
        onInterpretationChange={onInterpretationChange}
        onSaveInterpretation={onSaveInterpretation}
        onApproveInterpretation={onApproveInterpretation}
      />
    );
  }

  return (
    <>
      <aside className={styles.keyRail} aria-label="Ключевые числа">
        <span className={styles.kicker}>Ключевые числа</span>
        {model.keyNumbers.map((item) => (
          <button
            className={styles.keyNumber}
            data-selected={selectedSelector === item.selector ? "true" : undefined}
            key={item.code}
            onClick={() => onSelect(item.selector)}
            type="button"
          >
            <span className={styles.keyValue}>{item.value}</span>
            <span className={styles.keyCopy}>
              <span>{item.label}</span>
              <small>{item.from}</small>
            </span>
          </button>
        ))}
      </aside>
      <section className={styles.matrixColumn} aria-label="Психоматрица клиента">
        {personalYear !== null && isYearMode ? (
          <div className={styles.yearPill}>
            Личный год {currentDate.getFullYear()} — число {personalYear} · {personalYearEssence}
          </div>
        ) : null}
        {model.matrix ? (
          <>
            <PythagoreanMatrix
              cells={model.matrix.cells}
              selectedSelector={selectedSelector}
              onSelect={onSelect}
            />
            <p className={styles.matrixCaption}>
              Квадрат Пифагора · психоматрица по дате рождения · рабочие числа:{" "}
              {model.matrix.workingNumbersLabel || "—"}
            </p>
          </>
        ) : (
          <div className={styles.panelBox}>
            <h2 className={styles.panelTitle}>Психоматрица отключена</h2>
            <p className={styles.muted}>Включите психоматрицу в настройках расчета.</p>
          </div>
        )}
        {model.strengthLines.length > 0 ? (
          <div className={styles.linesPanel}>
            <span className={styles.kicker}>Линии силы</span>
            <div className={styles.linesGrid}>
              {model.strengthLines.map((line) => (
                <button
                  className={styles.lineButton}
                  data-selected={selectedSelector === line.selector ? "true" : undefined}
                  key={line.code}
                  onClick={() => onSelect(line.selector)}
                  type="button"
                >
                  <span>{line.label}</span>
                  <span className={styles.lineMeter} aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.round((line.value / 7) * 100))}%` }} />
                  </span>
                  <span className={styles.lineValue}>{line.value}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {isYearMode ? <YearMonthsPanel personalYear={personalYear} currentDate={currentDate} /> : null}
      </section>
      <DetailPanel
        detail={detail}
        interpretationText={interpretationText}
        isBusy={isBusy}
        isApproveInterpretationDisabled={isApproveInterpretationDisabled}
        onInterpretationChange={onInterpretationChange}
        onSaveInterpretation={onSaveInterpretation}
        onApproveInterpretation={onApproveInterpretation}
      />
    </>
  );
}
