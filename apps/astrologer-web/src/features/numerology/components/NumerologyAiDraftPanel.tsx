import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { getLatestInterpretationText } from "../model/numerologyResultModel";
import styles from "./NumerologyComponents.module.css";

export type NumerologyAiDraftPanelProps = {
  readonly response: NumerologyCalculationResponse | null;
  readonly text: string;
  readonly isSaving: boolean;
  readonly isApproving: boolean;
  readonly onTextChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onApprove: () => void;
};

export function NumerologyAiDraftPanel({
  response,
  text,
  isSaving,
  isApproving,
  onTextChange,
  onSave,
  onApprove
}: NumerologyAiDraftPanelProps) {
  const savedText = getLatestInterpretationText(response);
  const latestInterpretation = response?.calculation.interpretations.at(-1) ?? null;

  return (
    <aside className={styles.aiPanel} aria-label="Трактовка">
      <div className={styles.panelBox}>
        <h2 className={styles.panelTitle}>Трактовка</h2>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Введите ручную трактовку для клиента"
          disabled={!response}
        />
        <div className={styles.buttonRow}>
          <button
            type="button"
            className="eh-button eh-button--primary"
            disabled={!response || !text.trim() || isSaving}
            onClick={onSave}
          >
            {isSaving ? "Сохраняем" : "Сохранить"}
          </button>
          <button
            type="button"
            className="eh-button eh-button--secondary"
            disabled={!latestInterpretation || latestInterpretation.status === "approved" || isApproving}
            onClick={onApprove}
          >
            {isApproving ? "Утверждаем" : "Утвердить"}
          </button>
        </div>
        {savedText ? <p className={styles.muted}>Сохранено: {savedText.slice(0, 80)}</p> : null}
      </div>
    </aside>
  );
}
