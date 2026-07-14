import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { MatrixReportEditor } from "../model/matrixWorkspaceModel";
import styles from "../../../pages/matrix/MatrixPage.module.css";

const fields: ReadonlyArray<{ key: keyof MatrixReportEditor; label: string; rows: number }> = [
  { key: "overview", label: "Краткое резюме", rows: 3 },
  { key: "corePortrait", label: "Ядро личности", rows: 4 },
  { key: "strengthsAndTalents", label: "Сильные стороны и таланты", rows: 4 },
  { key: "growthAreas", label: "Зоны роста", rows: 4 },
  { key: "moneyAndRealization", label: "Деньги и реализация", rows: 4 },
  { key: "relationships", label: "Отношения", rows: 4 },
  { key: "lineageThemes", label: "Родовые темы", rows: 4 },
  { key: "purposes", label: "Предназначения", rows: 4 },
  { key: "yearProjection", label: "Прогноз на год", rows: 3 },
  { key: "reflectionQuestions", label: "Вопросы для размышления — по одному в строке", rows: 4 },
  { key: "practicalSteps", label: "Практические шаги — по одному в строке", rows: 4 },
  { key: "disclaimer", label: "Дисклеймер", rows: 3 }
];

export function MatrixReportPanel({
  calculationId,
  editor,
  isBusy,
  canSave,
  selectedNotesCount,
  message,
  onChange,
  onGenerate,
  onSave
}: {
  readonly calculationId: string;
  readonly editor: MatrixReportEditor;
  readonly isBusy: boolean;
  readonly canSave: boolean;
  readonly selectedNotesCount: number;
  readonly message: string | null;
  readonly onChange: (key: keyof MatrixReportEditor, value: string) => void;
  readonly onGenerate: () => void;
  readonly onSave: () => void;
}) {
  if (!calculationId)
    return (
      <div className={styles.sideEmpty}>
        <h2>Отчёт</h2>
        <p>Сначала привяжите расчёт к клиенту.</p>
      </div>
    );

  return (
    <div className={styles.reportPanel}>
      <header>
        <span>Клиентская версия</span>
        <h2>Отчёт по матрице</h2>
        <p>
          AI создаёт только черновик. Проверьте формулировки и явно отметьте готовность перед PDF.
        </p>
      </header>
      <div className={styles.reportActions}>
        <button type="button" className={styles.aiButton} disabled={isBusy} onClick={onGenerate}>
          <Icon iconName="sparkle" width={14} height={14} />
          AI-черновик{selectedNotesCount ? ` · заметок ${selectedNotesCount}` : ""}
        </button>
        <label className={styles.reportStatus}>
          Статус
          <select
            value={editor.status}
            onChange={(event) => onChange("status", event.target.value)}
          >
            <option value="draft">Черновик</option>
            <option value="ready">Готов к PDF</option>
          </select>
        </label>
      </div>
      {message ? <p className={styles.reportMessage}>{message}</p> : null}
      <div className={styles.reportFields}>
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            <textarea
              rows={field.rows}
              value={String(editor[field.key])}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className={styles.primaryButton}
        disabled={isBusy || !canSave}
        onClick={onSave}
      >
        <Icon iconName="check" width={14} height={14} />
        Сохранить отчёт
      </button>
    </div>
  );
}
