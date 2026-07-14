import type { NumerologyWorkspaceDetail } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";
import { NumerologyInterpretationEditor } from "./NumerologyInterpretationEditor";

export type DetailPanelProps = {
  readonly detail: NumerologyWorkspaceDetail | null;
  readonly interpretationText: string;
  readonly isCreatingAiDraft: boolean;
  readonly aiDraftErrorMessage: string | null;
  readonly isAiDraftDisabled: boolean;
  readonly aiDraftDisabledReason: string | null;
  readonly isApproveInterpretationDisabled: boolean;
  readonly isSaveInterpretationDisabled: boolean;
  readonly onInterpretationChange: (value: string) => void;
  readonly onSaveInterpretation: () => void;
  readonly onApproveInterpretation: () => void;
  readonly onCreateAiDraft: () => void;
};

export function DetailPanel({
  detail,
  interpretationText,
  isCreatingAiDraft,
  aiDraftErrorMessage,
  isAiDraftDisabled,
  aiDraftDisabledReason,
  isApproveInterpretationDisabled,
  isSaveInterpretationDisabled,
  onInterpretationChange,
  onSaveInterpretation,
  onApproveInterpretation,
  onCreateAiDraft
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
        <NumerologyInterpretationEditor
          text={interpretationText}
          placeholder="Введите трактовку для клиента"
          isCreatingAiDraft={isCreatingAiDraft}
          aiDraftErrorMessage={aiDraftErrorMessage}
          aiDraftDisabled={isAiDraftDisabled}
          aiDraftDisabledReason={aiDraftDisabledReason}
          saveDisabled={isSaveInterpretationDisabled}
          approveDisabled={isApproveInterpretationDisabled}
          onTextChange={onInterpretationChange}
          onCreateAiDraft={onCreateAiDraft}
          onSave={onSaveInterpretation}
          onApprove={onApproveInterpretation}
        />
      </div>
    </aside>
  );
}
