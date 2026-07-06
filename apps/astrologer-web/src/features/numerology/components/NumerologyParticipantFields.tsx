import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import {
  formatBirthDate,
  getClientInitials,
  type ClientSelectOption
} from "../../clients/model/clientSelectorModel";
import {
  createParticipantFormState,
  toClientParticipantFormState,
  type NumerologyFormState
} from "../model/numerologyFormModel";
import styles from "./NumerologyComponents.module.css";

export type NumerologyParticipantFieldsProps = {
  readonly label: string;
  readonly state: NumerologyFormState;
  readonly participantKey: "subject" | "partner";
  readonly onChange: (state: NumerologyFormState) => void;
};

export function NumerologyParticipantFields({
  label,
  state,
  participantKey,
  onChange
}: NumerologyParticipantFieldsProps) {
  const participant = state[participantKey];
  const selectedClient = toSelectedClientOption(participant);
  const update = (patch: Partial<typeof participant>) =>
    onChange({ ...state, [participantKey]: { ...participant, ...patch } });

  return (
    <fieldset className={styles.fieldGrid}>
      <legend className={styles.muted}>{label}</legend>
      <label className={styles.field}>
        Источник
        <select
          className={styles.select}
          value={participant.source}
          onChange={(event) => {
            const source = event.target.value as typeof participant.source;
            onChange({ ...state, [participantKey]: createParticipantFormState(source) });
          }}
        >
          <option value="manual">Вручную</option>
          <option value="crm_client">Клиент платформы</option>
        </select>
      </label>
      {participant.source === "crm_client" ? (
        <div className={styles.clientPickerField}>
          <ClientSearchCombobox
            label={label}
            value={participant.clientId}
            selectedClient={selectedClient}
            excludeClientIds={
              participantKey === "partner" && state.subject.clientId ? [state.subject.clientId] : []
            }
            onSelect={(option) => {
              onChange({
                ...state,
                [participantKey]: toClientParticipantFormState(option, participant)
              });
            }}
          />
        </div>
      ) : null}
      {participant.source === "crm_client" ? (
        <div className={styles.clientSummary}>
          <span>{selectedClient?.label ?? "Клиент не выбран"}</span>
          <strong>
            {selectedClient ? participant.birthDate || "Дата рождения не заполнена" : "Выберите клиента"}
          </strong>
          <small>{participant.birthPlaceText || selectedClient?.subtitle || "Профиль клиента"}</small>
        </div>
      ) : (
        <>
          <label className={styles.field}>
            Имя на экране
            <input
              className={styles.input}
              value={participant.displayName}
              onChange={(event) => update({ displayName: event.target.value })}
              placeholder="Мария"
            />
          </label>
          <label className={styles.field}>
            Полное имя
            <input
              className={styles.input}
              value={participant.fullName}
              onChange={(event) => update({ fullName: event.target.value })}
              placeholder="Мария Иванова"
            />
          </label>
          <label className={styles.field}>
            Дата рождения
            <input
              className={styles.input}
              type="date"
              value={participant.birthDate}
              onChange={(event) => update({ birthDate: event.target.value })}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}

function toSelectedClientOption(
  participant: NumerologyFormState["subject"]
): ClientSelectOption | null {
  if (!participant.clientId) return null;
  const label = participant.displayName || participant.fullName || "Клиент";
  const birthDateDisplay = formatBirthDate(participant.birthDate);
  const birthPlace = participant.birthPlaceText || participant.birthCity;

  return {
    value: participant.clientId,
    label,
    initials: getClientInitials(label),
    subtitle:
      [birthDateDisplay || participant.birthDate, birthPlace].filter(Boolean).join(" · ") ||
      "Дата рождения не заполнена",
    birthDateDisplay: birthDateDisplay || "—",
    hasBirthDate: Boolean(participant.birthDate),
    birthData: null
  };
}
