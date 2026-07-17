import type { NumerologyWorkspaceModel } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";
import { CompatibilityComparisonList } from "./CompatibilityComparisonList";
import { CompatibilityParticipants } from "./CompatibilityParticipants";
import { CompatibilitySummary } from "./CompatibilitySummary";
import { PythagoreanMatrix } from "./PythagoreanMatrix";
import { NumerologyInterpretationEditor } from "./NumerologyInterpretationEditor";

export type CompatibilityWorkspaceProps = {
  readonly model: NumerologyWorkspaceModel;
  readonly selectedSelector: string | null;
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
  readonly onSelect: (selector: string) => void;
};

export function CompatibilityWorkspace({
  model,
  selectedSelector,
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
  onCreateAiDraft,
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
            collapsedSelector={compatibility.conclusion.selector}
            onSelect={onSelect}
          />
          <CompatibilityComparisonList
            title="Психоматрица"
            ariaLabel="Сравнение психоматриц"
            comparisons={compatibility.matrixComparisons}
            selectedSelector={selectedSelector}
            collapsedSelector={compatibility.conclusion.selector}
            onSelect={onSelect}
          />
          <CompatibilityComparisonList
            title="Линии матриц"
            ariaLabel="Линии совместимости"
            comparisons={compatibility.strengthLineComparisons}
            selectedSelector={selectedSelector}
            collapsedSelector={compatibility.conclusion.selector}
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
          <NumerologyInterpretationEditor
            text={interpretationText}
            placeholder="Введите трактовку для пары"
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
    </>
  );
}
