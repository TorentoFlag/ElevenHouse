import { formatNullableNumerologyNumber } from "../model/numerologyResultPanelModel";
import type { NumerologyWorkspaceModel } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";
import { PythagoreanMatrix } from "./PythagoreanMatrix";

export type CompatibilityWorkspaceProps = {
  readonly model: NumerologyWorkspaceModel;
  readonly interpretationText: string;
  readonly isBusy: boolean;
  readonly isApproveInterpretationDisabled: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
};

export function CompatibilityWorkspace({
  model,
  interpretationText,
  isBusy,
  isApproveInterpretationDisabled,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation
}: CompatibilityWorkspaceProps) {
  const compatibility = model.compatibility;
  if (!compatibility) return null;

  return (
    <>
      <aside className={styles.keyRail} aria-label="Участники совместимости">
        {compatibility.participants.map((participant) => (
          <div className={styles.participantCard} key={participant.displayName}>
            <span className={styles.avatar}>{participant.initials}</span>
            <strong>{participant.displayName}</strong>
            <dl>
              <div>
                <dt>Путь</dt>
                <dd>{formatNullableNumerologyNumber(participant.lifePath)}</dd>
              </div>
              <div>
                <dt>Выражение</dt>
                <dd>{formatNullableNumerologyNumber(participant.expression)}</dd>
              </div>
              <div>
                <dt>Душа</dt>
                <dd>{formatNullableNumerologyNumber(participant.soul)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </aside>
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
                selectedSelector={null}
                onSelect={() => undefined}
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
              <strong>Число пары</strong>
              {compatibility.pairMeaning ? <small>{compatibility.pairMeaning.essence}</small> : null}
            </span>
          </div>
        </div>
        <div className={styles.detailBody}>
          <p>
            {compatibility.pairMeaning?.text ??
              "Сравнение строится по ключевым числам, матрицам и линиям силы двух участников."}
          </p>
          <div className={styles.comparisonList}>
            <span className={styles.kicker}>Линии матриц</span>
            {compatibility.strengthLineComparisons.map((line) => (
              <div className={styles.comparisonRow} key={line.code}>
                <span>{line.label}</span>
                <strong>{line.valueA}</strong>
                <small>·</small>
                <strong>{line.valueB}</strong>
              </div>
            ))}
          </div>
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
                disabled={isBusy}
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
