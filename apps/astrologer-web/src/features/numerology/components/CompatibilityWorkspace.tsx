import type { NumerologyWorkspaceModel } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";
import { CompatibilityComparisonList } from "./CompatibilityComparisonList";
import { CompatibilityParticipants } from "./CompatibilityParticipants";
import { CompatibilitySummary } from "./CompatibilitySummary";
import { PythagoreanMatrix } from "./PythagoreanMatrix";

export type CompatibilityWorkspaceProps = {
  readonly model: NumerologyWorkspaceModel;
  readonly selectedSelector: string | null;
  readonly interpretationText: string;
  readonly isBusy: boolean;
  readonly isApproveInterpretationDisabled: boolean;
  readonly isSaveInterpretationDisabled: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
  readonly onSelect: (selector: string) => void;
};

export function CompatibilityWorkspace({
  model,
  selectedSelector,
  interpretationText,
  isBusy,
  isApproveInterpretationDisabled,
  isSaveInterpretationDisabled,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation,
  onSelect
}: CompatibilityWorkspaceProps) {
  const compatibility = model.compatibility;
  if (!compatibility) return null;

  return (
    <>
      <CompatibilityParticipants participants={compatibility.participants} />
      <section className={styles.compatibilityMatrixGrid} aria-label="Матрицы совместимости">
        {compatibility.matrices.map((item) => (
          <div className={styles.compatibilityMatrix} key={item.participant.displayName}>
            <div className={styles.compatibilityMatrixTitle}>
              <span className={styles.avatar}>{item.participant.initials}</span>
              <strong>{item.participant.displayName}</strong>
              <span>путь {item.participant.lifePath ?? "—"}</span>
            </div>
            {item.matrix ? (
              <PythagoreanMatrix
                cells={item.matrix.cells}
                selectedSelector={selectedSelector}
                selectorForDigit={(digit) => `compatibility:psychomatrix:digit_${digit}`}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        ))}
        <div className={styles.pairPill}>
          Число пары: <strong>{compatibility.pairNumber ?? "—"}</strong>
          {compatibility.pairMeaning ? <span> · {compatibility.pairMeaning.essence}</span> : null}
        </div>
      </section>
      <aside className={styles.detailPanel} aria-label="Разбор совместимости">
        <div className={styles.detailHead}>
          <span className={styles.detailEyebrow}>совместимость</span>
          <div className={styles.detailTitleRow}>
            <span className={styles.detailValue}>{compatibility.pairNumber ?? "—"}</span>
            <span>
              <strong>{compatibility.conclusion.label}</strong>
              {compatibility.pairMeaning ? <small>{compatibility.pairMeaning.essence}</small> : null}
            </span>
          </div>
        </div>
        <div className={styles.detailBody}>
          <p>{compatibility.conclusion.explanation}</p>
          <CompatibilityComparisonList
            title="Ключевые числа"
            ariaLabel="Ключевые числа пары"
            comparisons={compatibility.keyNumberComparisons}
            selectedSelector={selectedSelector}
            onSelect={onSelect}
          />
          <CompatibilityComparisonList
            title="Психоматрица"
            ariaLabel="Сравнение психоматриц"
            comparisons={compatibility.matrixComparisons}
            selectedSelector={selectedSelector}
            onSelect={onSelect}
          />
          <CompatibilityComparisonList
            title="Линии матриц"
            ariaLabel="Линии совместимости"
            comparisons={compatibility.strengthLineComparisons}
            selectedSelector={selectedSelector}
            onSelect={onSelect}
          />
          <CompatibilitySummary
            pairNumber={compatibility.pairNumber}
            zones={compatibility.zones}
            counts={compatibility.counts.total}
            conclusion={compatibility.conclusion}
            selectedSelector={selectedSelector}
            onSelect={onSelect}
          />
          <div className={styles.manualInterpretation}>
            <span className={styles.kicker}>Ручная трактовка</span>
            <textarea
              value={interpretationText}
              onChange={(event) => onInterpretationChange(event.target.value)}
              placeholder="Введите ручную трактовку для пары"
            />
            <div>
              <button
                type="button"
                className="eh-button eh-button--secondary"
                disabled={isSaveInterpretationDisabled || isBusy}
                onClick={onSaveInterpretation}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="eh-button eh-button--primary"
                disabled={isApproveInterpretationDisabled}
                onClick={onApproveInterpretation}
              >
                Утвердить
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
