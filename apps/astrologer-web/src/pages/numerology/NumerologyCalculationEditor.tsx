import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import { toClientOptionFromNumerologyParticipant } from "../../features/numerology/model/numerologyCompatibilityFlowModel";
import type {
  NumerologyFormState,
  NumerologyParticipantFormState
} from "../../features/numerology/model/numerologyFormModel";
import type { NumerologyEditorState } from "../../features/numerology/model/numerologySavedWorkspaceModel";
import styles from "./NumerologySavedWorkspace.module.css";

export type NumerologyCalculationEditorProps = {
  readonly editor: NumerologyEditorState;
  readonly errors: readonly string[];
  readonly isBusy: boolean;
  readonly onFormChange: (patch: Partial<NumerologyFormState>) => void;
  readonly onParticipantChange: (
    participantKey: "subject" | "partner",
    patch: Partial<NumerologyParticipantFormState>
  ) => void;
  readonly onSelectClient: (
    participantKey: "subject" | "partner",
    client: ClientSelectOption
  ) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
};

export function NumerologyCalculationEditor({
  editor,
  errors,
  isBusy,
  onFormChange,
  onParticipantChange,
  onSelectClient,
  onSubmit,
  onCancel
}: NumerologyCalculationEditorProps) {
  const isCompatibility = editor.form.mode === "compatibility";
  const actionLabel = isBusy
    ? editor.kind === "recalculate"
      ? "Пересчёт…"
      : "Расчёт…"
    : editor.kind === "recalculate"
      ? "Пересчитать"
      : "Рассчитать";

  return (
    <section className={styles.editor} aria-labelledby="numerology-editor-title">
      <div className={styles.editorHeader}>
        <div>
          <p className={styles.editorEyebrow}>Пифагорейская система</p>
          <h2 id="numerology-editor-title">
            {editor.kind === "recalculate" ? "Пересчитать сохранённый расчёт" : "Новый расчёт"}
          </h2>
        </div>
        <p>
          {editor.kind === "recalculate"
            ? "Текущий результат будет заменён без создания истории версий."
            : "Ручные участники используются только для текущего расчёта и не создают CRM-клиентов."}
        </p>
      </div>

      <div className={styles.editorFields}>
        {editor.kind === "recalculate" ? (
          <label className={styles.fieldWide}>
            <span>Название расчёта</span>
            <input
              aria-label="Название расчёта"
              value={editor.form.title}
              maxLength={200}
              disabled={isBusy}
              onChange={(event) => onFormChange({ title: event.currentTarget.value })}
            />
          </label>
        ) : null}
        <label className={styles.fieldWide}>
          <span>Тип расчёта</span>
          <select
            aria-label="Тип расчёта"
            value={editor.form.mode}
            disabled={isBusy}
            onChange={(event) =>
              onFormChange({
                mode: event.currentTarget.value as NumerologyFormState["mode"]
              })
            }
          >
            <option value="individual">Личный расчёт</option>
            <option value="compatibility">Совместимость</option>
          </select>
        </label>

        <NumerologyParticipantFields
          participantKey="subject"
          label="Клиент"
          participant={editor.form.subject}
          otherClientId={isCompatibility ? editor.form.partner.clientId : ""}
          disabled={isBusy}
          onChange={onParticipantChange}
          onSelectClient={onSelectClient}
        />
        {isCompatibility ? (
          <NumerologyParticipantFields
            participantKey="partner"
            label="Партнер"
            participant={editor.form.partner}
            otherClientId={editor.form.subject.clientId}
            disabled={isBusy}
            onChange={onParticipantChange}
            onSelectClient={onSelectClient}
          />
        ) : null}
      </div>

      {errors.length > 0 ? (
        <div className={styles.editorErrors} role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <div className={styles.editorActions}>
        <button type="button" className={styles.primaryAction} disabled={isBusy} onClick={onSubmit}>
          {actionLabel}
        </button>
        <button
          type="button"
          className={styles.secondaryAction}
          disabled={isBusy}
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </section>
  );
}

export type NumerologyParticipantFieldsProps = {
  readonly participantKey: "subject" | "partner";
  readonly label: "Клиент" | "Партнер";
  readonly participant: NumerologyParticipantFormState;
  readonly otherClientId: string;
  readonly disabled: boolean;
  readonly onChange: NumerologyCalculationEditorProps["onParticipantChange"];
  readonly onSelectClient: NumerologyCalculationEditorProps["onSelectClient"];
};

export function NumerologyParticipantFields({
  participantKey,
  label,
  participant,
  otherClientId,
  disabled,
  onChange,
  onSelectClient
}: NumerologyParticipantFieldsProps) {
  const lowerLabel = label === "Клиент" ? "клиента" : "партнера";
  return (
    <fieldset className={styles.participantGroup}>
      <legend>{label}</legend>
      <label>
        <span>Источник данных</span>
        <select
          aria-label={`Источник данных: ${lowerLabel}`}
          value={participant.source}
          disabled={disabled}
          onChange={(event) =>
            onChange(participantKey, {
              source: event.currentTarget.value as NumerologyParticipantFormState["source"]
            })
          }
        >
          <option value="manual">Ввести вручную</option>
          <option value="crm_client">Выбрать CRM-клиента</option>
        </select>
      </label>
      {participant.source === "crm_client" ? (
        <ClientSearchCombobox
          label={label}
          value={participant.clientId}
          selectedClient={toClientOptionFromNumerologyParticipant(participant)}
          excludeClientIds={otherClientId ? [otherClientId] : []}
          disabled={disabled}
          onSelect={(client) => onSelectClient(participantKey, client)}
        />
      ) : (
        <>
          <label>
            <span>Полное имя</span>
            <input
              aria-label={`Полное имя ${lowerLabel}`}
              value={participant.fullName}
              maxLength={200}
              disabled={disabled}
              onChange={(event) =>
                onChange(participantKey, {
                  fullName: event.currentTarget.value,
                  displayName: event.currentTarget.value
                })
              }
            />
          </label>
          <label>
            <span>Дата рождения</span>
            <input
              type="date"
              aria-label={`Дата рождения ${lowerLabel}`}
              value={participant.birthDate}
              disabled={disabled}
              onChange={(event) =>
                onChange(participantKey, { birthDate: event.currentTarget.value })
              }
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
