import type { NumerologyWorkspaceDetail } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";

export type DetailPanelProps = {
  readonly detail: NumerologyWorkspaceDetail | null;
  readonly interpretationText: string;
  readonly isBusy: boolean;
  readonly isApproveInterpretationDisabled: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
};

export function DetailPanel({
  detail,
  interpretationText,
  isBusy,
  isApproveInterpretationDisabled,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation
}: DetailPanelProps) {
  return (
    <aside className={styles.detailPanel} aria-label="Трактовка выбранного элемента">
      <div className={styles.detailHead}>
        <span className={styles.detailEyebrow}>{detail?.eyebrow ?? "выберите элемент"}</span>
        <div className={styles.detailTitleRow}>
          <span className={styles.detailValue}>{detail?.value ?? "—"}</span>
          <span>
            <strong>{detail?.title ?? "Нумерологический разбор"}</strong>
            {detail?.subtitle ? <small>{detail.subtitle}</small> : null}
          </span>
        </div>
      </div>
      <div className={styles.detailBody}>
        <p>{detail?.text ?? "Кликните число, ячейку матрицы или линию силы."}</p>
        {detail?.formula ? (
          <div className={styles.formulaBox}>
            <span>Как считается</span>
            <p>{detail.formula}</p>
          </div>
        ) : null}
        <div className={styles.manualInterpretation}>
          <span className={styles.kicker}>Ручная трактовка</span>
          <textarea
            value={interpretationText}
            onChange={(event) => onInterpretationChange(event.target.value)}
            placeholder="Введите ручную трактовку для клиента"
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
  );
}
