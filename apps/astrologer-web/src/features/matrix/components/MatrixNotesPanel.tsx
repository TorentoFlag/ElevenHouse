import { useState } from "react";
import type { MatrixNote } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import styles from "../../../pages/matrix/MatrixPage.module.css";

export function MatrixNotesPanel({
  calculationId,
  notes,
  draft,
  selectedNoteIds,
  isBusy,
  onDraftChange,
  onCreate,
  onToggleForReport,
  onUpdate,
  onDelete
}: {
  readonly calculationId: string;
  readonly notes: readonly MatrixNote[];
  readonly draft: string;
  readonly selectedNoteIds: readonly string[];
  readonly isBusy: boolean;
  readonly onDraftChange: (value: string) => void;
  readonly onCreate: () => void;
  readonly onToggleForReport: (noteId: string) => void;
  readonly onUpdate: (noteId: string, text: string) => void;
  readonly onDelete: (noteId: string) => void;
}) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  if (!calculationId) {
    return (
      <div className={styles.sideEmpty}>
        <h2>Заметки</h2>
        <p>Сначала привяжите расчёт к клиенту.</p>
      </div>
    );
  }

  return (
    <div className={styles.notesPanel}>
      <header>
        <span>Рабочие материалы</span>
        <h2>Личные заметки</h2>
        <p>Видны только вам. Отметьте записи, которые можно передать AI при подготовке отчёта.</p>
      </header>
      <div className={styles.noteComposer}>
        <textarea
          value={draft}
          maxLength={10_000}
          placeholder="Наблюдение по расчёту…"
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button type="button" disabled={isBusy || !draft.trim()} onClick={onCreate}>
          <Icon iconName="plus" width={14} height={14} />
          Добавить заметку
        </button>
      </div>
      <div className={styles.noteList}>
        {notes.length === 0 ? (
          <p className={styles.muted}>Заметок пока нет.</p>
        ) : (
          notes.map((note) => (
            <article className={note.stale ? styles.noteStale : styles.noteCard} key={note.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedNoteIds.includes(note.id)}
                  onChange={() => onToggleForReport(note.id)}
                />
                <span>Использовать в AI-отчёте</span>
              </label>
              {editingNoteId === note.id ? (
                <div className={styles.noteEditor}>
                  <textarea
                    value={editingText}
                    maxLength={10_000}
                    onChange={(event) => setEditingText(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={isBusy || !editingText.trim()}
                    onClick={() => {
                      onUpdate(note.id, editingText.trim());
                      setEditingNoteId(null);
                    }}
                  >
                    Сохранить
                  </button>
                  <button type="button" onClick={() => setEditingNoteId(null)}>
                    Отмена
                  </button>
                </div>
              ) : (
                <p>{note.text}</p>
              )}
              <footer>
                <time>{new Date(note.updatedAt).toLocaleDateString("ru-RU")}</time>
                {note.stale ? <span>От старой версии расчёта</span> : null}
                <button
                  type="button"
                  aria-label="Редактировать заметку"
                  disabled={isBusy}
                  onClick={() => {
                    setEditingNoteId(note.id);
                    setEditingText(note.text);
                  }}
                >
                  <Icon iconName="edit" width={14} height={14} />
                </button>
                <button
                  type="button"
                  aria-label="Удалить заметку"
                  disabled={isBusy}
                  onClick={() => onDelete(note.id)}
                >
                  <Icon iconName="trash" width={14} height={14} />
                </button>
              </footer>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
